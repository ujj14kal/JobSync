"""Resume upload and management endpoints."""
from __future__ import annotations

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
    # Validate
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

    # Upload to Supabase Storage
    storage_path = f"{user_id}/{file_id}/{file.filename}"
    try:
        supabase.storage.from_("resumes").upload(
            storage_path,
            content,
            {"content-type": file.content_type or "application/octet-stream"},
        )
        signed = supabase.storage.from_("resumes").create_signed_url(storage_path, 3600)
        file_url = signed.get("signedURL") or signed.get("signedUrl")
    except Exception as e:
        # If storage fails, continue without URL
        file_url = None

    # Parse resume
    raw_text = extract_text(content, file.filename)
    if not raw_text or len(raw_text.strip()) < 50:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not extract text from the resume. Please ensure it's not scanned/image-only.",
        )

    parsed_data = parse_resume(raw_text)
    embedding = embed_text(raw_text[:3000])

    # Deactivate previous resumes
    supabase.table("resumes").update({"is_active": False}).eq("user_id", user_id).execute()

    # Insert record
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

    result = supabase.table("resumes").insert(record).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to save resume")

    return result.data[0]


@router.get("")
async def list_resumes(user_id: str = Depends(get_current_user_id)):
    """List all resumes for the authenticated user."""
    supabase = get_supabase()
    result = (
        supabase.table("resumes")
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
    result = (
        supabase.table("resumes")
        .select("*")
        .eq("id", resume_id)
        .eq("user_id", user_id)
        .single()
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Resume not found")
    return result.data


@router.patch("/{resume_id}/activate")
async def activate_resume(
    resume_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Set a resume as active."""
    supabase = get_supabase()

    # Deactivate all
    supabase.table("resumes").update({"is_active": False}).eq("user_id", user_id).execute()

    # Activate target
    result = (
        supabase.table("resumes")
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
    supabase.table("resumes").delete().eq("id", resume_id).eq("user_id", user_id).execute()
