"""
Global active-analysis tracker.

Tracks how many full ATS analyses are currently in-flight across all users.
When MAX_CONCURRENT_ANALYSES slots are occupied, new requests receive HTTP 503
until a slot opens up (analysis completes, fails, or auto-expires).

Design rationale
────────────────
Groq free tier: 30 RPM / ~6 000 TPM (70b).
Each analysis fires 2 Groq calls (recruiter feedback + bullet rewrites).
At 5 concurrent analyses ≤ 10 queued calls, all pipelined through the
asyncio Semaphore(5) in groq_limiter → ≤ 20 RPM in steady state.
Keeping MAX_CONCURRENT_ANALYSES ≤ 5 leaves comfortable head-room.

Thread / coroutine safety
──────────────────────────
All mutations happen inside the asyncio event loop (cooperative multitasking),
so no explicit locking is needed for the dict. GIL protects against preemptive
threading issues.

Auto-expiry
───────────
Slots expire after SESSION_TIMEOUT seconds so a crashed background task never
permanently blocks new users. The expiry is checked lazily on every read.
"""
from __future__ import annotations

import time
import structlog
from dataclasses import dataclass, field

logger = structlog.get_logger()

# ── Config ────────────────────────────────────────────────────────────────────

SESSION_TIMEOUT: int = 300  # seconds — auto-release stale slots after 5 min


# ── Internal data model ───────────────────────────────────────────────────────

@dataclass
class _Slot:
    user_id: str
    analysis_id: str
    started_at: float = field(default_factory=time.monotonic)


# ── Module-level state (single process; reset on restart) ─────────────────────

_slots: dict[str, _Slot] = {}  # keyed by analysis_id
_max_slots: int = 5             # overridden by configure() at app startup


# ── Setup ─────────────────────────────────────────────────────────────────────

def configure(max_slots: int) -> None:
    """Call once at startup (e.g. from lifespan) to set the capacity ceiling."""
    global _max_slots
    _max_slots = max(1, max_slots)
    logger.info("Active tracker configured", max_concurrent_analyses=_max_slots)


# ── Internal helpers ──────────────────────────────────────────────────────────

def _evict_expired() -> None:
    """Remove slots whose background tasks never called release() (crash guard)."""
    now = time.monotonic()
    expired = [
        aid for aid, s in _slots.items()
        if now - s.started_at > SESSION_TIMEOUT
    ]
    for aid in expired:
        logger.warning(
            "Auto-releasing expired analysis slot",
            analysis_id=aid,
            age_s=round(now - _slots[aid].started_at),
        )
        del _slots[aid]


# ── Public API ────────────────────────────────────────────────────────────────

def capacity_info() -> dict:
    """
    Return a snapshot of current capacity.
    Evicts expired slots first, so the numbers are always fresh.
    Called by the /analysis/status polling endpoint.
    """
    _evict_expired()
    active = len(_slots)
    available = max(0, _max_slots - active)
    return {
        "active_analyses": active,
        "max_concurrent": _max_slots,
        "slots_available": available,
        "at_capacity": active >= _max_slots,
        "utilization_pct": round(active / _max_slots * 100) if _max_slots else 0,
        # Expose per-slot info (no PII — only analysis_id + age)
        "slots": [
            {
                "analysis_id": s.analysis_id,
                "running_for_s": round(time.monotonic() - s.started_at),
            }
            for s in _slots.values()
        ],
    }


def try_acquire(user_id: str, analysis_id: str) -> bool:
    """
    Attempt to claim a slot for this analysis.

    Returns True  → slot acquired, analysis may proceed.
    Returns False → at capacity, caller should return HTTP 503.
    """
    _evict_expired()
    if len(_slots) >= _max_slots:
        logger.info(
            "Slot denied — at capacity",
            user_id=user_id,
            active=len(_slots),
            max=_max_slots,
        )
        return False

    _slots[analysis_id] = _Slot(user_id=user_id, analysis_id=analysis_id)
    logger.info(
        "Analysis slot acquired",
        analysis_id=analysis_id,
        active=len(_slots),
        max=_max_slots,
    )
    return True


def release(analysis_id: str) -> None:
    """
    Release the slot when an analysis finishes (success or failure).
    Idempotent — safe to call even if the slot was already auto-evicted.
    """
    slot = _slots.pop(analysis_id, None)
    if slot is not None:
        duration = round(time.monotonic() - slot.started_at, 1)
        logger.info(
            "Analysis slot released",
            analysis_id=analysis_id,
            duration_s=duration,
            active=len(_slots),
        )
