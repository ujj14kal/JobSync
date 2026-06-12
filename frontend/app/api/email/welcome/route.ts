import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = "JobSynk <hello@jobsynk.in>";

export async function POST(req: NextRequest) {
  if (!process.env.RESEND_API_KEY) {
    // Silently skip if not configured — welcome email is non-blocking
    return NextResponse.json({ ok: true });
  }

  const { email, name } = await req.json();
  if (!email) return NextResponse.json({ error: "email required" }, { status: 400 });

  const firstName = (name || "there").split(" ")[0];

  const { error } = await resend.emails.send({
    from: FROM,
    to: email,
    subject: `Welcome to JobSynk, ${firstName}!`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;padding:0;background:#080809;font-family:system-ui,-apple-system,sans-serif;color:#e8e0d8;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;padding:40px 24px;">
    <tr><td>
      <!-- Logo -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
        <tr>
          <td style="font-size:18px;font-weight:700;color:#e8e0d8;">
            JobSynk
          </td>
        </tr>
      </table>

      <!-- Hero -->
      <h1 style="font-size:24px;font-weight:700;color:#e8e0d8;margin:0 0 8px;">
        Welcome, ${firstName}! 👋
      </h1>
      <p style="font-size:14px;color:#9a8878;margin:0 0 28px;line-height:1.6;">
        Your account is live. Here's what you can do right now to get the most out of JobSynk.
      </p>

      <!-- Steps -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
        ${[
          ["1", "Upload your resume", "PDF or DOCX — we parse it and use it for every analysis.", "/resume"],
          ["2", "Paste a job URL", "We scrape the posting so you never copy-paste job descriptions.", "/analysis"],
          ["3", "Get your ATS score", "See exactly where your resume falls short and how to fix it.", "/analysis"],
        ].map(([num, title, desc, _href]) => `
        <tr>
          <td style="padding-bottom:16px;">
            <table cellpadding="0" cellspacing="0">
              <tr>
                <td style="width:32px;height:32px;background:#1a0f08;border:1px solid rgba(192,88,0,0.25);border-radius:8px;text-align:center;vertical-align:middle;font-size:12px;font-weight:600;color:#C05800;">${num}</td>
                <td style="padding-left:12px;vertical-align:top;">
                  <div style="font-size:13px;font-weight:600;color:#e8e0d8;">${title}</div>
                  <div style="font-size:12px;color:#9a8878;margin-top:2px;">${desc}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`).join("")}
      </table>

      <!-- CTA -->
      <table cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
        <tr>
          <td style="background:#C05800;border-radius:10px;padding:12px 24px;">
            <a href="https://jobsynk.in/onboarding" style="color:#ffffff;font-size:13px;font-weight:600;text-decoration:none;">
              Get started →
            </a>
          </td>
        </tr>
      </table>

      <!-- Footer -->
      <p style="font-size:11px;color:#5a4a3a;margin:0;line-height:1.5;">
        You're receiving this because you created a JobSynk account.<br/>
        Questions? Reply to this email and we'll help.
      </p>
    </td></tr>
  </table>
</body>
</html>`,
  });

  if (error) {
    console.error("[email/welcome] Resend error:", error);
    return NextResponse.json({ error: "send failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
