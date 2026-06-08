"""
Model Loader — downloads the latest trained JobSync AI from GitHub Releases.

Supports two model formats:
  v1 (legacy): encoder.pt + scorer.pt + tokenizer.json (custom tokenizer dict)
  v2 (current): scorer.pt + tokenizer.json (type=minilm, uses sentence-transformers)

Flow:
  1. Check GitHub Releases API for latest model version
  2. Download zip if newer than local cache
  3. Detect format from tokenizer.json
  4. Load into memory — inference runs locally with zero API calls
"""
from __future__ import annotations

import io
import json
import math
import re
import time
import zipfile
from pathlib import Path
from typing import Optional
import structlog

logger = structlog.get_logger()

GITHUB_REPO = "ujj14kal/JobSync"
RELEASE_TAG = "ai-model-latest"
MODELS_DIR  = Path(__file__).resolve().parent.parent.parent / "models"
CACHE_META  = MODELS_DIR / "downloaded_meta.json"
MODELS_DIR.mkdir(exist_ok=True)

# v2 only needs scorer.pt + tokenizer.json (MiniLM downloaded by sentence-transformers)
# v1 also needed encoder.pt — kept for backward compat check
REQUIRED_FILES_V2 = ["scorer.pt", "tokenizer.json"]
REQUIRED_FILES_V1 = ["encoder.pt", "scorer.pt", "tokenizer.json"]


# ─── GitHub helpers ───────────────────────────────────────────────────────────

def _github_release_info() -> Optional[dict]:
    import urllib.request
    url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/tags/{RELEASE_TAG}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "JobSync-Backend",
                                                   "Accept": "application/vnd.github.v3+json"})
        resp = urllib.request.urlopen(req, timeout=10)
        return json.loads(resp.read())
    except Exception as e:
        logger.warning("Could not fetch GitHub release info", error=str(e))
        return None


def _download_model(download_url: str) -> bool:
    import urllib.request
    try:
        logger.info("Downloading model from GitHub Release...", url=download_url)
        req = urllib.request.Request(download_url, headers={"User-Agent": "JobSync-Backend"})
        resp = urllib.request.urlopen(req, timeout=120)
        data = resp.read()
        logger.info("Download complete", size_mb=round(len(data) / 1024 / 1024, 1))
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            for name in zf.namelist():
                zf.extract(name, MODELS_DIR)
                logger.info("Extracted", file=name)
        return True
    except Exception as e:
        logger.error("Model download failed", error=str(e))
        return False


def _local_model_exists() -> bool:
    v2 = all((MODELS_DIR / f).exists() for f in REQUIRED_FILES_V2)
    v1 = all((MODELS_DIR / f).exists() for f in REQUIRED_FILES_V1)
    return v2 or v1


def _cached_trained_at() -> Optional[str]:
    if CACHE_META.exists():
        try:
            return json.loads(CACHE_META.read_text()).get("trained_at")
        except Exception:
            pass
    return None


def ensure_model_downloaded(force: bool = False) -> bool:
    if not force and _local_model_exists():
        logger.info("Model already cached locally — skipping download")
        return True
    release = _github_release_info()
    if not release:
        if _local_model_exists():
            logger.warning("GitHub unreachable but local model exists — using local")
            return True
        logger.error("No model locally and GitHub unreachable")
        return False
    assets = release.get("assets", [])
    zip_asset = next((a for a in assets if a["name"].endswith(".zip")), None)
    if not zip_asset:
        logger.warning("No zip asset in release", release_tag=RELEASE_TAG)
        return _local_model_exists()
    remote_trained_at = None
    try:
        meta = json.loads(release.get("body", ""))
        remote_trained_at = meta.get("trained_at")
    except Exception:
        pass
    if not force and remote_trained_at and remote_trained_at == _cached_trained_at() and _local_model_exists():
        logger.info("Local model is up to date", trained_at=remote_trained_at)
        return True
    success = _download_model(zip_asset["browser_download_url"])
    if success and remote_trained_at:
        CACHE_META.write_text(json.dumps({"trained_at": remote_trained_at, "downloaded_at": time.time()}))
        logger.info("Model updated from GitHub Release", trained_at=remote_trained_at)
    return success or _local_model_exists()


# ─── In-memory state ──────────────────────────────────────────────────────────

