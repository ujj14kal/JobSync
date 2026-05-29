"""
Model Loader — downloads the latest trained JobSync AI from GitHub Releases.

Called once at backend startup. After download, all inference is local.

Flow:
  1. Check GitHub Releases API for latest model version
  2. Compare with locally cached version
  3. If newer: download zip, extract encoder.pt + scorer.pt + tokenizer.json
  4. Load into memory

The backend never calls GitHub during normal inference — only at startup
(or when /model/reload is called after a retrain).
"""
from __future__ import annotations

import io
import json
import os
import time
import zipfile
from pathlib import Path
from typing import Optional
import structlog

logger = structlog.get_logger()

GITHUB_REPO  = "ujj14kal/JobSync"
RELEASE_TAG  = "ai-model-latest"
MODELS_DIR   = Path(__file__).resolve().parent.parent.parent / "models"
CACHE_META   = MODELS_DIR / "downloaded_meta.json"
MODELS_DIR.mkdir(exist_ok=True)

REQUIRED_FILES = ["encoder.pt", "scorer.pt", "tokenizer.json"]


def _github_release_info() -> Optional[dict]:
    """Fetch latest release metadata from GitHub."""
    import urllib.request, urllib.error
    url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/tags/{RELEASE_TAG}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "JobSync-Backend", "Accept": "application/vnd.github.v3+json"})
        resp = urllib.request.urlopen(req, timeout=10)
        return json.loads(resp.read())
    except Exception as e:
        logger.warning("Could not fetch GitHub release info", error=str(e))
        return None


def _download_model(download_url: str) -> bool:
    """Download and extract model zip from GitHub Release asset."""
    import urllib.request
    try:
        logger.info("Downloading model from GitHub Release...", url=download_url)
        req = urllib.request.Request(download_url, headers={"User-Agent": "JobSync-Backend"})
        resp = urllib.request.urlopen(req, timeout=120)
        data = resp.read()
        logger.info("Download complete", size_mb=round(len(data)/1024/1024, 1))

        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            for name in zf.namelist():
                zf.extract(name, MODELS_DIR)
                logger.info("Extracted", file=name)
        return True
    except Exception as e:
        logger.error("Model download failed", error=str(e))
        return False


def _local_model_exists() -> bool:
    return all((MODELS_DIR / f).exists() for f in REQUIRED_FILES)


def _cached_trained_at() -> Optional[str]:
    if CACHE_META.exists():
        try:
            return json.loads(CACHE_META.read_text()).get("trained_at")
        except Exception:
            pass
    return None


def ensure_model_downloaded(force: bool = False) -> bool:
    """
    Ensure the latest model is available locally.

    Returns True if model is ready (either already there or freshly downloaded).
    """
    # Always use local if it exists and force=False
    if not force and _local_model_exists():
        logger.info("Model already cached locally — skipping download")
        return True

    # Check GitHub for latest
    release = _github_release_info()
    if not release:
        if _local_model_exists():
            logger.warning("Could not reach GitHub but local model exists — using local")
            return True
        logger.error("No model locally and GitHub unreachable")
        return False

    # Find the zip asset
    assets = release.get("assets", [])
    zip_asset = next((a for a in assets if a["name"].endswith(".zip")), None)
    if not zip_asset:
        logger.warning("No zip asset in release", release_tag=RELEASE_TAG)
        return _local_model_exists()

    # Check if our local model is already this version
    remote_trained_at = None
    try:
        body = release.get("body", "")
        meta = json.loads(body)
        remote_trained_at = meta.get("trained_at")
    except Exception:
        pass

    if not force and remote_trained_at and remote_trained_at == _cached_trained_at() and _local_model_exists():
        logger.info("Local model is up to date", trained_at=remote_trained_at)
        return True

    # Download
    success = _download_model(zip_asset["browser_download_url"])
    if success:
        # Save cache meta
        if remote_trained_at:
            CACHE_META.write_text(json.dumps({"trained_at": remote_trained_at, "downloaded_at": time.time()}))
        logger.info("Model updated from GitHub Release", trained_at=remote_trained_at)
    return success or _local_model_exists()


# ─── In-memory model instances ────────────────────────────────────────────────

_encoder   = None
_tokenizer = None
_scorer    = None
_loaded    = False


