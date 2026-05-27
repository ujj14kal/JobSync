"""
Local Inference Service — Ollama-first, Groq fallback.

Priority chain for LLM inference:
  1. Ollama (local, free, unlimited)     → sub-100ms on GPU, ~2-5s on CPU
  2. Groq API (cloud fallback)           → only if Ollama unavailable
  3. Template feedback                   → last resort, always works

Supported Ollama models (in preference order):
  - llama3.2:3b-instruct-q8_0           (fast, 2GB VRAM)
  - llama3.2:1b-instruct-q8_0           (ultra-fast, 1GB VRAM)
  - mistral:7b-instruct-q4_0            (quality/speed balance)
  - phi3:mini                            (smallest, good quality)

Automatic model selection:
  - Recruiter feedback    → larger model (quality matters)
  - Bullet rewrites       → smallest model (structured task)

Setup (users self-host, we call their local endpoint):
  1. brew install ollama
  2. ollama pull llama3.2:3b-instruct-q8_0
  3. Set OLLAMA_BASE_URL=http://localhost:11434 in .env (default)
     OR point to any shared Ollama instance on the LAN

Cloud deployment note:
  On Railway/Render the Ollama URL will be empty/unreachable,
  so this service auto-falls back to Groq.
"""
from __future__ import annotations

import asyncio
import json
import time
from typing import Any, Optional
import httpx
import structlog

from app.core.config import settings
from app.services.groq_limiter import groq_call

logger = structlog.get_logger()

# ─── Config ───────────────────────────────────────────────────────────────────

OLLAMA_BASE_URL: str = getattr(settings, "OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_TIMEOUT_SECS: float = 120.0  # model inference timeout
OLLAMA_CONNECT_TIMEOUT: float = 2.0  # fast fail if Ollama not running

# Model preferences: task → (quality_model, fast_model)
_OLLAMA_MODELS = {
    "quality": ["llama3.2:3b-instruct-q8_0", "mistral:7b-instruct-q4_0", "llama3.2", "phi3:mini", "llama2"],
    "fast":    ["llama3.2:1b-instruct-q8_0", "llama3.2:3b-instruct-q8_0", "phi3:mini", "llama3.2"],
}

# Ollama availability cache — avoids probing on every call
_ollama_available: Optional[bool] = None
_ollama_available_until: float = 0.0
_OLLAMA_PROBE_TTL: float = 60.0  # re-probe every 60s

_ollama_available_models: list[str] = []


# ─── Availability probe ───────────────────────────────────────────────────────

async def _probe_ollama() -> tuple[bool, list[str]]:
    """Return (is_available, [available_model_names])."""
    try:
        async with httpx.AsyncClient(
            base_url=OLLAMA_BASE_URL,
            timeout=httpx.Timeout(OLLAMA_CONNECT_TIMEOUT),
        ) as client:
            resp = await client.get("/api/tags")
            if resp.status_code == 200:
                data = resp.json()
                models = [m["name"] for m in data.get("models", [])]
                logger.info("Ollama available", models=models)
                return True, models
    except Exception as e:
        logger.debug("Ollama not available", error=str(e))
    return False, []


async def is_ollama_available() -> bool:
    """Cached availability check — probes at most every 60s."""
    global _ollama_available, _ollama_available_until, _ollama_available_models
    now = time.monotonic()
    if _ollama_available is not None and now < _ollama_available_until:
        return _ollama_available

    available, models = await _probe_ollama()
    _ollama_available = available
    _ollama_available_models = models
    _ollama_available_until = now + _OLLAMA_PROBE_TTL
    return available


def _pick_ollama_model(tier: str = "quality") -> Optional[str]:
    """Select the best available Ollama model for the given tier."""
    preferred = _OLLAMA_MODELS.get(tier, _OLLAMA_MODELS["quality"])
    for candidate in preferred:
        # Exact match
        if candidate in _ollama_available_models:
            return candidate
        # Prefix match (e.g. "llama3.2" matches "llama3.2:latest")
        for available in _ollama_available_models:
            if available.startswith(candidate.split(":")[0]):
                return available
    # Fallback: first available
    return _ollama_available_models[0] if _ollama_available_models else None


# ─── Ollama call ──────────────────────────────────────────────────────────────

async def _ollama_call(
    prompt: str,
    model: Optional[str] = None,
    temperature: float = 0.2,
    max_tokens: int = 1800,
    json_mode: bool = True,
    tier: str = "quality",
) -> Optional[str]:
    """
    Call Ollama /api/generate with streaming disabled.
    Returns content string or None on failure.
    """
    if model is None:
        model = _pick_ollama_model(tier)
    if model is None:
        logger.warning("No Ollama model available")
        return None

    payload: dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    }

    if json_mode:
        payload["format"] = "json"

    try:
        async with httpx.AsyncClient(
            base_url=OLLAMA_BASE_URL,
            timeout=httpx.Timeout(OLLAMA_TIMEOUT_SECS, connect=OLLAMA_CONNECT_TIMEOUT),
        ) as client:
            t0 = time.monotonic()
            resp = await client.post("/api/generate", json=payload)
            elapsed = time.monotonic() - t0

            if resp.status_code == 200:
                data = resp.json()
                content = data.get("response", "").strip()
                logger.info(
                    "Ollama call succeeded",
                    model=model,
                    elapsed_ms=round(elapsed * 1000),
                    chars=len(content),
                )
                return content
            else:
                logger.warning("Ollama call failed", status=resp.status_code, body=resp.text[:200])
                return None

    except asyncio.TimeoutError:
        logger.warning("Ollama call timed out", model=model, timeout=OLLAMA_TIMEOUT_SECS)
        return None
    except Exception as e:
        logger.error("Ollama call error", error=str(e))
        return None


