"""
AI Chat endpoint — "Ask Claude" sidebar.

- Pro users only (checked in claude_client)
- Streams response via Server-Sent Events
- Persists message history in chat_messages table
- System prompt: JobSynk career assistant
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.security import get_current_user_id
from app.db.supabase_client import get_supabase
from app.services.claude_client import claude_stream, get_user_plan, get_monthly_usage, get_user_credits
from app.core.config import settings

router = APIRouter(prefix="/chat", tags=["chat"])
logger = logging.getLogger(__name__)

SYSTEM_PROMPT = """You are a career assistant embedded in JobSynk, an AI-powered career platform.

You help users with:
- Resume writing and improvement
- ATS score interpretation and how to improve it
- Interview preparation and mock questions
- Job search strategy and salary negotiation
- Cover letter writing
- Career pivots and skill gaps
- LinkedIn profile optimisation

Keep answers concise and actionable. Use bullet points where helpful.
When relevant, suggest the user try JobSynk's built-in tools (ATS analyser, resume builder, interview practice).
Never make up job listings or company-specific information.
Always be encouraging — job searching is stressful."""


class ChatRequest(BaseModel):
    message:    str
    session_id: str | None = None
    history:    list[dict] = []   # [{"role": "user"|"assistant", "content": "..."}]


class ChatHistoryRequest(BaseModel):
    session_id: str


@router.get("/status")
async def chat_status(user_id: str = Depends(get_current_user_id)):
    """Returns plan + chat token usage — shown in the sidebar before first message."""
    plan = await get_user_plan(user_id)
    usage = await get_monthly_usage(user_id)
    chat_tokens = usage.get("chat_tokens", 0)
    remaining = max(0, settings.PRO_MONTHLY_CHAT_TOKENS - chat_tokens)
    interview_credits = await get_user_credits(user_id, "interview_text")
    return {
        "plan":             plan,
        "is_pro":           plan == "pro",
        "chat_tokens_used": chat_tokens,
        "chat_tokens_limit": settings.PRO_MONTHLY_CHAT_TOKENS,
        "chat_tokens_remaining": remaining,
        "pct_used":         round(chat_tokens / settings.PRO_MONTHLY_CHAT_TOKENS * 100, 1),
        "warning":          remaining < 5000,
        "interview_credits": interview_credits,
    }


@router.post("/send")
async def send_message(
    req: ChatRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Streams a Claude response via SSE.
    Token usage is logged after the stream completes.
    """
    if not req.message.strip():
        raise HTTPException(400, "Message cannot be empty.")
    if len(req.message) > 4000:
        raise HTTPException(400, "Message too long (max 4000 characters).")

    plan = await get_user_plan(user_id)
    if plan != "pro":
        raise HTTPException(403, json.dumps({
            "error": "pro_required",
            "message": "The AI chat assistant is available on the Pro plan (₹299/month).",
        }))

    session_id = req.session_id or str(uuid.uuid4())
    supabase   = get_supabase()

    # Build message list for Claude (last 10 turns to stay within context)
    history = req.history[-10:] if req.history else []
    messages = history + [{"role": "user", "content": req.message}]

    # Persist user message
    asyncio.create_task(asyncio.to_thread(
        lambda: supabase.table("chat_messages").insert({
            "user_id":    user_id,
            "session_id": session_id,
            "role":       "user",
            "content":    req.message,
        }).execute()
    ))

    # Collect full assistant reply to persist after streaming
    full_reply: list[str] = []

    async def _generate():
        async for chunk in claude_stream(
            user_id=user_id,
            feature="chat",
            system=SYSTEM_PROMPT,
            messages=messages,
            max_tokens=1024,
        ):
            if chunk.startswith("data: [DONE]"):
                # Persist assistant reply
                asyncio.create_task(asyncio.to_thread(
                    lambda: supabase.table("chat_messages").insert({
                        "user_id":    user_id,
                        "session_id": session_id,
                        "role":       "assistant",
                        "content":    "".join(full_reply),
                    }).execute()
                ))
            else:
                try:
                    data = json.loads(chunk.removeprefix("data: "))
                    if "content" in data:
                        full_reply.append(data["content"])
                except Exception:
                    pass
            yield chunk

        # Always send session_id so frontend can continue the thread
        yield f"data: {json.dumps({'session_id': session_id})}\n\n"

    return StreamingResponse(
        _generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/history/{session_id}")
async def get_history(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
):
    supabase = get_supabase()
    result = await asyncio.to_thread(
        lambda: supabase.table("chat_messages")
        .select("role, content, created_at")
        .eq("user_id", user_id)
        .eq("session_id", session_id)
        .order("created_at")
        .execute()
    )
    return result.data or []


@router.get("/sessions")
async def list_sessions(user_id: str = Depends(get_current_user_id)):
    """Returns the last 20 chat sessions (first user message as preview)."""
    supabase = get_supabase()
    result = await asyncio.to_thread(
        lambda: supabase.table("chat_messages")
        .select("session_id, content, created_at")
        .eq("user_id", user_id)
        .eq("role", "user")
        .order("created_at", desc=True)
        .limit(20)
        .execute()
    )
    seen: set[str] = set()
    sessions = []
    for row in (result.data or []):
        sid = row["session_id"]
        if sid not in seen:
            seen.add(sid)
            sessions.append({
                "session_id": sid,
                "preview":    row["content"][:60],
                "created_at": row["created_at"],
            })
    return sessions
