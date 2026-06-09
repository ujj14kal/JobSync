import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { topic, message, email } = await req.json();

    if (!topic || !message?.trim()) {
      return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[support] RESEND_API_KEY not set — email not sent");
      return NextResponse.json({ ok: true, warn: "email_skipped" });
    }

    const subject = `[JobSynk Support] ${topic}`;
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a12;color:#e2e8f0;padding:32px;border-radius:12px;">
        <h2 style="color:#C05800;margin:0 0 8px;">JobSynk Support Request</h2>
        <p style="color:#64748b;font-size:13px;margin:0 0 24px;">Submitted via the support page</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;width:140px;">Topic</td>
              <td style="padding:8px 0;font-size:14px;color:#e2e8f0;font-weight:600;">${topic}</td></tr>
          ${email ? `<tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;">User email</td>
              <td style="padding:8px 0;font-size:13px;color:#e2e8f0;">${email}</td></tr>` : ""}
        </table>

        <div style="background:#1e1e2e;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;">
          <p style="color:#94a3b8;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.05em;">Message</p>
          <p style="color:#e2e8f0;font-size:14px;margin:0;line-height:1.6;white-space:pre-wrap;">${message.trim()}</p>
        </div>
      </div>
    `;

    const replyTo = email ? email : "noreply@jobsynk.in";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "JobSynk Support <onboarding@resend.dev>",
        to: "ujj.kalra10@gmail.com",
        reply_to: replyTo,
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[support] Resend error:", err);
      return NextResponse.json({ ok: false, error: "email_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[support] unexpected error:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