# ─── Main inference interface ─────────────────────────────────────────────────

async def llm_call(
    *,
    prompt: str,
    temperature: float = 0.2,
    max_tokens: int = 1800,
    json_mode: bool = True,
    tier: str = "quality",       # "quality" | "fast"
    use_cache: bool = True,
    cache_ttl: int = 7200,
    groq_model: Optional[str] = None,  # only used for Groq fallback
    groq_fast_model: Optional[str] = None,
) -> str:
    """
    Unified LLM call with Ollama-first, Groq-fallback strategy.

    Usage (replaces all direct groq_call() invocations):
        result = await llm_call(prompt=prompt, max_tokens=1800, tier="quality")

    Returns the raw response string.
    Raises RuntimeError if all providers fail.
    """
    # 1. Try Ollama
    if await is_ollama_available():
        ollama_tier = "quality" if tier == "quality" else "fast"
        content = await _ollama_call(
            prompt=prompt,
            temperature=temperature,
            max_tokens=max_tokens,
            json_mode=json_mode,
            tier=ollama_tier,
        )
        if content:
            return content

        logger.warning("Ollama available but call failed — falling back to Groq")

    # 2. Fall back to Groq
    _groq_model = groq_model or getattr(settings, "GROQ_MODEL", "llama-3.3-70b-versatile")
    _groq_fast = groq_fast_model or getattr(settings, "GROQ_FAST_MODEL", "llama-3.1-8b-instant")
    model = _groq_model if tier == "quality" else _groq_fast

    logger.debug("Using Groq", model=model)

    return await groq_call(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=temperature,
        max_tokens=max_tokens,
        json_mode=json_mode,
        use_cache=use_cache,
        cache_ttl=cache_ttl,
    )


# ─── Health / diagnostics ─────────────────────────────────────────────────────

async def inference_status() -> dict:
    """Return current inference provider status — used by /health endpoint."""
    ollama_ok = await is_ollama_available()
    groq_key_set = bool(getattr(settings, "GROQ_API_KEY", ""))

    return {
        "ollama": {
            "available": ollama_ok,
            "base_url": OLLAMA_BASE_URL,
            "models": _ollama_available_models,
        },
        "groq": {
            "available": groq_key_set,
            "rate_limit_rpm": 25,
        },
        "active_provider": "ollama" if ollama_ok else ("groq" if groq_key_set else "template_only"),
    }
