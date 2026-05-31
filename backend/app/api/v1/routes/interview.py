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

# ── Company profiles ──────────────────────────────────────────────────────────

COMPANY_PROFILES: dict[str, dict] = {
    "Google": {
        "style": "structured behavioral + algorithmic. Values: 'Googleyness', intellectual curiosity, collaboration.",
        "focus": ["system design at scale", "data structures & algorithms", "leadership & influence", "ambiguity handling"],
        "lp_hint": "Expect: 'Tell me about a time you disagreed with your manager', 'How did you handle a project with unclear requirements?'",
    },
    "Meta": {
        "style": "data-driven decisions, ownership, move fast. Values: impact, growth mindset, cross-functional partnership.",
        "focus": ["product sense", "execution under ambiguity", "cross-team influence", "metrics & analytics"],
        "lp_hint": "Expect: 'Give an example of a decision where you had incomplete data', 'Describe something you built from 0→1'.",
    },
    "Amazon": {
        "style": "Leadership Principles (LPs) based — every behavioral question maps to an LP.",
        "focus": ["Customer Obsession", "Bias for Action", "Ownership", "Deliver Results", "Dive Deep", "Invent & Simplify"],
        "lp_hint": "Expect: 'Tell me about a time you went above and beyond for a customer', 'Describe the most innovative thing you built'.",
    },
    "BlackRock": {
        "style": "analytical, finance+tech hybrid. Values: fiduciary duty, risk management, quantitative rigor.",
        "focus": ["risk thinking", "portfolio analytics", "technology in finance", "stakeholder communication"],
        "lp_hint": "Expect: 'How do you approach risk in a system you own?', 'Explain a complex technical concept to a non-technical stakeholder'.",
    },
    "Microsoft": {
        "style": "growth mindset culture. Values: learn-it-all, customer obsession, one Microsoft.",
        "focus": ["collaboration & inclusion", "technical depth", "growth stories", "product impact"],
        "lp_hint": "Expect: 'What's something you learned recently that changed how you work?', 'Describe a time you had to bring others along on a change'.",
    },
    "Apple": {
        "style": "craft and quality obsession. Values: privacy, simplicity, excellence.",
        "focus": ["attention to detail", "end-user empathy", "cross-functional execution", "saying no to good ideas"],
        "lp_hint": "Expect: 'How do you ensure quality in your work?', 'Tell me about a feature you cut because it wasn't ready'.",
    },
    "Netflix": {
        "style": "freedom & responsibility culture. No rules, only context. Values: candor, judgment, impact.",
        "focus": ["independent decision-making", "high performance culture", "context over control", "radical honesty"],
        "lp_hint": "Expect: 'Tell me about a time you made a significant call without waiting for permission', 'Describe a direct piece of feedback you gave'.",
    },
    "Goldman Sachs": {
        "style": "rigorous, client-centric, intellectual. Values: excellence, integrity, partnership.",
        "focus": ["technical rigor", "business acumen", "client service mindset", "pressure handling"],
        "lp_hint": "Expect: 'How do you balance speed with accuracy?', 'Describe a high-stakes situation where you had to deliver under pressure'.",
    },
    "Stripe": {
        "style": "builder culture. Values: user empathy, craft, global scale thinking.",
        "focus": ["developer experience", "infrastructure thinking", "product intuition", "autonomy"],
        "lp_hint": "Expect: 'What API or product have you built that you're most proud of?', 'How do you think about developer-first design?'",
    },
    "Uber": {
        "style": "operator mindset. Values: customer obsession, ownership, hustle.",
        "focus": ["marketplace thinking", "real-time systems", "cross-geo execution", "metrics-driven decisions"],
        "lp_hint": "Expect: 'Tell me about optimizing something for scale', 'How did you handle a system failure affecting users?'",
    },
    "Airbnb": {
        "style": "mission-driven, belong anywhere. Values: champion the mission, be a host, embrace adventure.",
        "focus": ["community & trust", "product storytelling", "inclusive design", "cross-cultural thinking"],
        "lp_hint": "Expect: 'How do you design for diverse global users?', 'Tell me about a time you advocated for the user over internal convenience'.",
    },
    "OpenAI": {
        "style": "safety-aware, research-minded. Values: AGI for humanity, safety, capability.",
        "focus": ["AI/ML depth", "safety considerations", "rapid experimentation", "first-principles thinking"],
        "lp_hint": "Expect: 'How do you balance capability and safety in a system?', 'Tell me about your most ambitious technical project'.",
    },
}

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
    "You are an expert senior interviewer at a top-tier tech company. "
    "Generate realistic, probing questions that test both hard skills and character. "
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
    """Generate generic interview questions (no resume context)."""
    body.num_questions = max(3, min(10, body.num_questions))

    type_hint = {
        "behavioral":  "behavioral (STAR-format) questions",
        "technical":   "technical / problem-solving questions",
        "mixed":       "a mix of behavioral, technical, and situational questions",
    }.get(body.interview_type, "mixed questions")

    prompt = (
        f"Generate {body.num_questions} {type_hint} for a "
        f"{body.experience_level}-level {body.role} candidate.\n\n"
        "Return a JSON array of objects:\n"
        '[{"question": "...", "type": "behavioral|technical|situational", '
        '"follow_up_hint": "what to probe if answer is vague", '
        '"ideal_points": ["point1", "point2"]}]'
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
    """
    Generate personalized questions using the candidate's active resume + company profile.
    This is the HireVue-style endpoint: resume-aware, company-tailored questions.
    """
    body.num_questions = max(3, min(10, body.num_questions))

    # ── Fetch active resume ────────────────────────────────────────────────
    resume_summary = "Resume not available — ask general questions."
    try:
        sb = get_supabase()
        result = (
            sb.table("resumes")
            .select("parsed_data")
            .eq("user_id", user_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        if result.data:
            resume_summary = _build_resume_summary(result.data[0].get("parsed_data") or {})
    except Exception as e:
        logger.warning("Could not fetch resume for HireVue interview", error=str(e))

    # ── Company context ────────────────────────────────────────────────────
    co_profile = COMPANY_PROFILES.get(body.company, {})
    company_context = ""
    if co_profile:
        company_context = (
            f"\nCompany: {body.company}\n"
            f"Interview style: {co_profile.get('style', '')}\n"
            f"Key focus areas: {', '.join(co_profile.get('focus', []))}\n"
            f"Example themes: {co_profile.get('lp_hint', '')}"
        )

    type_hint = {
        "behavioral":  "behavioral (STAR-format) questions",
        "technical":   "technical / coding / system-design questions",
        "mixed":       "a mix of behavioral, technical, and situational questions",
    }.get(body.interview_type, "mixed questions")

    prompt = (
        f"Generate {body.num_questions} {type_hint} for a "
        f"{body.experience_level}-level {body.role} candidate.\n\n"
        f"CANDIDATE PROFILE:\n{resume_summary}\n"
        f"{company_context}\n\n"
        "INSTRUCTIONS:\n"
        "- Reference the candidate's actual projects, skills, and experience in the questions.\n"
        "- Tailor question depth to company culture and level.\n"
        "- For technical questions, mention specific technologies from the candidate's profile.\n"
        "- Include at least one question probing a project or achievement from the resume.\n\n"
        "Return a JSON array:\n"
        '[{"question": "...", "type": "behavioral|technical|situational", '
        '"follow_up_hint": "what to probe deeper", '
        '"ideal_points": ["point1", "point2"]}]'
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
            "resume_loaded": resume_summary != "Resume not available — ask general questions.",
            "company_profile": {
                "name": body.company,
                "style": co_profile.get("style", ""),
                "focus": co_profile.get("focus", []),
            } if co_profile else None,
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

    text = body.text[:500].strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")

    url = f"https://api.elevenlabs.io/v1/text-to-speech/{settings.ELEVENLABS_VOICE_ID}"
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


@router.get("/companies")
async def list_companies(user_id: str = Depends(get_current_user_id)):
    """Return the list of supported companies with their focus areas."""
    return {
        "companies": [
            {"name": name, "focus": profile.get("focus", [])[:3]}
            for name, profile in COMPANY_PROFILES.items()
        ]
    }
