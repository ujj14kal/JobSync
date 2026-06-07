"""Job Applications Tracker — CRUD endpoints with status history."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone, timedelta
from collections import defaultdict
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.core.security import get_current_user_id
from app.db.supabase_client import get_supabase

router = APIRouter(prefix="/jobs/applications", tags=["job-tracker"])


# ─── Schemas ─────────────────────────────────────────────────────────────────

class ApplicationCreate(BaseModel):
    job_title: str
    company: str
    job_url: Optional[str] = None
    job_id: Optional[str] = None
    analysis_id: Optional[str] = None
    status: str = "saved"
    applied_date: Optional[str] = None
    notes: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    currency: str = "USD"
    location: Optional[str] = None
    job_type: str = "full-time"
    work_mode: str = "onsite"
    priority: str = "medium"
    ats_score: Optional[int] = None
    follow_up_date: Optional[str] = None


class ApplicationUpdate(BaseModel):
    job_title: Optional[str] = None
    company: Optional[str] = None
    job_url: Optional[str] = None
    status: Optional[str] = None
    applied_date: Optional[str] = None
    notes: Optional[str] = None
    salary_min: Optional[int] = None
    salary_max: Optional[int] = None
    location: Optional[str] = None
    job_type: Optional[str] = None
    work_mode: Optional[str] = None
    priority: Optional[str] = None
    ats_score: Optional[int] = None
    follow_up_date: Optional[str] = None
    rejection_reason: Optional[str] = None
    offer_amount: Optional[int] = None


VALID_STATUSES = {"saved", "applied", "screening", "interviewing", "offer", "rejected", "withdrawn"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


# ─── Routes ──────────────────────────────────────────────────────────────────

@router.get("")
async def list_applications(
    status_filter: Optional[str] = None,
    user_id: str = Depends(get_current_user_id),
):
    """List all job applications for the authenticated user."""
    supabase = get_supabase()
    query = (
        supabase.table("job_applications")
        .select("*")
        .eq("user_id", user_id)
        .order("created_at", desc=True)
    )
    if status_filter and status_filter in VALID_STATUSES:
        query = query.eq("status", status_filter)

    result = query.execute()
    return result.data or []


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_application(
    body: ApplicationCreate,
    user_id: str = Depends(get_current_user_id),
):
    """Add a job to the application tracker, initialising status history."""
    if body.status not in VALID_STATUSES:
        raise HTTPException(400, detail=f"Invalid status. Valid: {VALID_STATUSES}")

    supabase = get_supabase()
    record = {
        "id": str(uuid.uuid4()),
        "user_id": user_id,
        "status_history": [{"status": body.status, "timestamp": _now_iso(), "note": "Initial"}],
        **body.model_dump(exclude_none=True),
    }
    result = supabase.table("job_applications").insert(record).execute()
    if not result.data:
        raise HTTPException(500, detail="Failed to create application")
    return result.data[0]


@router.patch("/{application_id}")
async def update_application(
    application_id: str,
    body: ApplicationUpdate,
    user_id: str = Depends(get_current_user_id),
):
    """Update a job application. Appends to status_history when status changes."""
    supabase = get_supabase()
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(400, detail="No fields to update")

    if "status" in updates and updates["status"] not in VALID_STATUSES:
        raise HTTPException(400, detail=f"Invalid status. Valid: {VALID_STATUSES}")

    # Append to status history when status changes
    if "status" in updates:
        current = (
            supabase.table("job_applications")
            .select("status, status_history")
            .eq("id", application_id)
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        if current.data and current.data.get("status") != updates["status"]:
            history = current.data.get("status_history") or []
            history.append({"status": updates["status"], "timestamp": _now_iso()})
            updates["status_history"] = history

    result = (
        supabase.table("job_applications")
        .update(updates)
        .eq("id", application_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(404, detail="Application not found")
    return result.data[0]


@router.delete("/{application_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_application(
    application_id: str,
    user_id: str = Depends(get_current_user_id),
):
    """Delete a job application."""
    supabase = get_supabase()
    supabase.table("job_applications").delete().eq("id", application_id).eq("user_id", user_id).execute()


@router.get("/stats")
async def get_application_stats(user_id: str = Depends(get_current_user_id)):
    """Summary stats + weekly activity for the user's job tracker."""
    supabase = get_supabase()
    result = (
        supabase.table("job_applications")
        .select("status, ats_score, created_at")
        .eq("user_id", user_id)
        .execute()
    )
    apps = result.data or []

    status_counts: dict[str, int] = {}
    for app in apps:
        s = app.get("status", "saved")
        status_counts[s] = status_counts.get(s, 0) + 1

    scores = [a["ats_score"] for a in apps if a.get("ats_score")]
    avg_score = round(sum(scores) / len(scores), 1) if scores else None

    total = len(apps)
    active = (
        status_counts.get("applied", 0)
        + status_counts.get("screening", 0)
        + status_counts.get("interviewing", 0)
    )
    response_rate = round((active / total * 100), 1) if total > 0 else 0

    # Weekly activity — last 8 weeks (index 0 = oldest, 7 = this week)
    now = datetime.now(timezone.utc)
    weekly_counts: dict[int, int] = defaultdict(int)
    for app in apps:
        try:
            created = datetime.fromisoformat(app["created_at"].replace("Z", "+00:00"))
            days_ago = (now - created).days
            week_idx = days_ago // 7
            if 0 <= week_idx < 8:
                weekly_counts[7 - week_idx] += 1
        except (ValueError, TypeError, KeyError):
            pass

    weekly_activity = [
        {
            "week": f"{(now - timedelta(weeks=(7 - w))).month}/{(now - timedelta(weeks=(7 - w))).day}",
            "count": weekly_counts.get(w, 0),
        }
        for w in range(8)
    ]

    return {
        "total": total,
        "by_status": status_counts,
        "avg_ats_score": avg_score,
        "response_rate": response_rate,
        "offers": status_counts.get("offer", 0),
        "rejections": status_counts.get("rejected", 0),
        "weekly_activity": weekly_activity,
    }
