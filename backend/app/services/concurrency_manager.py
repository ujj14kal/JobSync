"""
Concurrency Manager — multi-user simultaneous analysis support.

Problem: An analysis pipeline takes 8-12 seconds. If 50 students hit
  "Analyze" simultaneously:
  - Without limits: all 50 pile onto sentence-transformers (CPU-bound),
    embedding service degrades, Groq hits rate limits, requests timeout.
  - With this manager: analysis slots are queued, each user gets fair access,
    and load is spread without OOM or rate-limit spikes.

Architecture:
  1. Global analysis slots semaphore   — hard cap on concurrent pipelines
  2. Per-user slot tracking             — one active analysis per user at a time
  3. Position-in-queue reporting        — frontend shows "You are #3 in queue"
  4. LLM sub-slots                      — separate, tighter cap for Groq calls
  5. Adaptive throttle                  — when Groq is at capacity, route to templates

Tunables (can be env-overridden):
  MAX_CONCURRENT_ANALYSES  = 8   (full pipeline slots)
  MAX_CONCURRENT_LLM_CALLS = 3   (Groq/Ollama slots)
  USER_ANALYSIS_TIMEOUT    = 120 (seconds before giving up)
"""
from __future__ import annotations

import asyncio
import time
from collections import defaultdict
from typing import Optional
import structlog

from app.core.config import settings

logger = structlog.get_logger()

# ─── Tunables ─────────────────────────────────────────────────────────────────

MAX_CONCURRENT_ANALYSES: int = int(getattr(settings, "MAX_CONCURRENT_ANALYSES", 8))
MAX_CONCURRENT_LLM_CALLS: int = int(getattr(settings, "MAX_CONCURRENT_LLM_CALLS", 3))
USER_ANALYSIS_TIMEOUT: float = float(getattr(settings, "USER_ANALYSIS_TIMEOUT", 120.0))
MAX_QUEUE_DEPTH: int = int(getattr(settings, "MAX_QUEUE_DEPTH", 50))  # reject when queue is this full

# ─── Shared semaphores ────────────────────────────────────────────────────────

# Analysis pipeline semaphore — CPU/memory bound work
_ANALYSIS_SEMAPHORE = asyncio.Semaphore(MAX_CONCURRENT_ANALYSES)

# LLM call semaphore — Groq rate limit aligned
_LLM_SEMAPHORE = asyncio.Semaphore(MAX_CONCURRENT_LLM_CALLS)

# ─── Queue tracking ────────────────────────────────────────────────────────────

# Tracks waiters: position counter, arrival timestamps
_queue_arrivals: list[float] = []   # timestamps of active waiters
_active_users: dict[str, float] = {}  # user_id → analysis start time
_active_count = 0

# ─── State helpers ────────────────────────────────────────────────────────────

def current_load() -> dict:
    """Return current concurrency state for status endpoints."""
    return {
        "active_analyses": MAX_CONCURRENT_ANALYSES - _ANALYSIS_SEMAPHORE._value,
        "max_analyses": MAX_CONCURRENT_ANALYSES,
        "active_llm_calls": MAX_CONCURRENT_LLM_CALLS - _LLM_SEMAPHORE._value,
        "max_llm_calls": MAX_CONCURRENT_LLM_CALLS,
        "queue_depth": len(_queue_arrivals),
        "utilization_pct": round(
            (MAX_CONCURRENT_ANALYSES - _ANALYSIS_SEMAPHORE._value) / MAX_CONCURRENT_ANALYSES * 100
        ),
    }


def estimated_wait_seconds() -> float:
    """
    Rough estimate of how long a new request would wait.
    Assumes ~10s average analysis time.
    """
    available = _ANALYSIS_SEMAPHORE._value
    if available > 0:
        return 0.0
    queue_depth = len(_queue_arrivals)
    avg_analysis_time = 10.0
    return (queue_depth / MAX_CONCURRENT_ANALYSES) * avg_analysis_time


# ─── Context managers ─────────────────────────────────────────────────────────

