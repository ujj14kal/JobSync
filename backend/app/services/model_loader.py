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

        # Load tokenizer
        from app.services.custom_tokenizer import JobSyncTokenizer
        tok_path = MODELS_DIR / "tokenizer.json"
        _tokenizer = JobSyncTokenizer.load(tok_path)
        logger.info("Tokenizer loaded", vocab_size=_tokenizer.vocab_size)

        # Load encoder
        from app.services.custom_encoder import _build_encoder
        _encoder = _build_encoder(_tokenizer.vocab_size)
        enc_state = torch.load(MODELS_DIR / "encoder.pt", map_location="cpu", weights_only=True)
        _encoder.load_state_dict(enc_state)
        _encoder.eval()
        n_enc = sum(p.numel() for p in _encoder.parameters())
        logger.info("Encoder loaded", parameters=f"{n_enc:,}")

        # Load scorer — detect input dim from saved weights
        enc_out_dim = 256
        inp_dim = enc_out_dim * 4 + 10  # 1034
        scr_state = torch.load(MODELS_DIR / "scorer.pt", map_location="cpu", weights_only=True)
        # Detect actual input dim from first layer weights
        first_key = [k for k in scr_state if "trunk.0.weight" in k]
        if first_key:
            inp_dim = scr_state[first_key[0]].shape[1]

        from app.services.jobsync_neural_scorer import _build_model as _build_scorer_model
        _scorer = _build_scorer_model()
        # Try loading; if dim mismatch, rebuild with correct dim
        try:
            _scorer.load_state_dict(scr_state)
        except RuntimeError:
            # Rebuild with detected input dim
            import torch.nn as nn
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
