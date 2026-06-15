"""
AI Interview Practice — HireVue-style with ElevenLabs TTS + Groq.

Cost model:
  - 1 interview_voice credit = 1 complete interview session.
  - Credit consumed atomically at /start or /hirevue/start, BEFORE questions are
    generated. This gates everything: questions, feedback, report, and TTS.
  - Opening /start sets a 90-min in-memory session window. All subsequent TTS
    calls within that window are free (no additional credit consumed).
  - If the user exits early the credit is refunded via /voice/cancel.
  - Pro plan users pay nothing — all endpoints are free.
  - Groq (questions, feedback, report) is free-tier; ElevenLabs requires the key.

Access control:
  - /start, /hirevue/start → Pro plan OR ≥1 interview_voice credit (consumed here).
  - /tts                   → Pro plan OR active session window opened at start.
  - All other endpoints    → any authenticated user.
"""
from __future__ import annotations

import asyncio
import io
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import get_current_user_id
from app.db.supabase_client import get_supabase
from app.services.claude_client import (
    get_user_plan,
    get_user_credits,
    consume_credit,
    refund_credit,
)
from app.services.groq_limiter import groq_call

# ── In-memory voice session tracker ──────────────────────────────────────────
# Maps user_id → session expiry. Avoids consuming a credit on every TTS call
# within the same 90-minute interview window. Single-container safe (Cloud Run
# min-instances=0, so no horizontal scaling concern for now).
_voice_sessions: dict[str, datetime] = {}
_VOICE_SESSION_TTL = timedelta(minutes=90)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/interview", tags=["interview"])

# ── Models ────────────────────────────────────────────────────────────────────

class InterviewStartRequest(BaseModel):
    role: str
    experience_level: str = "entry"
    interview_type: str   = "mixed"
    num_questions: int    = 5


class HireVueStartRequest(BaseModel):
    role: str
    company: str          = "General"
    experience_level: str = "entry"
    interview_type: str   = "mixed"
    num_questions: int    = 5


class TTSRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None   # override default voice


class EvalRequest(BaseModel):
    role: str
    question: str
    answer: str
    question_type: Optional[str] = "behavioral"


class FollowUpRequest(BaseModel):
    role: str
    company: str = "General"
    original_question: str
    answer: str
    conversation_history: list[dict] = []


# ── Helpers ───────────────────────────────────────────────────────────────────

INTERVIEW_SYSTEM = (
    "You are a senior interviewer. Generate realistic, specific questions based only on what the candidate has actually done. "
    "Reference their real projects, technologies, and experience by name. "
    "Never generate generic questions that any candidate could answer without knowing their own background. "
    "Return ONLY valid JSON — no markdown, no extra text."
)


def _build_resume_summary(parsed_data: dict) -> str:
    """Turn parsed resume data into a compact context string for the LLM."""
    contact = parsed_data.get("contact", {})
    skills  = parsed_data.get("skills", [])
    exp     = parsed_data.get("experience", [])
    proj    = parsed_data.get("projects", [])

    lines = []
    if contact.get("name"):
        lines.append(f"Candidate: {contact['name']}")
    if skills:
        lines.append(f"Key skills: {', '.join(skills[:15])}")
    for e in exp[:2]:
        title   = e.get("title", "")
        company = e.get("company", "")
        bullets = e.get("bullets", [])
        if title or company:
            lines.append(f"Experience: {title} at {company}")
        if bullets:
            lines.append(f"  Highlights: {bullets[0][:120]}")
    for p in proj[:2]:
        name  = p.get("name", "")
        stack = p.get("tech_stack", [])
        if name:
            lines.append(f"Project: {name}" + (f" ({', '.join(stack[:5])})" if stack else ""))

    return "\n".join(lines) if lines else "Resume data not available."


# ── Standard question generation ──────────────────────────────────────────────

