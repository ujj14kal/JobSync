"""
AI Interview Practice — HireVue-style with ElevenLabs TTS + Groq.

Free-tier constraints:
  - ElevenLabs: 10,000 chars/month. Each question ≤ 250 chars.
  - Groq: rate-limited via groq_call() helper.
  - No DB session storage — client holds conversation state.
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
from app.db.supabase_client import get_supabase
from app.services.groq_limiter import groq_call

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

    resume_section = f"\n=== CANDIDATE'S RESUME ===\n{resume_text[:3000]}\n" if resume_text else ""

    prompt = (
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
            questions = questions.get("questions") or list(questions.values())[0]
        return {"questions": questions[:body.num_questions], "role": body.role}
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
            model=settings.GROQ_MODEL,  # use full model for better personalization
            messages=[
                {"role": "system", "content": INTERVIEW_SYSTEM},
                {"role": "user",   "content": prompt},
            ],
            temperature=0.7,
            max_tokens=2400,
            json_mode=True,
            use_cache=False,
        )
        questions = json.loads(raw)
        if isinstance(questions, dict):
            questions = questions.get("questions") or list(questions.values())[0]

        return {
            "questions": questions[:body.num_questions],
            "role": body.role,
            "company": body.company,
            "resume_loaded": bool(resume_text),
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
    """Proxy text to ElevenLabs TTS and stream audio back."""
    if not settings.ELEVENLABS_API_KEY:
        raise HTTPException(status_code=503, detail="TTS not configured — set ELEVENLABS_API_KEY")

    text = body.text[:300].strip()  # ~300 chars keeps cost low on paid tier
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