def load_models_into_memory() -> bool:
    """Load encoder, tokenizer, and scorer into memory from disk."""
    global _encoder, _tokenizer, _scorer, _loaded

    if not _local_model_exists():
        logger.warning("Model files not present — inference will use fallback")
        return False

    try:
        import torch

        import json, math, re
        import torch.nn as nn
        import torch.nn.functional as F

        # ── Load tokenizer (handles both {token:id} and {"token2id":{...}} formats)
        tok_path = MODELS_DIR / "tokenizer.json"
        raw = json.loads(tok_path.read_text())
        token2id = raw.get("token2id", raw)  # unwrap wrapper if present
        id2token = {v: k for k, v in token2id.items()}

        # Simple tokenizer compatible with kaggle_train.py format
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
            def get_attention_mask(self, ids):
                return [0 if i == self.PAD_ID else 1 for i in ids]

        _tokenizer = _Tokenizer(token2id)
        logger.info("Tokenizer loaded", vocab_size=_tokenizer.vocab_size)

        # ── Load encoder state and auto-detect architecture from weights
        enc_state = torch.load(MODELS_DIR / "encoder.pt", map_location="cpu", weights_only=True)
        # Detect emb_dim from embedding weight shape
        emb_key = [k for k in enc_state if "emb.weight" in k or "embedding.weight" in k]
        vocab_size_saved = enc_state[emb_key[0]].shape[0] if emb_key else _tokenizer.vocab_size
        emb_dim = enc_state[emb_key[0]].shape[1] if emb_key else 128
        # Detect n_layers from weight keys
        layer_keys = [k for k in enc_state if "layers." in k]
        n_layers = max([int(k.split("layers.")[1].split(".")[0]) for k in layer_keys], default=1) + 1 if layer_keys else 2
        n_heads = 4 if emb_dim <= 128 else 8
        ffn_dim = emb_dim * 2
        max_len = 64 if emb_dim <= 128 else 256

        # Build matching encoder architecture
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
                a=self.drop(F.softmax(a,dim=-1))
                return self.out((a@v).transpose(1,2).reshape(B,T,D))
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

        _encoder = _Encoder(vocab_size_saved, emb_dim, n_heads, n_layers, ffn_dim, max_len)
        _encoder.load_state_dict(enc_state)
        _encoder.eval()
        n_enc = sum(p.numel() for p in _encoder.parameters())
        logger.info("Encoder loaded", parameters=f"{n_enc:,}", emb_dim=emb_dim, layers=n_layers)

        # ── Load scorer — detect input dim from saved weights
        scr_state = torch.load(MODELS_DIR / "scorer.pt", map_location="cpu", weights_only=True)
        first_key = [k for k in scr_state if "trunk.0.weight" in k]
        inp_dim = scr_state[first_key[0]].shape[1] if first_key else emb_dim * 4 + 10

        class _Scorer(nn.Module):
            def __init__(self, inp):
                super().__init__()
                self.trunk = nn.Sequential(
                    nn.Linear(inp,512), nn.LayerNorm(512), nn.GELU(), nn.Dropout(0.25),
                    nn.Linear(512,256), nn.LayerNorm(256), nn.GELU(), nn.Dropout(0.2),
                )
                self.heads = nn.ModuleList([
                    nn.Sequential(nn.Linear(256,128), nn.GELU(), nn.Dropout(0.1),
                                  nn.Linear(128,64), nn.GELU(), nn.Linear(64,1), nn.Sigmoid())
                    for _ in range(5)
                ])
            def forward(self, x):
                s = self.trunk(x)
                return torch.cat([h(s)*100.0 for h in self.heads], dim=1)

        _scorer = _Scorer(inp_dim)
        _scorer.load_state_dict(scr_state)
        _scorer.eval()
        n_scr = sum(p.numel() for p in _scorer.parameters())
        logger.info("Scorer loaded", parameters=f"{n_scr:,}", input_dim=inp_dim)

        _loaded = True
        return True

    except Exception as e:
        logger.error("Failed to load models into memory", error=str(e))
        _loaded = False
        return False


def get_loaded_models():
    """Return (encoder, tokenizer, scorer) if loaded, else (None, None, None)."""
    return _encoder, _tokenizer, _scorer


def is_loaded() -> bool:
    return _loaded


def startup_load(force_download: bool = False) -> bool:
    """
    Called at app startup. Downloads model if needed, then loads into memory.
    Non-blocking: if it fails, the app still starts using rule-based fallback.
    """
    try:
        downloaded = ensure_model_downloaded(force=force_download)
        if downloaded:
            return load_models_into_memory()
        return False
    except Exception as e:
        logger.error("Startup model load failed (non-fatal)", error=str(e))
        return False
