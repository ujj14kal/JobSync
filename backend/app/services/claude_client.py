"""
Claude Sonnet client with live token tracking.

Every call through this module:
  1. Checks the user is on a Pro plan
  2. Enforces monthly feature limits
  3. Calls Claude Sonnet
  4. Logs exact token usage + INR cost to token_usage and monthly_usage tables

Pricing (claude-sonnet-4-5, June 2026):
  Input  : $3.00 / 1M tokens = ₹0.0002505 per token
  Output : $15.00 / 1M tokens = ₹0.0012525 per token
  1 USD  = ₹83.5
"""
from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncIterator

import anthropic

from app.core.config import settings
from app.db.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# Cost per token in USD
_INPUT_COST_PER_TOKEN  = 3.0  / 1_000_000   # $3/MTok
_OUTPUT_COST_PER_TOKEN = 15.0 / 1_000_000   # $15/MTok

# Monthly feature limits for Pro users (matches config + DB)
FEATURE_LIMITS: dict[str, str] = {
    "ats":              "ats_count",
    "resume":           "resume_count",
    "cover_letter":     "cover_count",
    "interview":        "interview_text_count",
    "voice":            "interview_voice_count",
    "chat":             None,  # tracked by chat_tokens, not count
}

FEATURE_CAP: dict[str, int] = {
    "ats":          settings.PRO_MONTHLY_ATS,
    "resume":       settings.PRO_MONTHLY_RESUMES,
    "cover_letter": settings.PRO_MONTHLY_COVERS,
    "interview":    settings.PRO_MONTHLY_INTERVIEWS,
    "voice":        settings.PRO_MONTHLY_VOICE,
    # chat capped by PRO_MONTHLY_CHAT_TOKENS in token count, not call count
}


def _get_client() -> anthropic.Anthropic:
    if not settings.ANTHROPIC_API_KEY:
        raise RuntimeError("ANTHROPIC_API_KEY is not set. Claude features require a Pro subscription.")
    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY)


def _current_month() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m")


# ── Subscription / quota helpers ─────────────────────────────────────────────

