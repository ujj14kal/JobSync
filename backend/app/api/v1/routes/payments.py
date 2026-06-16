"""
Razorpay payment routes.

Individual purchases  → create_order  → verify_payment  → add credits
Subscriptions        → create_subscription → webhook → set plan=pro
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone, timedelta

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request, Header
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import get_current_user_id
from app.db.supabase_client import get_supabase
from app.services.claude_client import get_user_plan, get_monthly_usage
from app.services.email_service import send_payment_receipt, send_pro_activated

router = APIRouter(prefix="/payments", tags=["payments"])
logger = logging.getLogger(__name__)

# ── Price catalogue (paise = ₹ × 100) ────────────────────────────────────────
PRODUCTS = {
    "ats_deep":        {"label": "ATS Deep Analysis (5-pack)", "amount": 9900,  "credits": 5, "type": "ats_deep"},
    "resume_pack":     {"label": "Resume Builder (3-pack)",    "amount": 14900, "credits": 3, "type": "resume"},
    "interview_voice": {"label": "AI Interview · ElevenLabs",  "amount": 14900, "credits": 1, "type": "interview_voice"},
}

SUBSCRIPTIONS = {
    "pro_monthly": {"label": "Pro Monthly", "amount": 29900},   # ₹299
    "pro_yearly":  {"label": "Pro Yearly",  "amount": 249900},  # ₹2499
}


def _rzp():
    if not settings.RAZORPAY_KEY_ID or not settings.RAZORPAY_KEY_SECRET:
        raise HTTPException(503, "Payment gateway not configured.")
    return razorpay.Client(auth=(settings.RAZORPAY_KEY_ID, settings.RAZORPAY_KEY_SECRET))


async def _user_contact(user_id: str) -> tuple[str, str]:
    """Return (email, full_name) for a user, empty strings on failure."""
    try:
        supabase = get_supabase()
        row = await asyncio.to_thread(
            lambda: supabase.table("user_profiles")
            .select("email,full_name")
            .eq("id", user_id)
            .single()
            .execute()
        )
        d = row.data or {}
        return d.get("email") or "", d.get("full_name") or ""
    except Exception:
        return "", ""


def _verify_signature(order_id: str, payment_id: str, signature: str) -> bool:
    msg = f"{order_id}|{payment_id}"
    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(),
        msg.encode(),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


# ── Subscription helpers ───────────────────────────────────────────────────────

async def _activate_pro(user_id: str, cycle: str, sub_id: str, end: datetime) -> None:
    supabase = get_supabase()
    await asyncio.to_thread(
        lambda: supabase.table("user_subscriptions").upsert({
            "user_id":                  user_id,
            "plan":                     "pro",
            "billing_cycle":            cycle,
            "status":                   "active",
            "razorpay_subscription_id": sub_id,
            "current_period_start":     datetime.now(timezone.utc).isoformat(),
            "current_period_end":       end.isoformat(),
            "updated_at":               datetime.now(timezone.utc).isoformat(),
        }, on_conflict="user_id").execute()
    )


async def _expire_pro(user_id: str) -> None:
    supabase = get_supabase()
    await asyncio.to_thread(
        lambda: supabase.table("user_subscriptions").update({
            "plan":       "free",
            "status":     "expired",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).execute()
    )


# ── Routes ────────────────────────────────────────────────────────────────────

class CreateOrderRequest(BaseModel):
    product_id: str  # key from PRODUCTS


class VerifyPaymentRequest(BaseModel):
    razorpay_order_id:   str
    razorpay_payment_id: str
    razorpay_signature:  str
    product_id:          str


class CreateSubscriptionRequest(BaseModel):
    plan: str  # 'pro_monthly' | 'pro_yearly'


class VerifySubscriptionRequest(BaseModel):
    razorpay_payment_id:    str
    razorpay_subscription_id: str
    razorpay_signature:     str
    plan:                   str


@router.get("/plans")
async def get_plans():
    """Return pricing catalogue + Razorpay key (safe to expose)."""
    return {
        "razorpay_key_id": settings.RAZORPAY_KEY_ID,
        "products": PRODUCTS,
        "subscriptions": SUBSCRIPTIONS,
        "currency": "INR",
    }


@router.get("/my-plan")
async def my_plan(user_id: str = Depends(get_current_user_id)):
    """Return current subscription + monthly usage for the billing dashboard."""
    supabase = get_supabase()

    sub = await asyncio.to_thread(
        lambda: supabase.table("user_subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    usage = await get_monthly_usage(user_id)
    credits = await asyncio.to_thread(
        lambda: supabase.table("user_credits")
        .select("credit_type, credits_total, credits_used")
        .eq("user_id", user_id)
        .execute()
    )

    row = sub.data[0] if sub.data else {"plan": "free", "status": "active"}
    return {
        "subscription": row,
        "has_pending_upgrade": bool(row.get("pending_yearly_sub_id")),
        "upgrade_scheduled_for": row.get("upgrade_scheduled_for"),
        "monthly_usage": usage,
        "credits": credits.data or [],
        "limits": {
            "ats":       settings.PRO_MONTHLY_ATS,
            "resume":    settings.PRO_MONTHLY_RESUMES,
            "cover":     settings.PRO_MONTHLY_COVERS,
            "interview": settings.PRO_MONTHLY_INTERVIEWS,
            "voice":     settings.PRO_MONTHLY_VOICE,
            "chat_tokens": settings.PRO_MONTHLY_CHAT_TOKENS,
        },
    }


# ── Individual purchase ───────────────────────────────────────────────────────

@router.post("/create-order")
async def create_order(
    req: CreateOrderRequest,
    user_id: str = Depends(get_current_user_id),
):
    product = PRODUCTS.get(req.product_id)
    if not product:
        raise HTTPException(400, "Unknown product.")

    client = _rzp()
    order = await asyncio.to_thread(
        lambda: client.order.create({
            "amount":   product["amount"],
            "currency": "INR",
            "notes":    {"user_id": user_id, "product_id": req.product_id},
        })
    )
    return {
        "order_id":   order["id"],
        "amount":     order["amount"],
        "currency":   "INR",
        "product":    product,
        "razorpay_key_id": settings.RAZORPAY_KEY_ID,
    }


@router.post("/verify-payment")
async def verify_payment(
    req: VerifyPaymentRequest,
    user_id: str = Depends(get_current_user_id),
):
    if not _verify_signature(req.razorpay_order_id, req.razorpay_payment_id, req.razorpay_signature):
        raise HTTPException(400, "Payment verification failed.")

    product = PRODUCTS.get(req.product_id)
    if not product:
        raise HTTPException(400, "Unknown product.")

    supabase = get_supabase()
    # Idempotency guard: don't double-grant credits for the same order
    existing = await asyncio.to_thread(
        lambda: supabase.table("user_credits")
        .select("id")
        .eq("razorpay_order_id", req.razorpay_order_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        return {"success": True, "credits_added": 0, "type": product["type"], "already_applied": True}
    await asyncio.to_thread(
        lambda: supabase.table("user_credits").insert({
            "user_id":          user_id,
            "credit_type":      product["type"],
            "credits_total":    product["credits"],
            "credits_used":     0,
            "razorpay_order_id": req.razorpay_order_id,
        }).execute()
    )
    email, name = await _user_contact(user_id)
    if email:
        asyncio.create_task(send_payment_receipt(
            to=email,
            name=name,
            product_label=product["label"],
            amount_inr=product["amount"] / 100,
            payment_id=req.razorpay_payment_id,
        ))

    return {"success": True, "credits_added": product["credits"], "type": product["type"]}


# ── Subscription ──────────────────────────────────────────────────────────────

@router.post("/create-subscription")
async def create_subscription(
    req: CreateSubscriptionRequest,
    user_id: str = Depends(get_current_user_id),
):
    plan_info = SUBSCRIPTIONS.get(req.plan)
    if not plan_info:
        raise HTTPException(400, "Unknown plan.")

    # Use pre-created Razorpay plan IDs from config
    plan_id = (
        settings.RAZORPAY_PLAN_MONTHLY if req.plan == "pro_monthly"
        else settings.RAZORPAY_PLAN_YEARLY
    )
    if not plan_id:
        raise HTTPException(503, "Subscription plan not configured yet.")

    client = _rzp()
    sub = await asyncio.to_thread(
        lambda: client.subscription.create({
            "plan_id":        plan_id,
            "total_count":    120,   # max 120 billing cycles (10 years)
            "notes":          {"user_id": user_id, "plan": req.plan},
        })
    )
    return {
        "subscription_id": sub["id"],
        "plan":            req.plan,
        "razorpay_key_id": settings.RAZORPAY_KEY_ID,
    }


@router.post("/verify-subscription")
async def verify_subscription(
    req: VerifySubscriptionRequest,
    user_id: str = Depends(get_current_user_id),
):
    # Verify subscription signature
    msg = f"{req.razorpay_payment_id}|{req.razorpay_subscription_id}"
    expected = hmac.new(
        settings.RAZORPAY_KEY_SECRET.encode(),
        msg.encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, req.razorpay_signature):
        raise HTTPException(400, "Subscription verification failed.")

    cycle = "monthly" if req.plan == "pro_monthly" else "yearly"
    delta = timedelta(days=31 if cycle == "monthly" else 366)
    await _activate_pro(
        user_id, cycle,
        req.razorpay_subscription_id,
        datetime.now(timezone.utc) + delta,
    )
    amount_inr = SUBSCRIPTIONS[req.plan]["amount"] / 100
    email, name = await _user_contact(user_id)
    if email:
        asyncio.create_task(send_pro_activated(
            to=email,
            name=name,
            plan=cycle,
            amount_inr=amount_inr,
            payment_id=req.razorpay_payment_id,
        ))
    return {"success": True, "plan": "pro", "billing_cycle": cycle}


@router.post("/schedule-upgrade")
async def schedule_upgrade(user_id: str = Depends(get_current_user_id)):
    """Pro Monthly → Pro Yearly: schedules the yearly sub to start when the current monthly ends.
    Cancels monthly at cycle end so there's no double-charge."""
    supabase = get_supabase()

    sub_row = await asyncio.to_thread(
        lambda: supabase.table("user_subscriptions")
        .select("*")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not sub_row.data:
        raise HTTPException(404, "No subscription found.")

    current = sub_row.data[0]
    if current.get("plan") != "pro" or current.get("billing_cycle") != "monthly":
        raise HTTPException(400, "Schedule upgrade is only available for Pro Monthly subscribers.")

    period_end = current.get("current_period_end")
    if not period_end:
        raise HTTPException(400, "Cannot determine current period end date.")

    if not settings.RAZORPAY_PLAN_YEARLY:
        raise HTTPException(503, "Yearly plan not configured on server.")

    end_dt = datetime.fromisoformat(period_end.replace("Z", "+00:00"))
    start_at_unix = int(end_dt.timestamp())

    # Cancel the monthly subscription at cycle end (no immediate cancellation)
    rzp_sub_id = current.get("razorpay_subscription_id")
    client = _rzp()
    if rzp_sub_id:
        await asyncio.to_thread(
            lambda: client.subscription.cancel(rzp_sub_id, {"cancel_at_cycle_end": 1})
        )

    # Create yearly subscription scheduled to start when monthly ends
    new_sub = await asyncio.to_thread(
        lambda: client.subscription.create({
            "plan_id":     settings.RAZORPAY_PLAN_YEARLY,
            "total_count": 12,
            "start_at":    start_at_unix,
            "notes":       {"user_id": user_id, "plan": "pro_yearly"},
        })
    )

    # Store pending upgrade details
    await asyncio.to_thread(
        lambda: supabase.table("user_subscriptions").update({
            "pending_yearly_sub_id": new_sub["id"],
            "upgrade_scheduled_for": end_dt.isoformat(),
            "updated_at":            datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).execute()
    )

    return {
        "subscription_id":  new_sub["id"],
        "razorpay_key_id":  settings.RAZORPAY_KEY_ID,
        "starts_at":        end_dt.isoformat(),
        "starts_at_label":  end_dt.strftime("%B %d, %Y"),
    }


@router.post("/cancel-subscription")
async def cancel_subscription(user_id: str = Depends(get_current_user_id)):
    supabase = get_supabase()
    sub = await asyncio.to_thread(
        lambda: supabase.table("user_subscriptions")
        .select("razorpay_subscription_id")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not sub.data or not sub.data[0].get("razorpay_subscription_id"):
        raise HTTPException(404, "No active subscription found.")

    sub_id = sub.data[0]["razorpay_subscription_id"]
    client = _rzp()
    await asyncio.to_thread(lambda: client.subscription.cancel(sub_id, {"cancel_at_cycle_end": 1}))

    await asyncio.to_thread(
        lambda: supabase.table("user_subscriptions").update({
            "status":     "cancelled",
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("user_id", user_id).execute()
    )
    return {"success": True, "message": "Subscription cancelled. Access continues until end of billing period."}


# ── Razorpay webhook (server-to-server) ───────────────────────────────────────

@router.post("/webhook", include_in_schema=False)
async def razorpay_webhook(
    request: Request,
    x_razorpay_signature: str = Header(None),
):
    body = await request.body()

    # Verify webhook signature — always required
    if not settings.RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(503, "Webhook secret not configured.")
    expected = hmac.new(
        settings.RAZORPAY_WEBHOOK_SECRET.encode(),
        body,
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected, x_razorpay_signature or ""):
        raise HTTPException(400, "Webhook signature invalid.")

    event = json.loads(body)
    event_type = event.get("event", "")
    logger.info("Razorpay webhook: %s", event_type)

    if event_type == "subscription.charged":
        payload = event["payload"]["subscription"]["entity"]
        notes   = payload.get("notes", {})
        user_id = notes.get("user_id")
        plan    = notes.get("plan", "pro_monthly")
        if user_id:
            cycle = "monthly" if plan == "pro_monthly" else "yearly"
            delta = timedelta(days=31 if cycle == "monthly" else 366)
            await _activate_pro(user_id, cycle, payload["id"], datetime.now(timezone.utc) + delta)
            # Clear pending upgrade marker if this is the scheduled yearly firing
            if cycle == "yearly":
                supabase = get_supabase()
                await asyncio.to_thread(
                    lambda: supabase.table("user_subscriptions").update({
                        "pending_yearly_sub_id": None,
                        "upgrade_scheduled_for": None,
                    }).eq("user_id", user_id).execute()
                )

    elif event_type in ("subscription.cancelled", "subscription.expired"):
        payload = event["payload"]["subscription"]["entity"]
        notes   = payload.get("notes", {})
        user_id = notes.get("user_id")
        if user_id:
            await _expire_pro(user_id)

    return {"status": "ok"}
