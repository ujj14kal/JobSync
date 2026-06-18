import Link from "next/link";

export const metadata = {
  title: "Terms of Service — JobSynk",
  description: "Terms and conditions for using JobSynk.",
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-10">
    <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
    <div className="text-sm leading-relaxed space-y-3" style={{ color: "rgba(148,163,184,0.9)" }}>
      {children}
    </div>
  </section>
);

export default function TermsPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base, #0a0a0f)" }}>
      {/* Nav */}
      <header className="border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <img src="/logo.png" alt="JobSynk" className="w-6 h-6 object-contain" />
            <span className="text-sm font-semibold" style={{ color: "rgba(226,232,240,0.9)" }}>JobSynk</span>
          </Link>
          <Link href="/" className="text-xs hover:text-white transition-colors" style={{ color: "rgba(148,163,184,0.7)" }}>
            ← Back to home
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-16">
        {/* Header */}
        <div className="mb-12">
          <div
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-6"
            style={{ background: "rgba(192,88,0,0.10)", border: "1px solid rgba(192,88,0,0.25)", color: "#e89848" }}
          >
            Legal
          </div>
          <h1 className="text-4xl font-bold text-white mb-4">Terms of Service</h1>
          <p style={{ color: "rgba(148,163,184,0.7)" }} className="text-sm">
            Last updated: June 7, 2026 &nbsp;·&nbsp; Effective: June 7, 2026
          </p>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: "rgba(148,163,184,0.85)" }}>
            These Terms of Service ("Terms") govern your use of JobSynk ("the Service"), operated by
            Ujjwal Kalra ("we", "us"). By creating an account or using JobSynk, you agree to these Terms.
            If you do not agree, do not use the Service.
          </p>
        </div>

        {/* 1 */}
        <Section title="1. What JobSynk Is">
          <p>
            JobSynk is a free AI-powered career tool that helps job seekers analyze their resumes against
            job descriptions, identify skill gaps, track job applications, and prepare for interviews.
          </p>
          <p>
            JobSynk is an independent project, not a registered company or professional career consultancy.
            It is provided "as is" as a best-effort free service.
          </p>
        </Section>

        {/* 2 */}
        <Section title="2. Eligibility">
          <p>You must be at least 13 years old to use JobSynk. By using the Service you confirm you meet this requirement.</p>
          <p>If you are under 18, you confirm you have parental or guardian consent to create an account.</p>
        </Section>

        {/* 3 */}
        <Section title="3. Your Account">
          <p>You are responsible for keeping your account credentials secure. Do not share your password. Notify us immediately if you suspect unauthorized access at{" "}
            <a href="mailto:hello@jobsynk.in" className="underline" style={{ color: "#C05800" }}>hello@jobsynk.in</a>.
          </p>
          <p>You are responsible for all activity that occurs under your account.</p>
        </Section>

        {/* 4 */}
        <Section title="4. Acceptable Use">
          <p>You agree <strong className="text-white">not</strong> to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Use JobSynk to analyze resumes or job descriptions on behalf of third parties for commercial purposes (e.g., running an ATS-optimization business using our API).</li>
            <li>Attempt to reverse-engineer, scrape, or extract our AI models, embeddings, or scoring algorithms.</li>
            <li>Upload resumes containing other people&apos;s personal data without their consent.</li>
            <li>Use the Service to generate content that is false, defamatory, or intended to deceive employers.</li>
            <li>Attempt to circumvent rate limits, abuse the API, or perform automated bulk analysis.</li>
            <li>Use the Service for any illegal purpose under applicable law.</li>
          </ul>
        </Section>

        {/* 5 */}
        <Section title="5. AI Output Disclaimer">
          <p>
            JobSynk uses AI models to generate resume scores, skill gap analyses, bullet-point rewrites,
            interview questions, and job status classifications. These outputs are{" "}
            <strong className="text-white">informational only</strong> and not professional career advice.
          </p>
          <p>
            AI-generated content can be inaccurate, incomplete, or biased. We make no guarantee that:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>A high ATS score will result in an interview or job offer.</li>
            <li>The skill gap analysis reflects the actual requirements of any specific employer.</li>
            <li>AI-rewritten resume bullets are suitable for your specific situation.</li>
            <li>Gmail status classifications accurately reflect the state of your application.</li>
          </ul>
          <p>Always apply your own judgment. JobSynk is a tool to inform your decisions, not replace them.</p>
        </Section>

        {/* 6 */}
        <Section title="6. Your Content">
          <p>
            You retain full ownership of any content you upload to JobSynk — resumes, cover letters,
            job descriptions, or notes. By uploading content, you grant us a limited, non-exclusive
            license to process it for the sole purpose of providing the Service to you.
          </p>
          <p>We do not use your content to train AI models. We do not share your content with other users.</p>
        </Section>

        {/* 7 */}
        <Section title="7. Gmail Integration">
          <p>
            If you connect your Gmail account, you authorize JobSynk to read job-related email metadata
            (subjects, sender info, snippets) to automatically update your job application statuses.
            This authorization is governed by Google&apos;s OAuth terms and our{" "}
            <Link href="/privacy" className="underline" style={{ color: "#C05800" }}>Privacy Policy</Link>.
          </p>
          <p>You can revoke this authorization at any time from the Job Tracker page or via your{" "}
            <a href="https://myaccount.google.com/permissions" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#C05800" }}>
              Google account permissions
            </a>.
          </p>
        </Section>

        {/* 8 */}
        <Section title="8. Availability & Changes">
          <p>
            JobSynk is a free, independently operated service. We do not guarantee 100% uptime,
            uninterrupted access, or that any specific feature will remain available permanently.
          </p>
          <p>
            We may modify, suspend, or discontinue the Service (or any part of it) at any time
            without notice, though we will try to give reasonable notice for major changes.
          </p>
          <p>
            We may update these Terms at any time. Continued use after changes constitutes acceptance.
            The "Last updated" date at the top always reflects the current version.
          </p>
        </Section>

        {/* 9 */}
        <Section title="9. Limitation of Liability">
          <p>
            To the maximum extent permitted by applicable law, JobSynk and its operator shall not be
            liable for any indirect, incidental, special, consequential, or punitive damages,
            including but not limited to: loss of job opportunities, missed interview callbacks,
            incorrect career decisions made based on AI output, or data loss.
          </p>
          <p>
            Our total liability for any claim arising from your use of the Service is limited to
            the amount you paid us in the past 12 months — which, since the Service is free,
            is zero.
          </p>
          <p>
            Some jurisdictions do not allow limitation of liability for certain types of damages.
            In such cases, our liability is limited to the maximum extent permitted by law.
          </p>
        </Section>

        {/* 10 */}
        <Section title="10. Indemnification">
          <p>
            You agree to indemnify and hold harmless JobSynk and its operator from any claims,
            damages, losses, or expenses (including legal fees) arising from: your violation of
            these Terms, your use of the Service in an unlawful way, or content you upload that
            infringes a third party&apos;s rights.
          </p>
        </Section>

        {/* 11 */}
        <Section title="11. Intellectual Property">
          <p>
            The JobSynk name, logo, UI design, and proprietary AI scoring methodology are owned
            by Ujjwal Kalra. The codebase is open source under the MIT License — you are free to
            fork and self-host it, but you may not use the "JobSynk" name or branding for a
            competing commercial service without permission.
          </p>
        </Section>

        {/* 12 */}
        <Section title="12. Governing Law">
          <p>
            These Terms are governed by the laws of India. Any disputes shall be resolved in the
            courts of India. If you are located outside India, you agree to submit to Indian
            jurisdiction for disputes arising from your use of JobSynk.
          </p>
        </Section>

        {/* 13 */}
        <Section title="13. Contact">
          <p>
            Questions about these Terms:{" "}
            <a href="mailto:hello@jobsynk.in" className="underline" style={{ color: "#C05800" }}>
              hello@jobsynk.in
            </a>
          </p>
        </Section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 px-6 text-center" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <p className="text-xs" style={{ color: "rgba(100,116,139,0.8)" }}>
          © 2026 JobSynk &nbsp;·&nbsp;{" "}
          <Link href="/terms" className="underline hover:text-white transition-colors">Terms of Service</Link>
          &nbsp;·&nbsp;{" "}
          <Link href="/privacy" className="underline hover:text-white transition-colors">Privacy Policy</Link>
        </p>
      </footer>
    </div>
  );
}
