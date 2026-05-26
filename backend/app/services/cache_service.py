"""
Multi-layer cache service.

Layer 1: In-memory TTL dict (hot, fast, process-local)
Layer 2: Supabase (persistent across restarts, shared across instances)

Used for:
- Analysis deduplication (resume_id + job_id → analysis_id)
- Per-user daily quota tracking
- Embedding short-circuit (avoid re-embedding unchanged text)
"""
from __future__ import annotations

import hashlib
import time
from typing import Optional
import structlog
from app.db.supabase_client import get_supabase

logger = structlog.get_logger()

# ─── In-memory store ─────────────────────────────────────────────────────────
_MEM: dict[str, tuple[object, float]] = {}


def _mem_get(key: str) -> Optional[object]:
    entry = _MEM.get(key)
    if entry and time.monotonic() < entry[1]:
        return entry[0]
    if key in _MEM:
        del _MEM[key]
    return None


def _mem_set(key: str, value: object, ttl: float):
    if len(_MEM) > 1000:
        # Evict expired entries
        now = time.monotonic()
        expired = [k for k, (_, exp) in _MEM.items() if exp < now]
        for k in expired[:200]:
            del _MEM[k]
    _MEM[key] = (value, time.monotonic() + ttl)


# ─── Analysis deduplication ──────────────────────────────────────────────────

def make_analysis_hash(resume_id: str, job_id: str) -> str:
    return hashlib.sha256(f"{resume_id}:{job_id}".encode()).hexdigest()[:16]


async def get_cached_analysis(resume_id: str, job_id: str) -> Optional[str]:
    """
    Return existing completed analysis_id if this exact resume+job pair
    was already analysed, else None.
    """
    key = f"analysis:{make_analysis_hash(resume_id, job_id)}"

    # Memory layer
    cached = _mem_get(key)
    if cached:
        return str(cached)

    # DB layer
    supabase = get_supabase()
    try:
        result = (
            supabase.table("analyses")
            .select("id, status")
            .eq("resume_id", resume_id)
            .eq("job_id", job_id)
            .eq("status", "complete")
            .order("created_at", desc=True)
            .limit(1)
            .execute()
        )
        if result.data:
            analysis_id = result.data[0]["id"]
            _mem_set(key, analysis_id, 3600)  # 1 h mem cache
            return analysis_id
    except Exception as e:
        logger.warning("Dedup DB lookup failed", error=str(e))

    return None


# ─── Per-user daily quota ─────────────────────────────────────────────────────

MAX_ANALYSES_PER_DAY = 10  # generous but safe for free-tier


async def get_user_analyses_today(user_id: str) -> int:
    """Count how many analyses this user has run today (UTC)."""
    key = f"quota:{user_id}"
    cached = _mem_get(key)
    if cached is not None:
        return int(cached)  # type: ignore

    supabase = get_supabase()
    try:
        from datetime import datetime, timezone
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        result = (
            supabase.table("analyses")
            .select("id", count="exact")
            .eq("user_id", user_id)
            .gte("created_at", f"{today}T00:00:00Z")
            .execute()
        )
        count = result.count or 0
        _mem_set(key, count, 300)  # cache for 5 min
        return count
    except Exception:
        return 0


def increment_user_quota_cache(user_id: str):
    """Optimistically increment in-memory counter when an analysis starts."""
    key = f"quota:{user_id}"
    cached = _mem_get(key)
    current = int(cached) if cached is not None else 0
    _mem_set(key, current + 1, 300)