class AnalysisSlot:
    """
    Async context manager for an analysis pipeline slot.

    Usage:
        async with AnalysisSlot(user_id="user_123") as slot:
            if slot.position > 0:
                # Tell frontend: "You are #{slot.position} in queue"
            result = await run_pipeline(...)

    On __aenter__: waits for a free slot (respects timeout)
    On __aexit__: releases the slot immediately
    """

    def __init__(self, user_id: Optional[str] = None, timeout: float = USER_ANALYSIS_TIMEOUT):
        self.user_id = user_id or "anonymous"
        self.timeout = timeout
        self.position: int = 0       # position in queue when waiting
        self.wait_time: float = 0.0  # actual time waited
        self._acquired = False
        self._arrival = time.monotonic()

    async def __aenter__(self) -> "AnalysisSlot":
        # Reject if queue is already deep
        current_depth = len(_queue_arrivals)
        if current_depth >= MAX_QUEUE_DEPTH:
            raise ServiceOverloadError(
                f"Analysis queue is full ({current_depth} requests). Please try again in a minute."
            )

        # Track position
        _queue_arrivals.append(self._arrival)
        self.position = max(0, len(_queue_arrivals) - _ANALYSIS_SEMAPHORE._value)

        if self.position > 0:
            logger.info(
                "Analysis slot queued",
                user=self.user_id,
                position=self.position,
                est_wait=round(estimated_wait_seconds(), 1),
            )

        # Wait for semaphore with timeout
        try:
            await asyncio.wait_for(
                _ANALYSIS_SEMAPHORE.acquire(),
                timeout=self.timeout,
            )
        except asyncio.TimeoutError:
            _safe_remove(_queue_arrivals, self._arrival)
            raise AnalysisTimeoutError(
                f"Analysis slot timed out after {self.timeout}s. "
                f"Server is under high load — please try again."
            )

        _safe_remove(_queue_arrivals, self._arrival)
        self.wait_time = time.monotonic() - self._arrival
        self._acquired = True

        _active_users[self.user_id] = time.monotonic()
        logger.debug(
            "Analysis slot acquired",
            user=self.user_id,
            wait_ms=round(self.wait_time * 1000),
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._acquired:
            _ANALYSIS_SEMAPHORE.release()
            _active_users.pop(self.user_id, None)
            logger.debug("Analysis slot released", user=self.user_id)
        return False  # don't suppress exceptions


class LLMSlot:
    """
    Context manager for an LLM call slot.
    Use inside an AnalysisSlot to further bound Groq concurrency.

    Usage:
        async with LLMSlot():
            response = await groq_call(...)
    """

    def __init__(self, timeout: float = 90.0):
        self.timeout = timeout
        self._acquired = False

    async def __aenter__(self) -> "LLMSlot":
        try:
            await asyncio.wait_for(_LLM_SEMAPHORE.acquire(), timeout=self.timeout)
            self._acquired = True
        except asyncio.TimeoutError:
            raise LLMOverloadError(
                "LLM call timed out waiting for a slot — falling back to template feedback."
            )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._acquired:
            _LLM_SEMAPHORE.release()
        return False


# ─── Adaptive routing ─────────────────────────────────────────────────────────

def should_use_llm_for_feedback() -> bool:
    """
    Adaptive decision: use LLM only when LLM slots are available.

    When all LLM slots are busy (high load), route to template feedback.
    This prevents Groq rate-limit pileups during traffic spikes.
    """
    llm_free = _LLM_SEMAPHORE._value
    if llm_free == 0:
        logger.debug("LLM slots full — routing to template feedback")
        return False
    return True


def llm_load_pct() -> float:
    """Return LLM slot utilization 0.0–1.0."""
    used = MAX_CONCURRENT_LLM_CALLS - _LLM_SEMAPHORE._value
    return used / MAX_CONCURRENT_LLM_CALLS


# ─── Per-user deduplication ───────────────────────────────────────────────────

_user_analysis_lock: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)


async def acquire_user_lock(user_id: str, timeout: float = 5.0) -> bool:
    """
    Prevent the same user from submitting two analyses simultaneously.
    Returns True if acquired, False if already running.
    """
    lock = _user_analysis_lock[user_id]
    try:
        await asyncio.wait_for(lock.acquire(), timeout=timeout)
        return True
    except asyncio.TimeoutError:
        return False


def release_user_lock(user_id: str):
    lock = _user_analysis_lock.get(user_id)
    if lock and lock.locked():
        lock.release()


class UserAnalysisLock:
    """Context manager version of per-user analysis locking."""

    def __init__(self, user_id: str):
        self.user_id = user_id
        self._acquired = False

    async def __aenter__(self) -> "UserAnalysisLock":
        self._acquired = await acquire_user_lock(self.user_id)
        if not self._acquired:
            raise DuplicateAnalysisError(
                "You already have an analysis running. Please wait for it to complete."
            )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._acquired:
            release_user_lock(self.user_id)
        return False


# ─── Exceptions ───────────────────────────────────────────────────────────────

class ServiceOverloadError(Exception):
    """Raised when the analysis queue is full."""
    status_code = 503


class AnalysisTimeoutError(Exception):
    """Raised when waiting for a slot exceeds the timeout."""
    status_code = 503


class LLMOverloadError(Exception):
    """Raised when LLM slots are all busy — caller should use template fallback."""
    status_code = 503


class DuplicateAnalysisError(Exception):
    """Raised when same user submits concurrent analyses."""
    status_code = 429


# ─── Utility ──────────────────────────────────────────────────────────────────

def _safe_remove(lst: list, item):
    try:
        lst.remove(item)
    except ValueError:
        pass