async def get_user_plan(user_id: str) -> str:
    """Returns 'free' or 'pro'."""
    supabase = get_supabase()
    try:
        result = await asyncio.to_thread(
            lambda: supabase.table("user_subscriptions")
            .select("plan, status, current_period_end")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return "free"
        row = result.data[0]
        if row["plan"] == "pro" and row["status"] == "active":
            return "pro"
        return "free"
    except Exception:
        return "free"


async def get_monthly_usage(user_id: str) -> dict:
    """Returns the current month's usage row (or zeros)."""
    supabase = get_supabase()
    month = _current_month()
    try:
        result = await asyncio.to_thread(
            lambda: supabase.table("monthly_usage")
            .select("*")
            .eq("user_id", user_id)
            .eq("month", month)
            .limit(1)
            .execute()
        )
        if result.data:
            return result.data[0]
    except Exception:
        pass
    return {
        "ats_count": 0, "resume_count": 0, "cover_count": 0,
        "interview_text_count": 0, "interview_voice_count": 0,
        "chat_tokens": 0, "total_tokens": 0, "total_cost_inr": 0,
    }


async def check_feature_quota(user_id: str, feature: str) -> tuple[bool, str]:
    """
    Returns (allowed: bool, message: str).
    Checks plan + monthly limit for the given feature.
    """
    plan = await get_user_plan(user_id)
    if plan != "pro":
        return False, "This feature requires a Pro subscription (₹299/month or ₹2,499/year)."

    col = FEATURE_LIMITS.get(feature)
    cap = FEATURE_CAP.get(feature)
    if col is None or cap is None:
        return True, ""  # chat or uncapped feature

    usage = await get_monthly_usage(user_id)
    current = usage.get(col, 0)
    if current >= cap:
        return False, (
            f"You've reached your monthly limit of {cap} {feature.replace('_', ' ')} "
            "uses. Limit resets on the 1st of next month."
        )
    return True, ""


# ── Token logging ─────────────────────────────────────────────────────────────

async def _log_usage(
    user_id: str,
    feature: str,
    input_tokens: int,
    output_tokens: int,
) -> None:
    total   = input_tokens + output_tokens
    cost_usd = input_tokens * _INPUT_COST_PER_TOKEN + output_tokens * _OUTPUT_COST_PER_TOKEN
    cost_inr = cost_usd * settings.USD_TO_INR
    month   = _current_month()
    supabase = get_supabase()

    col = FEATURE_LIMITS.get(feature)

    try:
        # Append to token_usage log
        await asyncio.to_thread(
            lambda: supabase.table("token_usage").insert({
                "user_id":       user_id,
                "feature":       feature,
                "model":         settings.CLAUDE_MODEL,
                "tokens_input":  input_tokens,
                "tokens_output": output_tokens,
                "tokens_total":  total,
                "cost_usd":      round(cost_usd, 8),
                "cost_inr":      round(cost_inr, 2),
            }).execute()
        )

        # Upsert monthly_usage
        update_fields: dict = {
            "total_tokens":    f"total_tokens + {total}",
            "total_cost_inr":  f"total_cost_inr + {round(cost_inr, 2)}",
        }
        if col:
            update_fields[col] = f"{col} + 1"
        if feature == "chat":
            update_fields["chat_tokens"] = f"chat_tokens + {total}"

        # Use raw SQL upsert to handle increment properly
        await asyncio.to_thread(
            lambda: supabase.rpc("increment_monthly_usage", {
                "p_user_id":    user_id,
                "p_month":      month,
                "p_feature_col": col or "",
                "p_tokens":     total,
                "p_cost_inr":   round(cost_inr, 2),
                "p_chat_tokens": total if feature == "chat" else 0,
            }).execute()
        )
    except Exception as e:
        logger.warning("Token usage log failed (non-fatal): %s", e)


# ── Main API call wrapper ─────────────────────────────────────────────────────

async def claude_complete(
    *,
    user_id: str,
    feature: str,
    system: str,
    messages: list[dict],
    max_tokens: int = 2048,
    skip_quota_check: bool = False,
) -> str:
    """
    Non-streaming Claude call. Returns the text response.
    Raises ValueError if quota exceeded or plan is free.
    """
    if not skip_quota_check:
        allowed, msg = await check_feature_quota(user_id, feature)
        if not allowed:
            raise ValueError(msg)

    client = _get_client()

    response = await asyncio.to_thread(
        lambda: client.messages.create(
            model=settings.CLAUDE_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        )
    )

    input_tokens  = response.usage.input_tokens
    output_tokens = response.usage.output_tokens
    asyncio.create_task(_log_usage(user_id, feature, input_tokens, output_tokens))

    return response.content[0].text


async def claude_stream(
    *,
    user_id: str,
    feature: str,
    system: str,
    messages: list[dict],
    max_tokens: int = 1024,
) -> AsyncIterator[str]:
    """
    Streaming Claude call — yields SSE-formatted chunks.
    Used by the chat endpoint.
    """
    allowed, msg = await check_feature_quota(user_id, feature)
    if not allowed:
        yield f"data: {json.dumps({'error': msg})}\n\n"
        return

    client = _get_client()

    # Check chat token budget separately
    if feature == "chat":
        usage = await get_monthly_usage(user_id)
        if usage.get("chat_tokens", 0) >= settings.PRO_MONTHLY_CHAT_TOKENS:
            yield f"data: {json.dumps({'error': 'Monthly chat token limit (50,000) reached. Resets on the 1st.'})}\n\n"
            return

    total_input = total_output = 0

    try:
        with client.messages.stream(
            model=settings.CLAUDE_MODEL,
            max_tokens=max_tokens,
            system=system,
            messages=messages,
        ) as stream:
            for text in stream.text_stream:
                total_output += 1  # rough approximation per chunk
                yield f"data: {json.dumps({'content': text})}\n\n"

            # Final usage from the completed message
            final = stream.get_final_message()
            total_input  = final.usage.input_tokens
            total_output = final.usage.output_tokens

    except Exception as e:
        logger.error("Claude stream error: %s", e)
        yield f"data: {json.dumps({'error': 'AI response error. Please try again.'})}\n\n"
        return
    finally:
        if total_input or total_output:
            asyncio.create_task(_log_usage(user_id, feature, total_input, total_output))

    yield "data: [DONE]\n\n"
