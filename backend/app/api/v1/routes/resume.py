"""Resume upload and management endpoints."""
from __future__ import annotations

import asyncio
import uuid
from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from app.core.security import get_current_user_id
from app.db.supabase_client import get_supabase
from app.services.resume_parser import extract_text, parse_resume
from app.services.embedding_service import embed_text

router = APIRouter(prefix="/resume", tags=["resume"])

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

    # Parse + embed in parallel — both depend on raw_text but not each other
    async def _parse():
        try:
            return await asyncio.to_thread(parse_resume, raw_text)
        except Exception:
            return {}

    async def _embed():
        try:
            return await asyncio.to_thread(embed_text, raw_text[:3000])
        except Exception:
            return None

    parsed_data, embedding = await asyncio.gather(_parse(), _embed())

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
