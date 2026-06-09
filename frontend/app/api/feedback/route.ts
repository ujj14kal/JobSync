import { NextResponse } from "next/server";

export async function POST(req: Request) {
  try {
    const { rating, feedback, feature, analysisId } = await req.json();

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error("[feedback] RESEND_API_KEY not set — email not sent");
      return NextResponse.json({ ok: true, warn: "email_skipped" });
    }

    const subject = `[JobSynk Feedback] ${rating}⭐ — ${feature ?? "General"}`;
    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0a0a12;color:#e2e8f0;padding:32px;border-radius:12px;">
        <h2 style="color:#C05800;margin:0 0 8px;">JobSynk User Feedback</h2>
        <p style="color:#64748b;font-size:13px;margin:0 0 24px;">Submitted via in-app feedback prompt</p>

        <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
          <tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;width:140px;">Rating</td>
              <td style="padding:8px 0;font-size:20px;">${"⭐".repeat(rating)}${"☆".repeat(5 - rating)}</td></tr>
          <tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;">Feature</td>
              <td style="padding:8px 0;font-size:13px;color:#e2e8f0;">${feature ?? "—"}</td></tr>
          ${analysisId ? `<tr><td style="padding:8px 0;color:#94a3b8;font-size:13px;">Analysis ID</td>
              <td style="padding:8px 0;font-size:13px;color:#e2e8f0;">${analysisId}</td></tr>` : ""}
        </table>

        <div style="background:#1e1e2e;border:1px solid rgba(255,255,255,0.08);border-radius:8px;padding:16px;">
          <p style="color:#94a3b8;font-size:12px;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.05em;">Feedback</p>
          <p style="color:#e2e8f0;font-size:14px;margin:0;line-height:1.6;">${feedback?.trim() || "(no text provided)"}</p>
        </div>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "JobSynk Feedback <onboarding@resend.dev>",
        to: "ujj.kalra10@gmail.com",
        reply_to: "noreply@jobsynk.in",
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[feedback] Resend error:", err);
      return NextResponse.json({ ok: false, error: "email_failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[feedback] unexpected error:", e);
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