@router.post("/start")
async def start_interview(
    body: InterviewStartRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Generate questions using the user's active resume as context."""
    body.num_questions = max(3, min(10, body.num_questions))

    # ── Credit gate ──────────────────────────────────────────────────────────
    plan = await get_user_plan(user_id)
    if plan != "pro":
        credits = await get_user_credits(user_id, "interview_voice")
        if credits <= 0:
            raise HTTPException(
                status_code=402,
                detail="No interview credits remaining. Purchase a session at /settings.",
            )
        consumed = await consume_credit(user_id, "interview_voice")
        if not consumed:
            raise HTTPException(status_code=402, detail="Could not consume interview credit — please try again.")
        # Open 90-min window so TTS calls within this interview are free
        _voice_sessions[user_id] = datetime.now(timezone.utc) + _VOICE_SESSION_TTL
        logger.info("Interview started for user %s — credit consumed (remaining: ~%d)", user_id, credits - 1)

    # Always fetch the user's actual resume
    resume_text = ""
    try:
        result = (
            get_supabase().table("resumes")
            .select("raw_text, parsed_data")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        if result.data:
            resume_text = result.data[0].get("raw_text") or ""
    except Exception as e:
        logger.warning("Could not fetch resume for interview", error=str(e))

    type_hint = {
        "behavioral":  "behavioral (STAR-format)",
        "technical":   "technical and system design",
        "mixed":       "a mix of behavioral, technical, and situational",
    }.get(body.interview_type, "mixed")

    resume_section = f"\n=== CANDIDATE'S RESUME ===\n{resume_text[:3500]}\n" if resume_text else ""

    prompt_content = (
        f"Generate {body.num_questions} {type_hint} interview questions for a "
        f"{body.experience_level}-level {body.role} position.\n"
        f"{resume_section}\n"
        "Base every question on this candidate's actual background — reference their real projects, "
        "companies, technologies, and experiences by name. "
        "Questions should be impossible to answer without knowing this specific candidate's history.\n\n"
        "Return a JSON array:\n"
        '[{"question": "...", "type": "behavioral|technical|situational", '
        '"follow_up_hint": "specific follow-up based on their background", '
        '"ideal_points": ["what a strong answer covers"]}]'
    )

    try:
        raw = await groq_call(
            model=settings.GROQ_MODEL,
            messages=[
                {"role": "system", "content": INTERVIEW_SYSTEM},
                {"role": "user",   "content": prompt_content},
            ],
            temperature=0.7,
            max_tokens=2200,
            json_mode=True,
            use_cache=False,
        )
        questions = json.loads(raw) if isinstance(raw, str) else raw
        if isinstance(questions, dict):
            questions = questions.get("questions") or list(questions.values())[0]
        return {
            "questions": questions[:body.num_questions],
            "role": body.role,
            "_model": "groq-llama",
        }
    except Exception as e:
        logger.error("Interview question generation failed", exc_info=e)
        raise HTTPException(status_code=502, detail="Could not generate questions")


# ── HireVue-style interview start ─────────────────────────────────────────────

@router.post("/hirevue/start")
async def start_hirevue_interview(
    body: HireVueStartRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Generate deeply personalised questions from the candidate's actual resume + target company."""
    body.num_questions = max(3, min(10, body.num_questions))

    # ── Credit gate ──────────────────────────────────────────────────────────
    plan = await get_user_plan(user_id)
    if plan != "pro":
        credits = await get_user_credits(user_id, "interview_voice")
        if credits <= 0:
            raise HTTPException(
                status_code=402,
                detail="No interview credits remaining. Purchase a session at /settings.",
            )
        consumed = await consume_credit(user_id, "interview_voice")
        if not consumed:
            raise HTTPException(status_code=402, detail="Could not consume interview credit — please try again.")
        # Open 90-min window so TTS calls within this interview are free
        _voice_sessions[user_id] = datetime.now(timezone.utc) + _VOICE_SESSION_TTL
        logger.info("HireVue interview started for user %s — credit consumed (remaining: ~%d)", user_id, credits - 1)

    # Fetch full resume text
    resume_text = ""
    try:
        result = (
            get_supabase().table("resumes")
            .select("raw_text")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        if result.data:
            resume_text = result.data[0].get("raw_text") or ""
    except Exception as e:
        logger.warning("Could not fetch resume for HireVue interview", error=str(e))

    company_line = (
        f"Target company: {body.company}. Use your knowledge of {body.company}'s "
        f"actual interview process, culture, and what they probe for in {body.role} candidates."
        if body.company and body.company != "General"
        else ""
    )

    type_hint = {
        "behavioral":  "behavioral (STAR-format)",
        "technical":   "technical and system design",
        "mixed":       "a mix of behavioral, technical, and situational",
    }.get(body.interview_type, "mixed")

    resume_section = f"\n=== CANDIDATE'S RESUME ===\n{resume_text[:3500]}\n" if resume_text else "\nNo resume provided — ask general questions for this role.\n"

    prompt = (
        f"Generate {body.num_questions} {type_hint} interview questions.\n"
        f"Role: {body.experience_level}-level {body.role}\n"
        f"{company_line}\n"
        f"{resume_section}\n"
        "Every question must be grounded in this candidate's actual resume — "
        "reference their real projects, companies, technologies, and specific experiences. "
        "At least one question should directly challenge or probe a specific claim on their resume. "
        "Questions must be impossible to answer well without knowing this person's actual background.\n\n"
        "Return a JSON array:\n"
        '[{"question": "...", "type": "behavioral|technical|situational", '
        '"follow_up_hint": "specific probe based on their background", '
        '"ideal_points": ["what a strong answer covers"]}]'
    )

    try:
        raw = await groq_call(
            model=settings.GROQ_MODEL,
            messages=[
                {"role": "system", "content": INTERVIEW_SYSTEM},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.7,
            max_tokens=2800,
            json_mode=True,
            use_cache=False,
        )
        questions = json.loads(raw) if isinstance(raw, str) else raw
        if isinstance(questions, dict):
            questions = questions.get("questions") or list(questions.values())[0]

        return {
            "questions": questions[:body.num_questions],
            "role": body.role,
            "company": body.company,
            "resume_loaded": bool(resume_text),
            "_model": "groq-llama",
        }
    except Exception as e:
        logger.error("HireVue question generation failed", exc_info=e)
        raise HTTPException(status_code=502, detail="Could not generate personalized questions")


# ── Adaptive follow-up ────────────────────────────────────────────────────────

@router.post("/follow-up")
async def get_follow_up(
    body: FollowUpRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Decide whether to ask a follow-up question based on the candidate's answer.
    Returns { follow_up: string | null } — null means move to next planned question.
    """
    prompt = (
        f"You are interviewing a {body.role} candidate"
        + (f" for {body.company}" if body.company and body.company != "General" else "")
        + ".\n\n"
        f"Original question: {body.original_question}\n"
        f"Candidate's answer: {body.answer}\n\n"
        "TASK: Decide if a follow-up question is warranted. Follow up ONLY if:\n"
        "- The candidate mentioned a specific project or achievement worth probing deeper\n"
        "- The answer was vague or missed a key point\n"
        "- A natural 'tell me more about X' opportunity exists\n\n"
        "If a follow-up is warranted, return it. If the answer was complete, return null.\n"
        'Return JSON: {"follow_up": "question string OR null", "reason": "brief reason"}'
    )

    try:
        raw = await groq_call(
            model=settings.GROQ_FAST_MODEL,
            messages=[
                {"role": "system", "content": INTERVIEW_SYSTEM},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.4,
            max_tokens=300,
            json_mode=True,
            use_cache=False,
        )
        result = json.loads(raw)
        follow_up = result.get("follow_up")
        if follow_up and follow_up.lower() in ("null", "none", ""):
            follow_up = None
        return {"follow_up": follow_up}
    except Exception as e:
        logger.warning("Follow-up generation failed", exc_info=e)
        return {"follow_up": None}


# ── Answer evaluation ─────────────────────────────────────────────────────────

@router.post("/evaluate")
async def evaluate_answer(
    body: EvalRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Evaluate a candidate's answer and return structured feedback."""
    prompt = (
        f"Evaluate this interview answer for a {body.role} position.\n\n"
        f"Question ({body.question_type}): {body.question}\n\n"
        f"Candidate answer: {body.answer}\n\n"
        "Return JSON:\n"
        '{"score": 1-10, "overall_feedback": "2-3 sentence assessment", '
        '"strengths": ["strength1", "strength2"], '
        '"improvements": ["improvement1", "improvement2"], '
        '"follow_up": "a follow-up probe OR null"}'
    )

    try:
        raw = await groq_call(
            model=settings.GROQ_FAST_MODEL,
            messages=[
                {"role": "system", "content": INTERVIEW_SYSTEM},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.3,
            max_tokens=600,
            json_mode=True,
            use_cache=False,
        )
        feedback = json.loads(raw)
        feedback["score"] = max(1, min(10, int(feedback.get("score", 5))))
        return feedback
    except Exception as e:
        logger.error("Answer evaluation failed", exc_info=e)
        raise HTTPException(status_code=502, detail="Could not evaluate answer")


# ── ElevenLabs TTS proxy ──────────────────────────────────────────────────────

@router.post("/tts")
async def text_to_speech(
    body: TTSRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Proxy text to ElevenLabs TTS and stream audio back.

    Access: Pro plan OR purchased voice interview credit.
    Credit consumption: 1 credit opens a 90-minute session window so we don't
    charge per TTS call — only once per interview session.
    """
    if not settings.ELEVENLABS_API_KEY:
        raise HTTPException(status_code=503, detail="TTS not configured — set ELEVENLABS_API_KEY")

    # ── Access control ────────────────────────────────────────────────────────
    # Credits are consumed at /start or /hirevue/start. TTS is free within the
    # 90-minute session window that those endpoints open. We just gate here —
    # no credit is consumed here any more.
    plan = await get_user_plan(user_id)
    if plan != "pro":
        now = datetime.now(timezone.utc)
        # Lazy GC: evict expired windows
        expired = [uid for uid, exp in _voice_sessions.items() if exp <= now]
        for uid in expired:
            _voice_sessions.pop(uid, None)

        if _voice_sessions.get(user_id, now) <= now:
            raise HTTPException(
                status_code=403,
                detail=(
                    "No active interview session. Start an interview first to use TTS. "
                    "Voice interview requires a Pro plan or an interview credit."
                ),
            )

    text = body.text[:300].strip()  # hard cap: 300 chars per TTS call
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")

    voice_id = body.voice_id or settings.ELEVENLABS_VOICE_ID
    url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
    payload = {
        "text": text,
        "model_id": "eleven_multilingual_v2",   # highest quality, most natural
        "voice_settings": {
            "stability": 0.38,           # lower = more natural vocal variation
            "similarity_boost": 0.88,    # stay close to the voice character
            "style": 0.45,               # expressiveness
            "use_speaker_boost": True,   # clarity boost
        },
    }

    try:
        async with httpx.AsyncClient(timeout=25) as client:
            resp = await client.post(
                url,
                headers={"xi-api-key": settings.ELEVENLABS_API_KEY, "Content-Type": "application/json"},
                json=payload,
            )
        if resp.status_code == 401:
            raise HTTPException(status_code=503, detail="Invalid ElevenLabs API key")
        if resp.status_code == 429:
            raise HTTPException(status_code=429, detail="ElevenLabs quota exceeded")
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="TTS service error")

        return StreamingResponse(
            io.BytesIO(resp.content),
            media_type="audio/mpeg",
            headers={"Cache-Control": "no-cache"},
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error("ElevenLabs TTS call failed", exc_info=e)
        raise HTTPException(status_code=502, detail="TTS unavailable")


@router.get("/tts/status")
async def tts_status(user_id: str = Depends(get_current_user_id)):
    """Check if TTS is configured."""
    return {"available": bool(settings.ELEVENLABS_API_KEY)}


@router.post("/voice/cancel")
async def cancel_voice_session(user_id: str = Depends(get_current_user_id)):
    """
    Called when the user exits an ElevenLabs interview before completing all questions.
    Clears the in-memory session window and refunds the consumed credit so the user
    isn't charged for an incomplete session.
    """
    now = datetime.now(timezone.utc)
    had_active_session = _voice_sessions.get(user_id, datetime.min.replace(tzinfo=timezone.utc)) > now
    _voice_sessions.pop(user_id, None)

    if had_active_session:
        plan = await get_user_plan(user_id)
        if plan != "pro":
            refunded = await refund_credit(user_id, "interview_voice")
            return {"cancelled": True, "refunded": refunded}
        return {"cancelled": True, "refunded": False, "reason": "pro_plan"}

    return {"cancelled": False, "refunded": False}


class ReportItem(BaseModel):
    question: str
    question_type: str = "behavioral"
    answer: str
    score: int
    strengths: list[str] = []
    improvements: list[str] = []
    overall_feedback: str = ""


class ReportRequest(BaseModel):
    role: str
    company: str = "General"
    items: list[ReportItem]


@router.post("/report")
async def generate_report(
    body: ReportRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Generate a comprehensive post-interview report.
    Returns verdict, interview_pct, prioritised improvement plan, and skill gaps.
    Uses the candidate's active resume for personalised suggestions.
    """
    resume_text = ""
    try:
        result = (
            get_supabase().table("resumes")
            .select("raw_text")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        if result.data:
            resume_text = result.data[0].get("raw_text") or ""
    except Exception as e:
        logger.warning("Could not fetch resume for report", error=str(e))

    qa_block = "\n\n".join(
        f"Q{i+1} [{item.question_type.upper()}] (Score {item.score}/10)\n"
        f"Question: {item.question}\n"
        f"Answer: {item.answer[:600]}\n"
        f"Strengths: {', '.join(item.strengths) or 'none'}\n"
        f"Areas to improve: {', '.join(item.improvements) or 'none'}"
        for i, item in enumerate(body.items)
    )

    avg_score = round(sum(it.score for it in body.items) / len(body.items), 1) if body.items else 0
    resume_section = f"\n=== CANDIDATE RESUME ===\n{resume_text[:2500]}\n" if resume_text else ""

    prompt = (
        f"You just interviewed a candidate for a {body.role} position"
        + (f" at {body.company}" if body.company and body.company != "General" else "")
        + f". Average score: {avg_score}/10.\n\n"
        f"=== INTERVIEW Q&A ===\n{qa_block}\n"
        f"{resume_section}\n"
        "Generate a comprehensive post-interview report. Return JSON:\n"
        "{\n"
        '  "verdict": "2-3 sentence overall assessment of the candidate\'s performance",\n'
        '  "interview_pct": <integer 0-100, calibrated from their scores and answer quality>,\n'
        '  "top_strengths": ["strength1", "strength2", "strength3"],\n'
        '  "improvement_plan": [\n'
        '    {"area": "short area name", "tip": "specific, actionable advice referencing their actual answers", "priority": "high|medium|low"}\n'
        "  ],\n"
        '  "skill_gaps": ["gap1", "gap2"],\n'
        '  "next_steps": ["specific next step 1", "specific next step 2", "specific next step 3"]\n'
        "}\n"
        "improvement_plan should have 3-5 items based on where they actually struggled. "
        "Use the resume to identify gaps between what they claimed and what they demonstrated. "
        "Be honest, specific, and constructive."
    )

    try:
        raw = await groq_call(
            model=settings.GROQ_MODEL,
            messages=[
                {"role": "system", "content": "You are a senior hiring manager generating a post-interview candidate report. Be honest, specific, and constructive. Return ONLY valid JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.4,
            max_tokens=1200,
            json_mode=True,
            use_cache=False,
        )
        report = json.loads(raw) if isinstance(raw, str) else raw
        report["interview_pct"] = max(0, min(100, int(report.get("interview_pct", round(avg_score * 10)))))
        return report
    except Exception as e:
        logger.error("Report generation failed", exc_info=e)
        # Fallback: return basic derived report
        return {
            "verdict": f"Overall performance: {avg_score}/10 average across {len(body.items)} questions.",
            "interview_pct": round(avg_score * 10),
            "top_strengths": [],
            "improvement_plan": [],
            "skill_gaps": [],
            "next_steps": [],
        }


class SaveSessionRequest(BaseModel):
    role: str
    company: str = "General"
    questions: list[dict]
    answers: list[str]
    feedback: list[dict]
    report: Optional[dict] = None
    overall_score: Optional[float] = None
    interview_pct: Optional[int] = None


@router.post("/sessions")
async def save_session(
    body: SaveSessionRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Persist a completed interview session for the history view."""
    try:
        row = {
            "user_id": user_id,
            "role": body.role,
            "company": body.company,
            "questions": body.questions,
            "answers": body.answers,
            "feedback": body.feedback,
            "report": body.report,
            "overall_score": body.overall_score,
            "interview_pct": body.interview_pct,
        }
        result = get_supabase().table("interview_sessions").insert(row).execute()
        if result.data:
            return {"id": result.data[0]["id"], "saved": True}
        raise HTTPException(status_code=500, detail="Insert returned no data")
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to save interview session", exc_info=e)
        raise HTTPException(status_code=500, detail="Could not save session")


@router.get("/sessions")
async def list_sessions(
    limit: int = 20,
    user_id: str = Depends(get_current_user_id),
):
    """Return the user's most recent interview sessions (summary only, no full Q&A)."""
    try:
        result = (
            get_supabase().table("interview_sessions")
            .select("id, role, company, overall_score, interview_pct, created_at, report->verdict, questions")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(min(limit, 50))
            .execute()
        )
        sessions = []
        for row in (result.data or []):
            qs = row.get("questions") or []
            sessions.append({
                "id": row["id"],
                "role": row["role"],
                "company": row["company"],
                "overall_score": row.get("overall_score"),
                "interview_pct": row.get("interview_pct"),
                "created_at": row["created_at"],
                "verdict": row.get("verdict"),
                "num_questions": len(qs),
            })
        return {"sessions": sessions}
    except Exception as e:
        logger.error("Failed to list interview sessions", exc_info=e)
        raise HTTPException(status_code=500, detail="Could not fetch sessions")


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Fetch a single saved interview session (full detail)."""
    try:
        result = (
            get_supabase().table("interview_sessions")
            .select("*")
            .eq("id", session_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Session not found")
        return result.data
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to fetch interview session", exc_info=e)
        raise HTTPException(status_code=500, detail="Could not fetch session")


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Delete a saved session."""
    try:
        get_supabase().table("interview_sessions").delete().eq("id", session_id).eq("user_id", user_id).execute()
        return {"deleted": True}
    except Exception as e:
        logger.error("Failed to delete interview session", exc_info=e)
        raise HTTPException(status_code=500, detail="Could not delete session")


@router.get("/voices")
async def list_voices(user_id: str = Depends(get_current_user_id)):
    """3 female + 3 male professional voices, all pre-made and available on every plan."""
    return {
        "voices": [
            # Female
            {"id": "EXAVITQu4vr4xnSDxMaL", "name": "Sarah",    "gender": "F", "desc": "Determined · American · Clear"},
            {"id": "XrExE9yKIg1WjnnlVkGX", "name": "Matilda",  "gender": "F", "desc": "Warm · Confident · Natural"},
            {"id": "XB0fDUnXU5powFXDhCwa", "name": "Charlotte", "gender": "F", "desc": "Authoritative · European · Crisp"},
            # Male
            {"id": "JBFqnCBsd6RMkjVDRZzb", "name": "George",   "gender": "M", "desc": "Warm · British · Professional"},
            {"id": "pNInz6obpgDQGcFmaJgB", "name": "Adam",     "gender": "M", "desc": "Deep · American · Authoritative"},
            {"id": "nPczCjzI2devNBz1zQrb", "name": "Brian",    "gender": "M", "desc": "Natural · Clear · American"},
        ],
        "default": "EXAVITQu4vr4xnSDxMaL",
    }


