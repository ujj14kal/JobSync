"""
Embedding service using sentence-transformers (local, free).
Model: all-MiniLM-L6-v2 — 384-dim, fast, good quality.
"""
from __future__ import annotations

import numpy as np
from typing import List, Union
from functools import lru_cache
from sentence_transformers import SentenceTransformer
from app.core.config import settings
import structlog

logger = structlog.get_logger()


@lru_cache(maxsize=1)
def _load_model() -> SentenceTransformer:
    """Load and cache the embedding model (loaded once at startup)."""
    logger.info("Loading sentence-transformer model", model=settings.EMBEDDING_MODEL)
    model = SentenceTransformer(settings.EMBEDDING_MODEL)
    logger.info("Embedding model loaded successfully")
    return model


def embed_text(text: str) -> List[float]:
    """Embed a single text string → list of floats."""
    if not text or not text.strip():
        return [0.0] * settings.EMBEDDING_DIMENSION

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
    """Compute cosine similarity between two vectors."""
    a = np.array(vec1)
    b = np.array(vec2)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(np.dot(a, b) / (norm_a * norm_b))


def semantic_score(text1: str, text2: str) -> float:
    """
    Returns semantic similarity between two texts as 0–100.
    """
    if not text1 or not text2:
        return 0.0

    model = _load_model()
    embs = model.encode([text1, text2], normalize_embeddings=True)
    sim = float(np.dot(embs[0], embs[1]))
    # Convert from [-1,1] to [0,100]
    return round(max(0.0, (sim + 1) / 2 * 100), 1)
