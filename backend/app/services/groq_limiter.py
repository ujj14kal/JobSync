"""
Groq API rate-limit manager.

Groq free tier (2025):
  - 30 requests / minute  (all models combined)
  - ~14,400 requests / day
  - llama-3.3-70b: ~6,000 TPM
  - llama-3.1-8b:  ~131,072 TPM

Strategy:
  1. Global asyncio semaphore → max 5 concurrent requests
  2. Token-bucket rate limiter → ≤ 25 req/min (headroom below 30)
  3. Exponential backoff on 429
  4. Prompt-hash in-memory cache (TTL = 1 h) → skip identical calls
  5. All services call groq_call() instead of client directly
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import time
from typing import Any, Callable, Coroutine, Optional
import structlog
from groq import AsyncGroq, RateLimitError, APIStatusError
from app.core.config import settings

logger = structlog.get_logger()

# ─── Global shared state ─────────────────────────────────────────────────────

# Max concurrent in-flight Groq requests across the whole process
_SEMAPHORE = asyncio.Semaphore(5)

# Simple token bucket: tracks timestamps of recent requests
_REQUEST_TIMESTAMPS: list[float] = []
_RATE_LIMIT_PER_MINUTE = 25          # stay 5 below the 30 RPM hard limit
_RATE_WINDOW = 60.0                  # seconds

# In-memory prompt → response cache  {hash: (response, expires_at)}
_CACHE: dict[str, tuple[Any, float]] = {}
_CACHE_TTL = 3600                    # 1 hour


# ─── Rate-bucket helpers ──────────────────────────────────────────────────────

def _bucket_can_proceed() -> bool:
    """Return True if we are below the per-minute rate limit."""
    now = time.monotonic()
    # Drop timestamps older than the window
    cutoff = now - _RATE_WINDOW
    while _REQUEST_TIMESTAMPS and _REQUEST_TIMESTAMPS[0] < cutoff:
        _REQUEST_TIMESTAMPS.pop(0)
    return len(_REQUEST_TIMESTAMPS) < _RATE_LIMIT_PER_MINUTE


async def _wait_for_bucket_slot():
    """Block until there is a slot in the token bucket."""
    while not _bucket_can_proceed():
        await asyncio.sleep(1.0)
    _REQUEST_TIMESTAMPS.append(time.monotonic())


# ─── Cache helpers ────────────────────────────────────────────────────────────

def _cache_key(model: str, messages: list[dict], **kwargs) -> str:
    payload = json.dumps(
        {"model": model, "messages": messages, **kwargs},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(payload.encode()).hexdigest()


def _cache_get(key: str) -> Optional[Any]:
    entry = _CACHE.get(key)
    if entry and time.monotonic() < entry[1]:
        return entry[0]
    if key in _CACHE:
        del _CACHE[key]
    return None


def _cache_set(key: str, value: Any):
    # Evict if cache is too large (>500 entries)
    if len(_CACHE) > 500:
        # Remove oldest 100 entries
        oldest = sorted(_CACHE.items(), key=lambda x: x[1][1])[:100]
        for k, _ in oldest:
            del _CACHE[k]
    _CACHE[key] = (value, time.monotonic() + _CACHE_TTL)


# ─── Main call wrapper ────────────────────────────────────────────────────────

async def groq_call(
    *,
    model: str,
    messages: list[dict],
    temperature: float = 0.2,
    max_tokens: int = 1200,
    json_mode: bool = True,
    use_cache: bool = True,
    cache_ttl: Optional[int] = None,
) -> str:
    """
    Single entry point for all Groq LLM calls.

    Features:
    - Semaphore limits concurrency
    - Token-bucket rate limiting
    - Prompt-hash cache
    - Automatic retry with exponential backoff on 429
    - Returns raw response content string
    """
    cache_key = _cache_key(model, messages, temperature=temperature, max_tokens=max_tokens)

    if use_cache:
        cached = _cache_get(cache_key)
        if cached is not None:
            logger.debug("Groq cache hit", key=cache_key[:12])
            return cached

    client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": temperature,
        "max_tokens": max_tokens,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    max_retries = 4
    delay = 2.0

    async with _SEMAPHORE:
        await _wait_for_bucket_slot()

        for attempt in range(max_retries):
            try:
                response = await client.chat.completions.create(**kwargs)
                content = response.choices[0].message.content

                if use_cache:
                    if cache_ttl:
                        # Override default TTL
                        _CACHE[cache_key] = (content, time.monotonic() + cache_ttl)
                    else:
                        _cache_set(cache_key, content)

                logger.debug(
                    "Groq call succeeded",
                    model=model,
                    tokens=response.usage.total_tokens if response.usage else "?",
                )
                return content

            except RateLimitError:
                if attempt == max_retries - 1:
                    logger.error("Groq rate limit exhausted after retries")
                    raise
                wait = delay * (2 ** attempt)
                logger.warning(
                    "Groq rate limited, backing off",
                    attempt=attempt + 1,
                    wait_seconds=wait,
                )
                await asyncio.sleep(wait)

            except APIStatusError as e:
                if e.status_code == 503:
                    # Groq overloaded — short wait
                    await asyncio.sleep(delay)
                    continue
                raise

    return ""  # unreachable but satisfies type checker
