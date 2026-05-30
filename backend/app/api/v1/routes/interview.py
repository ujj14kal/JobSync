"""
AI Interview Practice — ElevenLabs TTS + Groq question generation.

Free-tier constraints observed:
  - ElevenLabs: 10,000 characters/month (free).  We keep each question ≤ 200 chars.
  - Groq: rate-limited via groq_call() helper.
  - No DB storage of sessions — stateless, client holds conversation.
"""
from __future__ import annotations

import io
import json
import logging
from typing import Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import get_current_user_id
from app.services.groq_limiter import groq_call

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/interview", tags=["interview"])

# ── Request / response models ────────────────────────────────────────────────

class InterviewStartRequest(BaseModel):
    role: str
    experience_level: str = "entry"   # student | entry | mid | senior
    interview_type: str   = "mixed"   # behavioral | technical | mixed
    num_questions: int    = 5


class TTSRequest(BaseModel):
    text: str


class EvalRequest(BaseModel):
    role: str
    question: str
    answer: str
    question_type: Optional[str] = "behavioral"


# ── Question generation ──────────────────────────────────────────────────────

INTERVIEW_SYSTEM = (
    "You are an expert technical recruiter. Generate realistic, specific interview questions "
    "that test both competency and culture-fit. Return ONLY valid JSON."
)


@router.post("/start")
async def start_interview(
    body: InterviewStartRequest,
    user_id: str = Depends(get_current_user_id),
):
    """Generate a list of interview questions for the given role."""
    body.num_questions = max(3, min(10, body.num_questions))

    type_hint = {
        "behavioral":  "behavioral (STAR-format) questions",
        "technical":   "technical / problem-solving questions",
        "mixed":       "a mix of behavioral, technical, and situational questions",
    }.get(body.interview_type, "mixed questions")

    prompt = (
        f"Generate {body.num_questions} {type_hint} for a "
        f"{body.experience_level}-level {body.role} candidate.\n\n"
        "Return a JSON array of objects with exactly these keys:\n"
        '{"question": "...", "type": "behavioral|technical|situational", '
        '"follow_up_hint": "what to probe if answer is vague", '
        '"ideal_points": ["point 1", "point 2"]}'
    )

    try:
        raw = await groq_call(
            model=settings.GROQ_FAST_MODEL,
            messages=[
                {"role": "system", "content": INTERVIEW_SYSTEM},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.7,
            max_tokens=1800,
            json_mode=True,
            use_cache=False,
        )
        questions = json.loads(raw)
        if isinstance(questions, dict):
            # Model sometimes wraps in {"questions": [...]}
            questions = questions.get("questions") or list(questions.values())[0]
        return {"questions": questions[:body.num_questions], "role": body.role}
    except Exception as e:
        logger.error("Interview question generation failed", exc_info=e)
        raise HTTPException(status_code=502, detail="Could not generate questions")


# ── Answer evaluation ────────────────────────────────────────────────────────

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
        "Return JSON with:\n"
        '{"score": 1-10, "overall_feedback": "2-3 sentence assessment", '
        '"strengths": ["strength 1", "strength 2"], '
        '"improvements": ["improvement 1", "improvement 2"], '
        '"follow_up": "optional follow-up question if needed, else null"}'
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


# ── ElevenLabs TTS proxy ─────────────────────────────────────────────────────

@router.post("/tts")
async def text_to_speech(
    body: TTSRequest,
    user_id: str = Depends(get_current_user_id),
):
    """
    Proxy text to ElevenLabs TTS and stream audio/mpeg back.
    Returns 503 if ELEVENLABS_API_KEY is not configured (client shows text-only UI).
    """
    if not settings.ELEVENLABS_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="TTS not configured — set ELEVENLABS_API_KEY",
        )

    # Trim to keep within free-tier character budget
    text = body.text[:300].strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{settings.ELEVENLABS_VOICE_ID}"
    payload = {
        "text": text,
        "model_id": "eleven_monolingual_v1",
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }

    try:
        async with httpx.AsyncClient(timeout=25) as client:
            resp = await client.post(
                url,
                headers={
                    "xi-api-key": settings.ELEVENLABS_API_KEY,
                    "Content-Type": "application/json",
                },
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


# ── TTS availability check ───────────────────────────────────────────────────

@router.get("/tts/status")
async def tts_status(user_id: str = Depends(get_current_user_id)):
    """Returns whether TTS is configured so the frontend can show/hide voice UI."""
    return {"available": bool(settings.ELEVENLABS_API_KEY)}
