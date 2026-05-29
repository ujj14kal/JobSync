"""
Embedding service — prefers fine-tuned JobSync model, falls back to base.

Model priority:
  1. backend/models/jobsync-embedder-v1/  (fine-tuned on resume-JD pairs, 768-dim)
  2. sentence-transformers/all-mpnet-base-v2  (stronger base, 768-dim)
  3. settings.EMBEDDING_MODEL  (all-MiniLM-L6-v2, 384-dim, original default)

The fine-tuned model understands career-specific semantics:
  "Kubernetes container orchestration" ≈ "k8s cluster management"
  "scaled microservices to 10M rps" >> "worked on distributed systems"
"""
from __future__ import annotations

import numpy as np
from pathlib import Path
from typing import List, Optional
from sentence_transformers import SentenceTransformer
from app.core.config import settings
import structlog

logger = structlog.get_logger()

FINE_TUNED_DIR = Path(__file__).resolve().parent.parent.parent / "models" / "jobsync-embedder-v1"
STRONG_BASE_MODEL = "sentence-transformers/all-mpnet-base-v2"

# Module-level cache — allow external code to invalidate (embedder_trainer does this)
_model_instance: Optional[SentenceTransformer] = None
_model_name_used: str = ""


def _load_model() -> SentenceTransformer:
    """Load model with priority: fine-tuned → strong base → config default."""
    global _model_instance, _model_name_used

    if _model_instance is not None:
        return _model_instance

    # 1. Try fine-tuned model
    if FINE_TUNED_DIR.exists() and (FINE_TUNED_DIR / "config.json").exists():
        try:
            logger.info("Loading fine-tuned JobSync embedder", path=str(FINE_TUNED_DIR))
            model = SentenceTransformer(str(FINE_TUNED_DIR))
            _model_instance = model
            _model_name_used = f"jobsync-embedder-v1 (fine-tuned from {STRONG_BASE_MODEL})"
            logger.info("Fine-tuned model loaded successfully")
            return model
        except Exception as e:
            logger.warning("Fine-tuned model load failed, trying base", error=str(e))

    # 2. Try strong base model
    try:
        logger.info("Loading strong base model", model=STRONG_BASE_MODEL)
        model = SentenceTransformer(STRONG_BASE_MODEL)
        _model_instance = model
        _model_name_used = STRONG_BASE_MODEL
        logger.info("Strong base model loaded")
        return model
    except Exception as e:
        logger.warning("Strong base model failed, using config default", error=str(e))

    # 3. Config default (all-MiniLM-L6-v2)
    logger.info("Loading config default model", model=settings.EMBEDDING_MODEL)
    model = SentenceTransformer(settings.EMBEDDING_MODEL)
    _model_instance = model
    _model_name_used = settings.EMBEDDING_MODEL
    return model


def get_model_info() -> dict:
    """Returns info about the currently loaded embedding model."""
    return {
        "model": _model_name_used or "not_loaded_yet",
        "fine_tuned": FINE_TUNED_DIR.exists(),
        "fine_tuned_path": str(FINE_TUNED_DIR) if FINE_TUNED_DIR.exists() else None,
    }


def embed_text(text: str) -> List[float]:
    """Embed a single text → list of floats (normalized)."""
    if not text or not text.strip():
        dim = _get_dim()
        return [0.0] * dim
    model = _load_model()
    embedding = model.encode(text, normalize_embeddings=True)
    return embedding.tolist()


def embed_texts(texts: List[str]) -> List[List[float]]:
    """Batch embed multiple texts."""
    if not texts:
        return []
    model = _load_model()
    embeddings = model.encode(texts, normalize_embeddings=True, batch_size=32)
    return embeddings.tolist()


def cosine_similarity(vec1: List[float], vec2: List[float]) -> float:
    """Compute cosine similarity [-1, 1]."""
    a = np.array(vec1, dtype=np.float32)
    b = np.array(vec2, dtype=np.float32)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def semantic_score(text1: str, text2: str) -> float:
    """Semantic similarity between two texts as 0-100."""
    if not text1 or not text2:
        return 0.0
    model = _load_model()
    embs = model.encode([text1, text2], normalize_embeddings=True)
    sim = float(np.dot(embs[0], embs[1]))
    return round(max(0.0, (sim + 1) / 2 * 100), 1)


def _get_dim() -> int:
    """Return embedding dimension for current model."""
    if _model_instance is not None:
        return _model_instance.get_sentence_embedding_dimension()
    if FINE_TUNED_DIR.exists():
        return 768  # all-mpnet-base-v2 dim
    if "mpnet" in settings.EMBEDDING_MODEL:
        return 768
    return settings.EMBEDDING_DIMENSION  # 384 for MiniLM
