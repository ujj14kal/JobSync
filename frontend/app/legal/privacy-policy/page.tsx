import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy — JobSynk",
  description: "How JobSynk collects, uses and protects your personal data.",
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen noise" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors mb-8 inline-block">
          ← Back to JobSynk
        </Link>

        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Privacy Policy</h1>
        <p className="text-[13px] text-[var(--text-muted)] mb-10">Last updated: 8 June 2026</p>

        <div className="prose-dark space-y-8 text-[14px] text-[var(--text-secondary)] leading-relaxed">

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">1. Who we are</h2>
            <p>
              JobSynk ("we", "us", "our") is an AI-powered career platform operated by Ujjwal Kalra
              ("owner", "operator"), accessible at <strong>jobsynk.in</strong>. By using JobSynk you
              agree to this Privacy Policy.
            </p>
            <p className="mt-3">Contact: <a href="mailto:ujj.kalra10@gmail.com" className="text-[#C05800] hover:underline">ujj.kalra10@gmail.com</a></p>
          </section>

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">2. Data we collect</h2>
            <div className="space-y-3">
              <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                <div className="font-semibold text-[var(--text-primary)] mb-1">Account data</div>
                <p>Email address, display name, and authentication provider (Google / email). Managed by Supabase Auth.</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                <div className="font-semibold text-[var(--text-primary)] mb-1">Resume &amp; career data</div>
                <p>Resumes you upload (PDF/DOCX), parsed text, embeddings, job descriptions you paste or scrape, and ATS analysis results. Stored privately in your account — never shared.</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                <div className="font-semibold text-[var(--text-primary)] mb-1">AI chat history</div>
                <p>Messages you send to the "Ask Claude" chat assistant. Stored to provide conversation continuity. You can delete all chat history at any time from your settings.</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                <div className="font-semibold text-[var(--text-primary)] mb-1">Payment data</div>
                <p>We do <strong>not</strong> store card numbers or banking details. Payments are processed by Razorpay. We store only the Razorpay order/subscription ID and payment status.</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                <div className="font-semibold text-[var(--text-primary)] mb-1">Token &amp; usage data</div>
                <p>For Pro subscribers, we log the number of AI tokens consumed per feature per month to enforce usage limits and display your usage dashboard. This data is never sold.</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                <div className="font-semibold text-[var(--text-primary)] mb-1">Technical data</div>
                <p>Standard server logs (IP address, browser, request paths) for security and debugging. Retained for 30 days.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">3. Third-party AI services</h2>
            <p className="mb-3">JobSynk uses the following AI providers. When you use a feature powered by an external provider, relevant data (e.g. resume text, chat messages) is sent to that provider:</p>
            <div className="space-y-3">
              <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-[var(--text-primary)]">JobSynk Neural Scorer</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(122,184,64,0.12)", color: "#7ab840" }}>Free tier · scoring · runs on our servers</span>
                </div>
                <p>Our custom-trained PyTorch model (trained on 6,000 resume-job pairs) that produces ATS scores across all 5 dimensions. Runs entirely within JobSynk's own infrastructure — your data is never sent to a third party for scoring.</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-[var(--text-primary)]">Groq (LLaMA 3.3 70B)</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(100,116,139,0.12)", color: "var(--text-muted)" }}>Free tier · feedback text</span>
                </div>
                <p>Used to generate AI feedback text, bullet rewrites, and recruiter commentary on free-tier analyses. Your resume text is sent to Groq's API for this step. <a href="https://groq.com/privacy-policy/" target="_blank" rel="noopener noreferrer" className="text-[#C05800] hover:underline">Groq Privacy Policy</a>. Groq does not use API data to train models.</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-[var(--text-primary)]">Anthropic Claude (claude-sonnet-4-5)</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(192,88,0,0.12)", color: "#C05800" }}>Pro tier only</span>
                </div>
                <p>Used for Pro ATS analysis, resume generation, cover letters, AI interview, and the Ask Claude chat. Data is sent to Anthropic's API. Anthropic's <a href="https://www.anthropic.com/privacy" target="_blank" rel="noopener noreferrer" className="text-[#C05800] hover:underline">Privacy Policy</a> applies. Anthropic does not use API data to train models.</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-semibold text-[var(--text-primary)]">ElevenLabs</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full" style={{ background: "rgba(192,88,0,0.12)", color: "#C05800" }}>Voice interview only</span>
                </div>
                <p>Used to generate spoken interview questions for voice AI interview sessions. Interview question text is sent to ElevenLabs for speech synthesis. <a href="https://elevenlabs.io/privacy" target="_blank" rel="noopener noreferrer" className="text-[#C05800] hover:underline">ElevenLabs Privacy Policy</a>.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">4. How we use your data</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li>To provide the JobSynk service (ATS analysis, resume building, interview practice)</li>
              <li>To enforce usage limits and manage your subscription</li>
              <li>To display your usage dashboard and token consumption</li>
              <li>To send transactional emails (payment receipts, account security)</li>
              <li>To improve the platform — using <em>aggregated, anonymised</em> usage metrics only</li>
            </ul>
            <p className="mt-3 font-semibold text-[var(--text-primary)]">We never: sell your data, use your resume or chat data for advertising, or share your personal information with third parties except as described in Section 3.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">5. Data storage &amp; security</h2>
            <p>All data is stored in Supabase (PostgreSQL), hosted on AWS in the ap-south-1 (Mumbai) region. Resumes are stored in Supabase Storage (private bucket, signed URLs only). Row-level security ensures you can only access your own data. Data in transit is encrypted via TLS 1.3.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">6. Your rights</h2>
            <ul className="space-y-2 list-disc list-inside">
              <li><strong>Access:</strong> Request a copy of all data we hold about you</li>
              <li><strong>Deletion:</strong> Delete your account and all associated data from Settings → Delete Account</li>
              <li><strong>Chat history:</strong> Delete all chat messages from Settings</li>
              <li><strong>Portability:</strong> Export your analysis history as JSON/PDF</li>
            </ul>
            <p className="mt-3">Email <a href="mailto:ujj.kalra10@gmail.com" className="text-[#C05800] hover:underline">ujj.kalra10@gmail.com</a> for any data request.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">7. Cookies</h2>
            <p>We use only functional cookies for authentication (Supabase session). No advertising or analytics cookies. No cookie banner needed.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">8. Changes to this policy</h2>
            <p>We will notify registered users by email at least 7 days before any material change. Continued use after the effective date constitutes acceptance.</p>
          </section>

        </div>
      </div>
    </div>
  );
}
