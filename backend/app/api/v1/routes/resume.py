"""Resume upload and management endpoints."""
from __future__ import annotations

import asyncio
import json
import re
import uuid
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from app.core.security import get_current_user_id
from app.core.config import settings
from app.db.supabase_client import get_supabase
from app.services.resume_parser import extract_text, parse_resume, looks_like_title
from app.services.embedding_service import embed_text

router = APIRouter(prefix="/resume", tags=["resume"])

_LLM_PARSE_PROMPT = """\
You are a resume parser. Extract structured data from the resume text below and return ONLY valid JSON — no markdown, no explanation.

Return this exact schema:
{
  "contact": {
    "name": "Full Name",
    "email": "email@example.com",
    "phone": "+1 234 567 8900",
    "linkedin": "https://linkedin.com/in/...",
    "github": "https://github.com/...",
    "portfolio": "https://...",
    "location": "City, State"
  },
  "summary": "professional summary or objective text, or null",
  "skills": ["Skill1", "Skill2"],
  "experience": [
    {
      "title": "Job Title",
      "company": "Company Name",
      "location": "City, State",
      "start_date": "Mon YYYY",
      "end_date": "Mon YYYY or Present",
      "bullets": ["achievement 1", "achievement 2"]
    }
  ],
  "education": [
    {
      "degree": "B.Tech Computer Science",
      "institution": "University Name",
      "year": "2024",
      "gpa": "8.5 or null"
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "description": "one-line description",
      "tech_stack": ["Tech1", "Tech2"],
      "bullets": ["detail 1", "detail 2"]
    }
  ],
  "certifications": [
    {
      "name": "Cert Name",
      "issuer": "Issuer",
      "date": "Mon YYYY",
      "url": "https://..."
    }
  ]
}

Rules:
- name must be the person's full name only — never a job title, city, or company
- For missing fields use null (strings) or [] (arrays)
- If the resume text ends with an [EMBEDDED_LINKS] block, those are the real URLs
  extracted from PDF hyperlink annotations — always prefer them over display text
- linkedin must be the full linkedin.com URL; github must be the full github.com URL
  (add https:// if the URL is missing the scheme)
- Keep bullet points concise but complete
- Do not invent or hallucinate any information not present in the resume

RESUME TEXT:
"""


async def _parse_resume_with_llm(text: str) -> dict | None:
    """Use Groq to extract full structured resume data. Returns None on failure."""
    try:
        from app.services.groq_limiter import groq_call
        # Send up to 6000 chars — covers most 1–2 page resumes
        snippet = text[:6000].strip()
        raw = await groq_call(
            model=settings.GROQ_FAST_MODEL,
            messages=[{"role": "user", "content": _LLM_PARSE_PROMPT + snippet}],
            temperature=0,
            max_tokens=2000,
        )
        # Strip markdown code fences if present
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
        data = json.loads(raw)
        # Validate it has the expected top-level keys
        if not isinstance(data.get("contact"), dict):
            return None
        return data
    except Exception:
        return None

ALLOWED_TYPES = {
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
}
MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5MB


