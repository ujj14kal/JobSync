"""
Lightweight Resend email service.
Uses httpx (already in requirements) so no new dependency is needed.
All sends are fire-and-forget — failures are logged but never raise.
"""
from __future__ import annotations

import logging
import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

RESEND_API = "https://api.resend.com/emails"


async def _send(to: str, subject: str, html: str) -> None:
    if not settings.RESEND_API_KEY:
        logger.debug("[email] RESEND_API_KEY not set — skipping %s", subject)
        return
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            r = await client.post(
                RESEND_API,
                headers={
                    "Authorization": f"Bearer {settings.RESEND_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={"from": settings.EMAIL_FROM, "to": to, "subject": subject, "html": html},
            )
            if r.status_code >= 400:
                logger.warning("[email] Resend %s → %s: %s", subject, r.status_code, r.text[:200])
    except Exception as exc:
        logger.warning("[email] send failed for %s: %s", subject, exc)


async def send_payment_receipt(
    *,
    to: str,
    name: str,
    product_label: str,
    amount_inr: float,
    payment_id: str,
) -> None:
    first = (name or "there").split()[0]
    amount_str = f"₹{amount_inr:,.0f}"
    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#080809;font-family:system-ui,-apple-system,sans-serif;color:#e8e0d8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <h2 style="font-size:20px;font-weight:700;color:#e8e0d8;margin:0 0 6px;">Payment received ✓</h2>
      <p style="font-size:13px;color:#9a8878;margin:0 0 28px;">Hi {first}, thanks for your purchase!</p>

      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#0f0a06;border:1px solid rgba(192,88,0,0.2);border-radius:12px;padding:20px;margin-bottom:28px;">
        <tr>
          <td style="font-size:12px;color:#9a8878;padding-bottom:12px;">Product</td>
          <td style="font-size:13px;font-weight:600;color:#e8e0d8;text-align:right;padding-bottom:12px;">{product_label}</td>
        </tr>
        <tr>
          <td style="font-size:12px;color:#9a8878;padding-bottom:12px;">Amount</td>
          <td style="font-size:13px;font-weight:600;color:#C05800;text-align:right;padding-bottom:12px;">{amount_str}</td>
        </tr>
        <tr>
          <td style="font-size:12px;color:#9a8878;">Payment ID</td>
          <td style="font-size:11px;color:#5a4a3a;text-align:right;font-family:monospace;">{payment_id}</td>
        </tr>
      </table>

      <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
        <tr>
          <td style="background:#C05800;border-radius:10px;padding:11px 22px;">
            <a href="https://jobsynk.app/dashboard" style="color:#fff;font-size:13px;font-weight:600;text-decoration:none;">
              Go to dashboard →
            </a>
          </td>
        </tr>
      </table>

      <p style="font-size:11px;color:#5a4a3a;margin:0;line-height:1.5;">
        Questions about your purchase? Reply to this email.<br/>
        JobSynk · ujj.kalra10@gmail.com
      </p>
    </td></tr>
  </table>
</body>
</html>"""
    await _send(to, f"Your JobSynk receipt — {product_label}", html)


async def send_pro_activated(
    *,
    to: str,
    name: str,
    plan: str,
    amount_inr: float,
    payment_id: str,
) -> None:
    first = (name or "there").split()[0]
    plan_label = "Pro Monthly" if plan == "monthly" else "Pro Yearly"
    amount_str = f"₹{amount_inr:,.0f}"
    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#080809;font-family:system-ui,-apple-system,sans-serif;color:#e8e0d8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <h2 style="font-size:20px;font-weight:700;color:#e8e0d8;margin:0 0 6px;">You're on Pro 🎉</h2>
      <p style="font-size:13px;color:#9a8878;margin:0 0 28px;">Hi {first}, your {plan_label} subscription is now active.</p>

      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#0f0a06;border:1px solid rgba(192,88,0,0.2);border-radius:12px;padding:20px;margin-bottom:20px;">
        <tr>
          <td style="font-size:12px;color:#9a8878;padding-bottom:12px;">Plan</td>
          <td style="font-size:13px;font-weight:600;color:#e8e0d8;text-align:right;padding-bottom:12px;">{plan_label}</td>
        </tr>
        <tr>
          <td style="font-size:12px;color:#9a8878;padding-bottom:12px;">Amount</td>
          <td style="font-size:13px;font-weight:600;color:#C05800;text-align:right;padding-bottom:12px;">{amount_str}</td>
        </tr>
        <tr>
          <td style="font-size:12px;color:#9a8878;">Payment ID</td>
          <td style="font-size:11px;color:#5a4a3a;text-align:right;font-family:monospace;">{payment_id}</td>
        </tr>
      </table>

      <p style="font-size:12px;color:#9a8878;margin:0 0 20px;line-height:1.6;">
        Pro includes unlimited ATS analyses, Claude-powered resume rewrites, voice interview practice, and priority support.
      </p>

      <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
        <tr>
          <td style="background:#C05800;border-radius:10px;padding:11px 22px;">
            <a href="https://jobsynk.app/dashboard" style="color:#fff;font-size:13px;font-weight:600;text-decoration:none;">
              Explore Pro features →
            </a>
          </td>
        </tr>
      </table>

      <p style="font-size:11px;color:#5a4a3a;margin:0;line-height:1.5;">
        JobSynk · ujj.kalra10@gmail.com
      </p>
    </td></tr>
  </table>
</body>
</html>"""
    await _send(to, f"You're on JobSynk {plan_label}!", html)