_encoder        = None   # custom encoder (v1 only)
_tokenizer      = None   # custom tokenizer (v1 only)
_scorer         = None   # scorer head (both versions)
_sentence_model = None   # sentence-transformers model (v2 only)
_loaded         = False
_is_minilm      = False  # True when using v2 MiniLM architecture


def is_loaded() -> bool:
    return _loaded


def is_minilm() -> bool:
    return _is_minilm


def get_loaded_models():
    """Return (encoder, tokenizer, scorer) — legacy interface for v1. Returns Nones for v2."""
    return _encoder, _tokenizer, _scorer


def get_sentence_model():
    """Return the sentence-transformers model (v2 only). None if v1."""
    return _sentence_model


def get_scorer():
    return _scorer


# ─── Loader ───────────────────────────────────────────────────────────────────

def load_models_into_memory() -> bool:
    global _encoder, _tokenizer, _scorer, _sentence_model, _loaded, _is_minilm

    if not _local_model_exists():
        logger.warning("Model files not present — inference will use Groq fallback")
        return False

    try:
        import torch
        import torch.nn as nn
        import torch.nn.functional as F

        tok_path = MODELS_DIR / "tokenizer.json"
        tok_data = json.loads(tok_path.read_text())

        # ── Detect model version ──────────────────────────────────────────────
        if tok_data.get("type") == "minilm":
            return _load_v2_minilm(tok_data, torch, nn)
        else:
            return _load_v1_custom(tok_data, torch, nn, F)

    except Exception as e:
        logger.error("Failed to load models into memory", error=str(e))
        _loaded = False
        return False


def _load_v2_minilm(tok_data: dict, torch, nn) -> bool:
    """Load v2: MiniLM encoder (via sentence-transformers) + trained scorer head."""
    global _sentence_model, _scorer, _loaded, _is_minilm

    model_name = tok_data.get("model_name", "sentence-transformers/all-MiniLM-L6-v2")
    emb_dim    = tok_data.get("emb_dim", 384)
    inp_dim    = tok_data.get("input_dim", emb_dim * 4 + 10)

    logger.info("Loading v2 MiniLM model", model_name=model_name)

    try:
        from sentence_transformers import SentenceTransformer
        _sentence_model = SentenceTransformer(model_name)
        _sentence_model.eval()
        logger.info("MiniLM loaded", model=model_name, emb_dim=emb_dim)
    except Exception as e:
        logger.error("Failed to load sentence-transformers model", error=str(e))
        return False

    # Load scorer head — auto-detect architecture from weights
    scr_state = torch.load(MODELS_DIR / "scorer.pt", map_location="cpu", weights_only=True)
    first_key = [k for k in scr_state if "trunk.0.weight" in k]
    actual_inp = scr_state[first_key[0]].shape[1] if first_key else inp_dim

    # Detect trunk depth from weight keys
    trunk_keys = sorted(k for k in scr_state if k.startswith("trunk.") and "weight" in k)
    trunk_layers = []
    i = 0
    while True:
        w_key = f"trunk.{i}.weight"
        if w_key not in scr_state:
            break
        out_dim = scr_state[w_key].shape[0]
        trunk_layers.extend([nn.Linear(actual_inp if i == 0 else prev_dim, out_dim),
                              nn.LayerNorm(out_dim), nn.GELU(), nn.Dropout(0.25)])
        prev_dim = out_dim
        i += 3  # Linear, LayerNorm, GELU, Dropout = 4 items but only Linear has weight
        # advance past LayerNorm
        while f"trunk.{i}.weight" not in scr_state and i < 20:
            i += 1

    # Auto-detect architecture from saved weights
    # Supports both v2-large (768/384/192) and v2-small (256/128) architectures
    trunk_linear_keys = sorted([k for k in scr_state if k.startswith("trunk.") and k.endswith(".weight")])
    trunk_dims = [scr_state[k].shape for k in trunk_linear_keys]
    head_hidden = scr_state["heads.0.0.weight"].shape[1] if "heads.0.0.weight" in scr_state else 128

    class _Scorer(nn.Module):
        def __init__(self, inp, dims, hh):
            super().__init__()
            layers = []
            in_d = inp
            for out_d in dims:
                layers += [nn.Linear(in_d, out_d), nn.LayerNorm(out_d), nn.GELU(), nn.Dropout(0.3)]
                in_d = out_d
            self.trunk = nn.Sequential(*layers)
            self.heads = nn.ModuleList([
                nn.Sequential(nn.Linear(hh, 32), nn.GELU(), nn.Linear(32, 1), nn.Sigmoid())
                for _ in range(5)
            ])
        def forward(self, x):
            s = self.trunk(x)
            return torch.cat([h(s) * 100.0 for h in self.heads], dim=1)

    hidden_dims = [shape[0] for shape in trunk_dims]
    _scorer = _Scorer(actual_inp, hidden_dims, head_hidden)
    try:
        _scorer.load_state_dict(scr_state, strict=False)
    except Exception:
        # Hard fallback: small architecture
        _scorer = _Scorer(actual_inp, [256, 128], 128)
        _scorer.load_state_dict(scr_state, strict=False)
    _scorer.eval()
    n_scr = sum(p.numel() for p in _scorer.parameters())
    logger.info("v2 Scorer loaded", parameters=f"{n_scr:,}", input_dim=actual_inp)

    _is_minilm = True
    _loaded    = True
    return True


