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
            <a href="https://jobsynk.in/dashboard" style="color:#fff;font-size:13px;font-weight:600;text-decoration:none;">
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
            <a href="https://jobsynk.in/dashboard" style="color:#fff;font-size:13px;font-weight:600;text-decoration:none;">
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


async def send_welcome_email(*, to: str, name: str) -> None:
    first = (name or "there").split()[0]
    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080809;font-family:system-ui,-apple-system,sans-serif;color:#e8e0d8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <p style="font-size:13px;color:#C05800;font-weight:600;margin:0 0 16px;letter-spacing:0.05em;">JOBSYNK</p>
      <h2 style="font-size:22px;font-weight:700;color:#e8e0d8;margin:0 0 8px;">Welcome, {first}.</h2>
      <p style="font-size:14px;color:#9a8878;margin:0 0 28px;line-height:1.6;">
        You've got <strong style="color:#e8e0d8;">3 ATS analyses per day</strong>, free — no card needed.
        Here's what to do first:
      </p>

      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        {"".join(f'''<tr><td style="padding:12px 0;border-bottom:1px solid rgba(255,255,255,0.06);">
          <p style="margin:0;font-size:13px;font-weight:600;color:#e8e0d8;">{step}</p>
          <p style="margin:4px 0 0;font-size:12px;color:#9a8878;">{desc}</p>
        </td></tr>''' for step, desc in [
            ("1. Run your first analysis", "Paste a job URL from LinkedIn, Naukri, or any job board and upload your resume. You'll get a full AI report in ~30 seconds."),
            ("2. Check missing keywords", "See exactly which keywords your resume is missing for that specific role — and which ones matter most."),
            ("3. Try the interview prep tab", "After your analysis, open the Interview Prep tab for 8 role-specific questions generated from that job's JD."),
        ])}
      </table>

      <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
        <tr>
          <td style="background:#C05800;border-radius:10px;padding:12px 24px;">
            <a href="https://jobsynk.in/analysis" style="color:#fff;font-size:13px;font-weight:600;text-decoration:none;">
              Run your first analysis →
            </a>
          </td>
        </tr>
      </table>

      <p style="font-size:11px;color:#5a4a3a;margin:0;line-height:1.6;">
        Questions? Just reply to this email — I read every one.<br/>
        Ujjwal · Founder, JobSynk
      </p>
    </td></tr>
  </table>
</body>
</html>"""
    await _send(to, "Welcome to JobSynk — here's how to get the most out of it", html)


async def send_analysis_complete_email(
    *,
    to: str,
    name: str,
    job_title: str,
    company: str,
    overall_score: int,
    match_tier: str,
    analysis_id: str,
    missing_keywords: list[str],
) -> None:
    first = (name or "there").split()[0]
    score_color = (
        "#10b981" if overall_score >= 75 else
        "#3b82f6" if overall_score >= 55 else
        "#f59e0b" if overall_score >= 35 else
        "#ef4444"
    )
    top_kw = missing_keywords[:5]
    kw_html = "".join(
        f'<span style="display:inline-block;margin:3px 4px 3px 0;padding:4px 10px;background:rgba(192,88,0,0.12);border:1px solid rgba(192,88,0,0.25);border-radius:20px;font-size:11px;color:#C05800;">{kw}</span>'
        for kw in top_kw
    ) if top_kw else '<p style="font-size:12px;color:#9a8878;margin:0;">No critical keywords missing — great coverage!</p>'

    html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#080809;font-family:system-ui,-apple-system,sans-serif;color:#e8e0d8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <p style="font-size:13px;color:#C05800;font-weight:600;margin:0 0 16px;letter-spacing:0.05em;">JOBSYNK</p>
      <h2 style="font-size:20px;font-weight:700;color:#e8e0d8;margin:0 0 6px;">Your analysis is ready</h2>
      <p style="font-size:13px;color:#9a8878;margin:0 0 24px;">{job_title} · {company}</p>

      <table width="100%" cellpadding="0" cellspacing="0"
             style="background:#0f0a06;border:1px solid rgba(192,88,0,0.2);border-radius:12px;padding:20px 20px 16px;margin-bottom:24px;">
        <tr>
          <td style="text-align:center;padding-bottom:16px;">
            <p style="margin:0;font-size:48px;font-weight:800;color:{score_color};line-height:1;">{overall_score}</p>
            <p style="margin:4px 0 0;font-size:12px;color:#9a8878;">Overall Score · {match_tier}</p>
          </td>
        </tr>
        <tr>
          <td style="border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">
            <p style="margin:0 0 10px;font-size:11px;color:#9a8878;text-transform:uppercase;letter-spacing:0.08em;">Missing keywords to add</p>
            {kw_html}
          </td>
        </tr>
      </table>

      <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
        <tr>
          <td style="background:#C05800;border-radius:10px;padding:12px 24px;">
            <a href="https://jobsynk.in/analysis/{analysis_id}" style="color:#fff;font-size:13px;font-weight:600;text-decoration:none;">
              View full report →
            </a>
          </td>
        </tr>
      </table>

      <p style="font-size:11px;color:#5a4a3a;margin:0;line-height:1.6;">
        JobSynk · <a href="https://jobsynk.in" style="color:#5a4a3a;">jobsynk.in</a>
      </p>
    </td></tr>
  </table>
</body>
</html>"""
    await _send(to, f"Your JobSynk score: {overall_score}/100 for {job_title} at {company}", html)
