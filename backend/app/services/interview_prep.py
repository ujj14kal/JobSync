"""
Interview Prep Generator — powered by Groq.

Generates 8 targeted interview questions from a job description.
Questions are specific to the role, not generic templates.
Results are cached in the analyses table (interview_prep JSONB column).
"""
from __future__ import annotations

import json
import structlog

from app.services.local_inference import llm_call
from app.services.concurrency_manager import LLMSlot

logger = structlog.get_logger()


async def generate_interview_prep(parsed_job: dict, scores: dict) -> dict:
    """
    Generate targeted interview questions for a specific job.
    Returns { questions: [...], generated_at: ISO }
    """
    title = parsed_job.get("title", "this role")
    company = parsed_job.get("company", "")
    required_skills = parsed_job.get("required_skills", [])
    tech_stack = parsed_job.get("tech_stack", [])
    responsibilities = parsed_job.get("responsibilities", [])
    requirements = parsed_job.get("requirements", [])
    experience_level = parsed_job.get("experience_level", "")

    skills_str = ", ".join((required_skills + tech_stack)[:14])
    resp_str = " | ".join(responsibilities[:4])
    req_str = " | ".join(requirements[:4])

    prompt = f"""You are a senior hiring manager preparing for an interview for a {title} role{f" at {company}" if company else ""}.
Experience level: {experience_level or "not specified"}
Required skills: {skills_str}
Key responsibilities: {resp_str}
Requirements: {req_str}

Generate exactly 8 interview questions that are HIGHLY LIKELY to be asked for this specific role. Mix:
- 3 technical questions (testing specific skills/tech from this JD)
- 3 behavioral questions (STAR-format, tied to the responsibilities above)
- 2 situational/problem-solving questions (realistic scenarios for this role)

Each question must be specific to THIS job, not generic. Reference actual technologies or responsibilities from the JD.

Return JSON only, no markdown:
{{
  "questions": [
    {{
      "type": "technical|behavioral|situational",
      "question": "the exact question they will ask",
      "why_asked": "one sentence: what the interviewer is testing with this question",
      "answer_framework": "2-3 sentences: how to structure your answer to nail this question",
      "red_flag": "one common mistake that gets candidates rejected"
    }}
  ]
}}"""

    try:
        async with LLMSlot():
            raw = await llm_call(
                prompt=prompt,
                temperature=0.5,
                max_tokens=2500,
                json_mode=True,
                tier="quality",
                use_cache=False,
            )

        # Strip markdown fences if present
        content = raw.strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
            content = content.rsplit("```", 1)[0].strip()

        result = json.loads(content)

        # Validate structure
        if "questions" not in result or not isinstance(result["questions"], list):
            raise ValueError("Missing 'questions' array in response")

        from datetime import datetime, timezone
        result["generated_at"] = datetime.now(timezone.utc).isoformat()
        result["job_title"] = title
        return result

    except Exception as e:
        logger.error("interview_prep generation failed", error=str(e), exc_info=True)
        raise