def _load_v1_custom(tok_data: dict, torch, nn, F) -> bool:
    """Load v1: custom tokenizer + custom transformer encoder + scorer head."""
    global _encoder, _tokenizer, _scorer, _loaded, _is_minilm

    # Build tokenizer
    token2id = tok_data.get("token2id", tok_data)

    class _Tokenizer:
        PAD_ID, UNK_ID, CLS_ID, SEP_ID = 0, 1, 2, 3
        def __init__(self, t2i):
            self.token2id = t2i; self.vocab_size = len(t2i)
        def _split(self, t):
            s = re.sub(r"([a-z])([A-Z])", r"\1 \2", t)
            return [p.lower() for p in re.split(r"[_\-/\.\s]+", s) if p]
        def encode(self, text, ml=64):
            text = re.sub(r"[^\w\s\-/\.]", " ", text.lower())
            tokens = []
            for raw in re.sub(r"\s+", " ", text).strip().split():
                for p in self._split(raw):
                    if p and (p.isalpha() or p.isnumeric()): tokens.append(p)
            ids = [self.token2id.get(t, self.UNK_ID) for t in tokens]
            ids = [self.CLS_ID] + ids[:ml-2] + [self.SEP_ID] + [self.PAD_ID]*(ml-min(len(ids),ml-2)-2)
            return ids[:ml]
        def mask(self, ids):
            return [0 if i == self.PAD_ID else 1 for i in ids]

    _tokenizer = _Tokenizer(token2id)
    logger.info("v1 Tokenizer loaded", vocab_size=_tokenizer.vocab_size)

    # Load encoder
    enc_path = MODELS_DIR / "encoder.pt"
    if not enc_path.exists():
        logger.warning("encoder.pt missing for v1 model — cannot load")
        return False

    enc_state = torch.load(enc_path, map_location="cpu", weights_only=True)
    emb_key   = [k for k in enc_state if "emb.weight" in k or "embedding.weight" in k]
    vocab_sz  = enc_state[emb_key[0]].shape[0] if emb_key else _tokenizer.vocab_size
    emb_dim   = enc_state[emb_key[0]].shape[1] if emb_key else 128
    lkeys     = [k for k in enc_state if "layers." in k]
    n_layers  = max([int(k.split("layers.")[1].split(".")[0]) for k in lkeys], default=1) + 1 if lkeys else 2
    n_heads   = 4 if emb_dim <= 128 else 8
    ffn_dim   = emb_dim * 2
    max_len   = 64 if emb_dim <= 128 else 256

    class _PE(nn.Module):
        def __init__(self, d, ml, drop=0.1):
            super().__init__(); self.drop = nn.Dropout(drop)
            pe = torch.zeros(ml, d); pos = torch.arange(ml).unsqueeze(1).float()
            div = torch.exp(torch.arange(0,d,2).float()*(-math.log(10000.)/d))
            pe[:,0::2]=torch.sin(pos*div); pe[:,1::2]=torch.cos(pos*div)
            self.register_buffer("pe", pe.unsqueeze(0))
        def forward(self, x): return self.drop(x + self.pe[:,:x.size(1)])

    class _MHSA(nn.Module):
        def __init__(self, d, h, drop=0.1):
            super().__init__(); self.h=h; self.hd=d//h
            self.qkv=nn.Linear(d,3*d,bias=False); self.out=nn.Linear(d,d)
            self.drop=nn.Dropout(drop); self.scale=math.sqrt(self.hd)
        def forward(self, x, mask=None):
            B,T,D=x.shape; q,k,v=self.qkv(x).chunk(3,dim=-1)
            def sp(t): return t.view(B,T,self.h,self.hd).transpose(1,2)
            q,k,v=sp(q),sp(k),sp(v); a=(q@k.transpose(-2,-1))/self.scale
            if mask is not None: a=a.masked_fill(mask.unsqueeze(1).unsqueeze(2)==0,float("-inf"))
            return self.out((self.drop(F.softmax(a,dim=-1))@v).transpose(1,2).reshape(B,T,D))

    class _FFN(nn.Module):
        def __init__(self, d, fd, drop=0.1):
            super().__init__()
            self.net=nn.Sequential(nn.Linear(d,fd),nn.GELU(),nn.Dropout(drop),nn.Linear(fd,d),nn.Dropout(drop))
        def forward(self, x): return self.net(x)

    class _TxL(nn.Module):
        def __init__(self, d, h, fd, drop=0.1):
            super().__init__(); self.n1=nn.LayerNorm(d); self.n2=nn.LayerNorm(d)
            self.a=_MHSA(d,h,drop); self.f=_FFN(d,fd,drop)
        def forward(self, x, mask=None):
            x=x+self.a(self.n1(x),mask); x=x+self.f(self.n2(x)); return x

    class _Encoder(nn.Module):
        def __init__(self, vs, d, h, nl, fd, ml, drop=0.1):
            super().__init__(); self.emb=nn.Embedding(vs,d,padding_idx=0)
            self.pe=_PE(d,ml,drop); self.layers=nn.ModuleList([_TxL(d,h,fd,drop) for _ in range(nl)])
            self.norm=nn.LayerNorm(d)
        def forward(self, ids, mask=None):
            x=self.pe(self.emb(ids))
            for l in self.layers: x=l(x,mask)
            x=self.norm(x)
            if mask is not None:
                m=mask.unsqueeze(-1).float(); x=(x*m).sum(1)/m.sum(1).clamp(min=1e-8)
            else: x=x.mean(1)
            return F.normalize(x,p=2,dim=-1)

    _encoder = _Encoder(vocab_sz, emb_dim, n_heads, n_layers, ffn_dim, max_len)
    _encoder.load_state_dict(enc_state); _encoder.eval()
    logger.info("v1 Encoder loaded", emb_dim=emb_dim, layers=n_layers)

    # Load scorer
    scr_state = torch.load(MODELS_DIR / "scorer.pt", map_location="cpu", weights_only=True)
    first_key = [k for k in scr_state if "trunk.0.weight" in k]
    inp_dim   = scr_state[first_key[0]].shape[1] if first_key else emb_dim * 4 + 10

    class _Scorer(nn.Module):
        def __init__(self, inp):
            super().__init__()
            self.trunk = nn.Sequential(
                nn.Linear(inp,512), nn.LayerNorm(512), nn.GELU(), nn.Dropout(0.25),
                nn.Linear(512,256), nn.LayerNorm(256), nn.GELU(), nn.Dropout(0.2),
            )
            self.heads = nn.ModuleList([
                nn.Sequential(nn.Linear(256,128),nn.GELU(),nn.Dropout(0.1),
                              nn.Linear(128,64),nn.GELU(),nn.Linear(64,1),nn.Sigmoid())
                for _ in range(5)
            ])
        def forward(self, x):
            s = self.trunk(x)
            return torch.cat([h(s)*100.0 for h in self.heads], dim=1)

    _scorer = _Scorer(inp_dim); _scorer.load_state_dict(scr_state); _scorer.eval()
    logger.info("v1 Scorer loaded", input_dim=inp_dim)

    _is_minilm = False
    _loaded    = True
    return True


def startup_load(force_download: bool = False) -> bool:
    try:
        if ensure_model_downloaded(force=force_download):
            return load_models_into_memory()
        return False
    except Exception as e:
        logger.error("Startup model load failed (non-fatal)", error=str(e))
        return False
