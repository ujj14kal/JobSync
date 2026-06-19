import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service — JobSynk",
  description: "JobSynk terms of service, acceptable use, and billing terms.",
};

export default function TermsOfService() {
  return (
    <div className="min-h-screen noise" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/" className="text-[13px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors mb-8 inline-block">
          ← Back to JobSynk
        </Link>

        <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">Terms of Service</h1>
        <p className="text-[13px] text-[var(--text-muted)] mb-10">Last updated: 8 June 2026</p>

        <div className="space-y-8 text-[14px] text-[var(--text-secondary)] leading-relaxed">

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">1. Agreement</h2>
            <p>By creating an account or using JobSynk ("the Service"), you ("User") agree to these Terms of Service with Ujjwal Kalra ("Operator"), the individual who operates JobSynk. If you do not agree, do not use the Service.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">2. The Service</h2>
            <p>JobSynk provides AI-powered tools including ATS resume analysis, resume building, cover letter generation, AI interview practice (text and voice), a career chat assistant, and mentor discovery. Features may change, be added, or be removed at any time.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">3. AI-generated content</h2>
            <div className="p-4 rounded-xl mb-3" style={{ background: "rgba(212,170,48,0.06)", border: "1px solid rgba(212,170,48,0.15)" }}>
              <p className="font-semibold text-[var(--text-primary)] mb-1">Important — read this carefully</p>
              <ul className="space-y-1.5 list-disc list-inside">
                <li>AI outputs (resume text, scores, feedback, chat responses) are <strong>informational only</strong> and not guaranteed to be accurate.</li>
                <li>ATS scores are estimates based on AI analysis and may not reflect actual recruiter or ATS tool outcomes.</li>
                <li>You are solely responsible for reviewing AI-generated content before using it in job applications.</li>
                <li>JobSynk is not liable for any outcomes resulting from the use of AI-generated content.</li>
              </ul>
            </div>
            <p>ATS scoring uses the <strong>JobSynk Neural Scorer</strong> — our custom-trained PyTorch model that runs entirely within JobSynk's own infrastructure (no data sent to any third party for scoring). AI-generated feedback text is produced by <strong>Groq (LLaMA 3.3 70B)</strong> — your resume text is sent to Groq's API for this step. Pro-tier features use <strong>Claude Sonnet by Anthropic</strong>. Voice interview features use <strong>ElevenLabs</strong> for speech synthesis. Use of third-party services is subject to each provider's terms.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">4. Billing &amp; payments</h2>
            <div className="space-y-3">
              <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                <div className="font-semibold text-[var(--text-primary)] mb-2">Free tier</div>
                <p>No payment required. Limited to 3 ATS analyses/day, 2 lifetime resume credits, and 1 free interview. Free features use Groq AI.</p>
              </div>
              <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                <div className="font-semibold text-[var(--text-primary)] mb-2">Pro subscription — ₹299/month or ₹2,499/year</div>
                <ul className="space-y-1 list-disc list-inside text-[13px]">
                  <li>Billed via Razorpay. Renews automatically until cancelled.</li>
                  <li>Monthly limits: 15 Claude Sonnet ATS analyses, 8 AI resume generations, 5 cover letters, 8 AI interview sessions, 150,000 chat tokens (~100–120 messages).</li>
                  <li>Unused quota does not roll over to the next month.</li>
                  <li>Cancel anytime from your billing dashboard. Access continues until end of the billing period. No refunds for partial periods.</li>
                  <li>Yearly plan: cancel within 7 days of purchase for a full refund. After 7 days, no refunds — access continues to year-end.</li>
                </ul>
              </div>
              <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                <div className="font-semibold text-[var(--text-primary)] mb-2">Individual pay-per-use purchases</div>
                <ul className="space-y-1 list-disc list-inside text-[13px]">
                  <li>ATS Deep Analysis: ₹99 for a 5-pack (₹19.80/use)</li>
                  <li>Resume Builder: ₹149 for a 3-pack</li>
                  <li>AI Interview (Voice, ElevenLabs): ₹149 per session</li>
                  <li>Credits are non-expiring (unless otherwise stated) and non-refundable once used.</li>
                </ul>
              </div>
              <div className="p-4 rounded-xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}>
                <div className="font-semibold text-[var(--text-primary)] mb-2">Transaction fees</div>
                <p>Razorpay charges a ~2% transaction fee on all payments. This is included in the prices listed above — you will not be charged extra.</p>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">5. Token usage (Pro)</h2>
            <p>Every Claude Sonnet AI call consumes tokens. Token usage is tracked and visible in your billing dashboard. Monthly limits exist to keep pricing sustainable:</p>
            <ul className="space-y-1 list-disc list-inside mt-2">
              <li>Chat: 150,000 tokens/month (~100–120 messages)</li>
              <li>Each ATS analysis: ~6,000 tokens</li>
              <li>Each resume generation: ~6,000 tokens</li>
            </ul>
            <p className="mt-2">When you approach your chat token limit, you will receive an in-app warning. Token limits reset on the 1st of each month.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">6. Acceptable use</h2>
            <p className="mb-2">You must not:</p>
            <ul className="space-y-1.5 list-disc list-inside">
              <li>Use the Service to generate false, misleading, or fraudulent resume content intended to deceive employers</li>
              <li>Attempt to bypass usage limits through technical means (multiple accounts, API abuse, etc.)</li>
              <li>Use the Service for illegal purposes or in violation of any applicable law</li>
              <li>Upload content you do not have the right to process (e.g. someone else's confidential resume)</li>
              <li>Reverse-engineer, scrape, or extract training data from the Service</li>
            </ul>
            <p className="mt-3">Violation may result in immediate account termination without refund.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">7. Intellectual property</h2>
            <p>You own all content you upload (resumes, job descriptions). You grant JobSynk a limited licence to process this content to provide the Service. AI-generated outputs (resume text, cover letters, interview feedback) are provided to you without restriction — you may use them freely.</p>
            <p className="mt-3">The JobSynk brand, interface, and codebase are owned by the Operator. "Claude" is a trademark of Anthropic, PBC. "ElevenLabs" is a trademark of ElevenLabs, Inc. Use of these names within the Service is for identification only.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">8. Disclaimers &amp; limitation of liability</h2>
            <p>The Service is provided "as is" without warranty of any kind. To the maximum extent permitted by law, the Operator is not liable for any indirect, incidental, or consequential damages arising from use of the Service. JobSynk's total liability shall not exceed the amount paid by you in the last 3 months.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">9. Termination</h2>
            <p>Either party may terminate at any time. You can delete your account in Settings. The Operator may suspend or terminate accounts that violate these Terms. On termination, your data will be deleted within 30 days.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">10. Governing law</h2>
            <p>These Terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in New Delhi, India.</p>
          </section>

          <section>
            <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-3">11. Contact</h2>
            <p>For billing disputes, legal queries, or any other matter: <a href="mailto:hello@jobsynk.in" className="text-[#C05800] hover:underline">hello@jobsynk.in</a></p>
          </section>

        </div>
      </div>
    </div>
  );
}