@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_resume(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
):
    """Upload and parse a resume file (PDF/DOCX)."""
    if file.content_type not in ALLOWED_TYPES and not file.filename.endswith((".pdf", ".docx", ".doc")):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="Only PDF and DOCX files are supported",
        )

    content = await file.read()
    if len(content) > MAX_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File size exceeds 5MB limit",
        )

    supabase = get_supabase()
    file_id = str(uuid.uuid4())

    # ── Run all CPU-bound work concurrently off the event loop ────────────────
    # extract_text (pdfplumber/python-docx), parse_resume (regex/NLP), and
    # embed_text (SentenceTransformer.encode) are all synchronous + CPU-heavy.
    # Wrapping with asyncio.to_thread() prevents blocking other requests.
    storage_path = f"{user_id}/{file_id}/{file.filename}"

    async def _upload_storage():
        try:
            await asyncio.to_thread(
                supabase.storage.from_("resumes").upload,
                storage_path, content,
                {"content-type": file.content_type or "application/octet-stream"},
            )
            signed = await asyncio.to_thread(
                supabase.storage.from_("resumes").create_signed_url,
                storage_path, 3600,
            )
            return signed.get("signedURL") or signed.get("signedUrl")
        except Exception:
            return None

    async def _extract():
        try:
            return await asyncio.to_thread(extract_text, content, file.filename)
        except Exception:
            return None

    # Upload to storage + extract text in parallel — independent operations
    file_url, raw_text = await asyncio.gather(_upload_storage(), _extract())

    if not raw_text:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Failed to read the file. It may be corrupted or password-protected.",
        )
    if len(raw_text.strip()) < 50:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract text from the resume. Please ensure it's not scanned/image-only.",
        )

    # Parse + embed in parallel — LLM extraction and embedding are independent
    async def _embed():
        try:
            return await asyncio.to_thread(embed_text, raw_text[:3000])
        except Exception:
            return None

    llm_data, embedding = await asyncio.gather(
        _parse_resume_with_llm(raw_text),
        _embed(),
    )

    if llm_data:
        parsed_data = llm_data
        # Ensure required keys exist (LLM may omit empty sections)
        parsed_data.setdefault("skills", [])
        parsed_data.setdefault("experience", [])
        parsed_data.setdefault("education", [])
        parsed_data.setdefault("projects", [])
        parsed_data.setdefault("certifications", [])
    else:
        # Regex fallback if LLM fails or times out
        try:
            parsed_data = await asyncio.to_thread(parse_resume, raw_text)
        except Exception:
            parsed_data = {}
        # Name sanity check on regex output
        parsed_name = parsed_data.get("contact", {}).get("name", "")
        if not parsed_name or looks_like_title(parsed_name):
            # Last-resort: ask LLM for just the name
            try:
                from app.services.groq_limiter import groq_call
                snippet = raw_text[:500].strip()
                raw_name = await groq_call(
                    model=settings.GROQ_FAST_MODEL,
                    messages=[{"role": "user", "content": (
                        "Extract the full name of the job candidate from this resume header. "
                        "Reply with ONLY the name. If not found, reply UNKNOWN.\n\n" + snippet
                    )}],
                    temperature=0, max_tokens=20,
                )
                name = raw_name.strip().strip('"\'')
                if name and name.upper() != "UNKNOWN" and re.match(r"^[A-Za-zÀ-ÖØ-öø-ÿ\s\-\.\']+$", name):
                    parsed_data.setdefault("contact", {})["name"] = name
            except Exception:
                pass

    # Deactivate previous + insert new in sequence (ordering matters)
    await asyncio.to_thread(
        lambda: supabase.table("resumes").update({"is_active": False}).eq("user_id", user_id).execute()
    )

    record = {
        "id": file_id,
        "user_id": user_id,
        "file_name": file.filename,
        "file_url": file_url,
        "file_size": len(content),
        "raw_text": raw_text[:50000],
        "parsed_data": parsed_data,
        "embedding": embedding,
        "is_active": True,
    }

    result = await asyncio.to_thread(
        lambda: supabase.table("resumes").insert(record).execute()
    )

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save resume")

    return result.data[0]


@router.get("")
async def list_resumes(user_id: str = Depends(get_current_user_id)):
    """List all resumes for the authenticated user."""
    supabase = get_supabase()
    result = await asyncio.to_thread(
        lambda: supabase.table("resumes")
        .select("id, user_id, file_name, file_url, file_size, is_active, created_at, parsed_data")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
        .execute()
    )
    return result.data or []


@router.get("/{resume_id}")
async def get_resume(
    resume_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Get a specific resume."""
    supabase = get_supabase()
    result = await asyncio.to_thread(
        lambda: supabase.table("resumes")
        .select("*")
        .eq("id", resume_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Resume not found")
    return result.data[0]


@router.patch("/{resume_id}/activate")
async def activate_resume(
    resume_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Set a resume as active."""
    supabase = get_supabase()
    await asyncio.to_thread(
        lambda: supabase.table("resumes").update({"is_active": False}).eq("user_id", user_id).execute()
    )
    result = await asyncio.to_thread(
        lambda: supabase.table("resumes")
        .update({"is_active": True})
        .eq("id", resume_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Resume not found")
    return result.data[0]


@router.delete("/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resume(
    resume_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Delete a resume."""
    supabase = get_supabase()
    await asyncio.to_thread(
        lambda: supabase.table("resumes").delete().eq("id", resume_id).eq("user_id", user_id).execute()
    )
