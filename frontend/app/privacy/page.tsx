import Link from "next/link";
import { Zap } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — JobSync",
  description: "How JobSync collects, uses, and protects your data.",
};

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="mb-10">
    <h2 className="text-xl font-bold text-white mb-4">{title}</h2>
    <div className="text-sm leading-relaxed space-y-3" style={{ color: "rgba(148,163,184,0.9)" }}>
      {children}
    </div>
  </section>
);

export default function PrivacyPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base, #0a0a0f)" }}>
      {/* Nav */}
      <header className="border-b" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: "#C05800" }}>
              <Zap className="w-3.5 h-3.5 text-white" fill="white" />
            </div>
            <span className="text-sm font-semibold" style={{ color: "rgba(226,232,240,0.9)" }}>JobSync</span>
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
          <h1 className="text-4xl font-bold text-white mb-4">Privacy Policy</h1>
          <p style={{ color: "rgba(148,163,184,0.7)" }} className="text-sm">
            Last updated: June 7, 2026 &nbsp;·&nbsp; Effective: June 7, 2026
          </p>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: "rgba(148,163,184,0.85)" }}>
            JobSync is an AI-powered career platform built by an individual developer. This policy explains
            exactly what data we collect, how we use it, and what choices you have. We are committed to
            being transparent — if something is unclear, email us and we will clarify.
          </p>
        </div>

        {/* 1 */}
        <Section title="1. Who We Are">
          <p>
            JobSync is an independent, student-built project operated by Ujjwal Kalra ("we", "us", "our").
            We are not a registered company. For privacy questions contact:{" "}
            <a href="mailto:ujj.kalra10@gmail.com" className="underline" style={{ color: "#C05800" }}>
              ujj.kalra10@gmail.com
            </a>
          </p>
        </Section>

        {/* 2 */}
        <Section title="2. What Data We Collect">
          <p><strong className="text-white">Account data</strong> — When you sign up, we collect your email address and (optionally) your name via Supabase Auth.</p>
          <p><strong className="text-white">Resume content</strong> — When you upload a resume for analysis, the file and extracted text are stored in your private Supabase storage bucket. Only you can access your resumes.</p>
          <p><strong className="text-white">Job descriptions</strong> — URLs and extracted job description text you submit for analysis are stored to display your analysis history.</p>
          <p><strong className="text-white">Analysis results</strong> — ATS scores, skill gap reports, and AI feedback generated for you are stored in your account.</p>
          <p><strong className="text-white">Job applications</strong> — If you use the Job Tracker, the applications you add (company, role, status, notes) are stored in your account.</p>
          <p><strong className="text-white">Gmail OAuth tokens</strong> — If you connect your Gmail account for automatic status tracking, we store encrypted OAuth tokens (access token + refresh token) in our database. We do <em>not</em> store email body content — only email subjects, sender names, and snippets (first ~300 characters) are read and immediately discarded after classification.</p>
          <p><strong className="text-white">Usage data</strong> — We do not run analytics trackers. Supabase may log API request metadata (timestamps, response codes) for operational purposes.</p>
        </Section>

        {/* 3 */}
        <Section title="3. How We Use Your Data">
          <p>We use your data solely to provide and improve the JobSync service:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>To perform ATS analysis and generate AI feedback on your resume</li>
            <li>To display your analysis history and job application tracker</li>
            <li>To automatically detect job status changes from Gmail (if connected)</li>
            <li>To send transactional emails (password reset, email verification) — no marketing emails</li>
          </ul>
          <p>We do <strong className="text-white">not</strong> use your data to train AI models, serve advertisements, or sell to third parties.</p>
        </Section>

        {/* 4 */}
        <Section title="4. Third-Party Services We Use">
          <p>JobSync relies on the following third parties to operate. By using JobSync you acknowledge data is shared with them as described:</p>

          <div className="space-y-4 mt-2">
            {[
              {
                name: "Supabase (supabase.com)",
                what: "Database, file storage, and user authentication. Your account data, resumes, and analysis results are stored on Supabase servers (ap-south-1 region). Supabase is SOC 2 Type II certified.",
                link: "https://supabase.com/privacy",
              },
              {
                name: "Groq (groq.com)",
                what: "When you use AI feedback features (resume bullet rewriting, interview coaching, email classification), relevant text — resume snippets, job descriptions, or email subjects — is sent to Groq's API to generate responses. Groq uses Meta's open-source Llama 3 models. We do not send your full resume to Groq unless you explicitly use a feature that requires it (e.g., full bullet rewrite). Groq's privacy policy governs their data handling.",
                link: "https://groq.com/privacy-policy",
              },
              {
                name: "Google (OAuth only)",
                what: "If you connect Gmail, Google authenticates you and grants us a read-only OAuth token. We do not store any Google account credentials. Your OAuth tokens are stored encrypted in Supabase.",
                link: "https://policies.google.com/privacy",
              },
              {
                name: "Vercel (vercel.com)",
                what: "The JobSync frontend is hosted on Vercel. Vercel may collect standard web server logs (IP address, browser, request path) for operational purposes.",
                link: "https://vercel.com/legal/privacy-policy",
              },
              {
                name: "Google Cloud Run",
                what: "The JobSync backend API is hosted on Google Cloud Run (asia-south1 region). Google may log request metadata for billing and operational purposes.",
                link: "https://cloud.google.com/terms/cloud-privacy-notice",
              },
            ].map((tp) => (
              <div key={tp.name} className="p-4 rounded-xl" style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.06)" }}>
                <div className="font-semibold text-white text-sm mb-1">{tp.name}</div>
                <p className="text-xs leading-relaxed mb-2">{tp.what}</p>
                <a href={tp.link} target="_blank" rel="noopener noreferrer" className="text-xs underline" style={{ color: "#C05800" }}>
                  {tp.link}
                </a>
              </div>
            ))}
          </div>
        </Section>

        {/* 5 */}
        <Section title="5. Gmail Data — Specific Disclosures">
          <p>Because Gmail integration involves sensitive data, we are explicit:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>We request the <code className="px-1 rounded text-xs" style={{ background: "rgba(255,255,255,0.06)", color: "#e89848" }}>gmail.readonly</code> scope — read-only access. We cannot send emails or modify your Gmail in any way.</li>
            <li>We only fetch emails matching job-related search terms (e.g., subject contains "interview", "application", "offer", "rejected").</li>
            <li>For each matching email, we read: <strong className="text-white">subject line</strong>, <strong className="text-white">sender name/address</strong>, <strong className="text-white">date</strong>, and <strong className="text-white">snippet</strong> (first ~300 characters of preview text).</li>
            <li>We <strong className="text-white">never</strong> read, store, or transmit full email body content.</li>
            <li>The subject + snippet is sent to Groq's API for classification only. Groq does not retain this data beyond the API response per their policy.</li>
            <li>You can disconnect Gmail at any time from the Job Tracker page. This immediately deletes your stored OAuth tokens from our database.</li>
            <li>Gmail data is used exclusively to update your JobSync job application statuses. It is never used for any other purpose.</li>
          </ul>
          <p>
            Our use of Gmail data complies with the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "#C05800" }}>
              Google API Services User Data Policy
            </a>, including the Limited Use requirements.
          </p>
        </Section>

        {/* 6 */}
        <Section title="6. Data Retention">
          <p>We retain your data for as long as your account exists. Specifically:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Resume files:</strong> Stored until you delete them or delete your account.</li>
            <li><strong className="text-white">Analysis history:</strong> Stored until you delete your account.</li>
            <li><strong className="text-white">Gmail OAuth tokens:</strong> Deleted immediately when you disconnect Gmail or delete your account.</li>
            <li><strong className="text-white">Job application data:</strong> Stored until you delete it or your account.</li>
          </ul>
          <p>When you delete your account, all associated data is permanently removed from our database within 30 days.</p>
        </Section>

        {/* 7 */}
        <Section title="7. Your Rights">
          <p>You have the right to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Access</strong> — Request a copy of all data we hold about you.</li>
            <li><strong className="text-white">Delete</strong> — Request deletion of your account and all associated data.</li>
            <li><strong className="text-white">Correct</strong> — Update your account information at any time.</li>
            <li><strong className="text-white">Disconnect</strong> — Revoke Gmail access at any time from the Job Tracker settings.</li>
            <li><strong className="text-white">Portability</strong> — Request your analysis history in JSON format.</li>
          </ul>
          <p>
            To exercise these rights, email{" "}
            <a href="mailto:ujj.kalra10@gmail.com" className="underline" style={{ color: "#C05800" }}>
              ujj.kalra10@gmail.com
            </a>{" "}
            with the subject "Data Request — JobSync". We will respond within 30 days.
          </p>
        </Section>

        {/* 8 */}
        <Section title="8. Security">
          <p>We take reasonable measures to protect your data:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>All data in transit is encrypted via HTTPS/TLS.</li>
            <li>Supabase uses Row Level Security (RLS) — your data is accessible only to your authenticated user ID.</li>
            <li>OAuth tokens are stored in Supabase with RLS policies.</li>
            <li>API keys and secrets are stored in Google Cloud Secret Manager, never in code or environment files checked into version control.</li>
          </ul>
          <p>No system is 100% secure. If you discover a security issue, please disclose it responsibly via email before public disclosure.</p>
        </Section>

        {/* 9 */}
        <Section title="9. Children's Privacy">
          <p>JobSync is not directed at children under 13. We do not knowingly collect personal data from anyone under 13. If you believe a child has provided us data, contact us and we will delete it.</p>
        </Section>

        {/* 10 */}
        <Section title="10. Changes to This Policy">
          <p>We may update this policy as the product evolves. When we do, we will update the "Last updated" date at the top. Continued use of JobSync after changes constitutes acceptance of the new policy. For significant changes, we will notify users via the email address on their account.</p>
        </Section>

        {/* 11 */}
        <Section title="11. Contact">
          <p>
            Privacy questions, data requests, or concerns:{" "}
            <a href="mailto:ujj.kalra10@gmail.com" className="underline" style={{ color: "#C05800" }}>
              ujj.kalra10@gmail.com
            </a>
          </p>
        </Section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 px-6 text-center" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
        <p className="text-xs" style={{ color: "rgba(100,116,139,0.8)" }}>
          © 2026 JobSync &nbsp;·&nbsp;{" "}
          <Link href="/terms" className="underline hover:text-white transition-colors">Terms of Service</Link>
          &nbsp;·&nbsp;{" "}
          <Link href="/privacy" className="underline hover:text-white transition-colors">Privacy Policy</Link>
        </p>
      </footer>
    </div>
  );
}
