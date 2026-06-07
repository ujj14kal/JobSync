import Link from "next/link";
import { Zap, ShieldCheck } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — JobSynk",
  description: "How JobSynk collects, uses, and protects your data.",
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
          <h1 className="text-4xl font-bold text-white mb-4">Privacy Policy</h1>
          <p style={{ color: "rgba(148,163,184,0.7)" }} className="text-sm">
            Last updated: June 7, 2026 &nbsp;·&nbsp; Effective: June 7, 2026
          </p>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: "rgba(148,163,184,0.85)" }}>
            JobSynk is an AI-powered career platform built by an individual developer. This policy explains
            exactly what data we collect, how we use it, and what choices you have.
          </p>
        </div>

        {/* ── Google API Limited Use — prominent compliance box ── */}
        <div
          className="mb-12 p-6 rounded-2xl"
          style={{
            background: "rgba(192,88,0,0.06)",
            border: "1px solid rgba(192,88,0,0.22)",
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: "rgba(192,88,0,0.15)", border: "1px solid rgba(192,88,0,0.3)" }}
            >
              <ShieldCheck className="w-4 h-4" style={{ color: "#C05800" }} />
            </div>
            <h2 className="text-base font-bold text-white">Google API Services — Limited Use Disclosure</h2>
          </div>
          <div className="text-sm leading-relaxed space-y-2" style={{ color: "rgba(148,163,184,0.9)" }}>
            <p>
              JobSynk&apos;s use and transfer of information received from Google APIs to any other app will
              adhere to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{ color: "#C05800" }}
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
            <p>Specifically, JobSynk commits to the following with respect to data obtained from Google APIs:</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>Gmail data is used <strong className="text-white">only</strong> to provide the job-application status tracking feature that is visible to you in the app — for no other purpose.</li>
              <li>Gmail data is <strong className="text-white">never</strong> used for advertising or to serve ads.</li>
              <li>Gmail data is <strong className="text-white">never</strong> transferred to third parties, except to Groq solely for classifying email subjects/snippets as part of the job-tracking feature (see Section 5).</li>
              <li>No human at JobSynk reads your Gmail data. All access is fully automated.</li>
              <li>You can revoke access at any time, which immediately deletes all stored Gmail tokens.</li>
            </ul>
          </div>
        </div>

        {/* 1 */}
        <Section title="1. Who We Are">
          <p>
            JobSynk is an independent project operated by Ujjwal Kalra (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;).
            For any privacy questions, contact:{" "}
            <a href="mailto:ujj.kalra10@gmail.com" className="underline" style={{ color: "#C05800" }}>
              ujj.kalra10@gmail.com
            </a>
          </p>
        </Section>

        {/* 2 */}
        <Section title="2. What Data We Collect">
          <p><strong className="text-white">Account data</strong> — Your email address and (optionally) your name, collected when you sign up.</p>
          <p><strong className="text-white">Resume content</strong> — When you upload a resume for analysis, the file and extracted text are stored privately in your account. Only you can access your resumes.</p>
          <p><strong className="text-white">Job descriptions</strong> — URLs and job description text you submit for analysis, stored to display your history.</p>
          <p><strong className="text-white">Analysis results</strong> — ATS scores, skill gap reports, and AI feedback generated for you.</p>
          <p><strong className="text-white">Job application records</strong> — Company, role, status, and notes you add in the Job Tracker.</p>
          <p>
            <strong className="text-white">Gmail data (optional)</strong> — Only if you choose to connect Gmail for automatic status tracking:
            we store your OAuth access and refresh tokens. We read only the <em>subject line</em>,{" "}
            <em>sender name/address</em>, <em>date</em>, and <em>snippet</em> (the first ~300 characters of
            preview text) of emails that match job-related search terms. We{" "}
            <strong className="text-white">never</strong> read or store full email body content.
            Tokens are deleted immediately when you disconnect Gmail or delete your account.
          </p>
        </Section>

        {/* 3 */}
        <Section title="3. How We Use Your Data">
          <p>We use your data solely to provide and improve JobSynk:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>To perform ATS analysis and generate AI feedback on your resume</li>
            <li>To display your analysis history and job application tracker</li>
            <li>To automatically detect job-application status changes from Gmail (only if you connect it)</li>
            <li>To send transactional emails only (password reset, email verification) — no marketing emails</li>
          </ul>
          <p>
            We do <strong className="text-white">not</strong> use your data to train AI models, serve
            advertisements, build profiles for sale, or share it with any third party for their
            independent use.
          </p>
        </Section>

        {/* 4 */}
        <Section title="4. Third-Party Services">
          <p>
            JobSynk uses the following third-party services. Data is shared with them only to the extent
            necessary to operate the features described:
          </p>

          <div className="space-y-4 mt-2">
            {[
              {
                name: "Supabase (supabase.com)",
                what: "Database, file storage, and user authentication. Your account data, resumes, analysis results, and (if connected) Gmail OAuth tokens are stored on Supabase servers. Supabase is SOC 2 Type II certified.",
                link: "https://supabase.com/privacy",
              },
              {
                name: "Groq (groq.com)",
                what: "When you use AI feedback features or Gmail job-tracking, relevant text — resume snippets, job descriptions, or email subjects and snippets — is sent to Groq's API to generate AI responses. We do not send full email bodies to Groq. Groq's privacy policy governs their handling of this data.",
                link: "https://groq.com/privacy-policy",
              },
              {
                name: "Google (OAuth / Gmail API)",
                what: "If you connect Gmail, Google authenticates you and issues a read-only OAuth token. We do not store any Google account password or credentials — only the OAuth token, stored securely.",
                link: "https://policies.google.com/privacy",
              },
              {
                name: "Vercel (vercel.com)",
                what: "The JobSynk frontend is hosted on Vercel. Vercel may collect standard web server logs (IP address, browser, request path) for operational purposes.",
                link: "https://vercel.com/legal/privacy-policy",
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
        <Section title="5. Gmail Integration — Full Disclosure">
          <p>
            Gmail integration is entirely <strong className="text-white">optional</strong>. You can use every
            other JobSynk feature without connecting your Gmail account. If you do connect it:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              We request the{" "}
              <code className="px-1 rounded text-xs" style={{ background: "rgba(255,255,255,0.06)", color: "#e89848" }}>
                gmail.readonly
              </code>{" "}
              scope — read-only access. We cannot send emails, delete emails, or modify anything in your Gmail.
            </li>
            <li>
              We only query emails that match job-related keywords (e.g., subject contains &quot;interview&quot;,
              &quot;application received&quot;, &quot;offer&quot;, &quot;rejected&quot;, &quot;next steps&quot;).
            </li>
            <li>
              For each matching email we read:{" "}
              <strong className="text-white">subject line</strong>,{" "}
              <strong className="text-white">sender name and address</strong>,{" "}
              <strong className="text-white">date</strong>, and{" "}
              <strong className="text-white">snippet</strong> (the first ~300 characters shown in Gmail&apos;s preview).
            </li>
            <li>
              We <strong className="text-white">never</strong> read, store, or transmit full email body content.
            </li>
            <li>
              The email subject and snippet are sent to Groq&apos;s API <em>solely</em> to classify whether the
              email represents a status update (e.g., interview scheduled, rejected, offer received).
              Groq does not retain data after returning a response, per their policy.
            </li>
            <li>
              <strong className="text-white">No human at JobSynk reads your Gmail data.</strong> All access and
              processing is fully automated.
            </li>
            <li>
              Gmail data is used <strong className="text-white">exclusively</strong> to update job application
              statuses in your JobSynk Job Tracker. It is never used for advertising, analytics, or model training.
            </li>
            <li>
              You can disconnect Gmail at any time from the Job Tracker settings page. Disconnecting
              immediately and permanently deletes your stored OAuth tokens from our database.
            </li>
            <li>
              You can also revoke access directly from your{" "}
              <a
                href="https://myaccount.google.com/permissions"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
                style={{ color: "#C05800" }}
              >
                Google Account permissions page
              </a>.
            </li>
          </ul>
        </Section>

        {/* 6 */}
        <Section title="6. Data Retention">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Resume files and analysis history:</strong> Stored until you delete them or your account.</li>
            <li><strong className="text-white">Gmail OAuth tokens:</strong> Deleted immediately when you disconnect Gmail or delete your account.</li>
            <li><strong className="text-white">Job application records:</strong> Stored until you delete them or your account.</li>
          </ul>
          <p>
            When you delete your account, all associated data is permanently removed from our systems
            within 30 days.
          </p>
        </Section>

        {/* 7 */}
        <Section title="7. Your Rights and Controls">
          <p>You have the right to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Access</strong> — Request a copy of all data we hold about you.</li>
            <li><strong className="text-white">Delete</strong> — Request deletion of your account and all associated data.</li>
            <li><strong className="text-white">Correct</strong> — Update your account information at any time.</li>
            <li><strong className="text-white">Disconnect Gmail</strong> — Revoke Gmail access at any time from the Job Tracker settings, or directly via your Google Account.</li>
            <li><strong className="text-white">Portability</strong> — Request your analysis history in JSON format.</li>
          </ul>
          <p>
            To exercise any of these rights, email{" "}
            <a href="mailto:ujj.kalra10@gmail.com" className="underline" style={{ color: "#C05800" }}>
              ujj.kalra10@gmail.com
            </a>{" "}
            with the subject &quot;Data Request — JobSynk&quot;. We will respond within 30 days.
          </p>
        </Section>

        {/* 8 */}
        <Section title="8. Security">
          <ul className="list-disc pl-5 space-y-1">
            <li>All data in transit is encrypted via HTTPS/TLS.</li>
            <li>Your account data is protected so it is only accessible to your authenticated session.</li>
            <li>Credentials and API keys are stored in secure secret management systems, not in source code.</li>
          </ul>
          <p>
            No internet service is 100% secure. If you discover a vulnerability, please report it
            responsibly to{" "}
            <a href="mailto:ujj.kalra10@gmail.com" className="underline" style={{ color: "#C05800" }}>
              ujj.kalra10@gmail.com
            </a>{" "}
            before public disclosure.
          </p>
        </Section>

        {/* 9 */}
        <Section title="9. Children&apos;s Privacy">
          <p>
            JobSynk is not directed at children under 13. We do not knowingly collect personal data from
            anyone under 13. If you believe a child has provided us data, contact us and we will delete
            it promptly.
          </p>
        </Section>

        {/* 10 */}
        <Section title="10. Changes to This Policy">
          <p>
            We may update this policy as the product evolves. When we do, we will update the
            &quot;Last updated&quot; date at the top. For significant changes, we will notify you via
            the email address on your account. Continued use of JobSynk after changes constitutes
            acceptance of the revised policy.
          </p>
        </Section>

        {/* 11 */}
        <Section title="11. Contact">
          <p>
            Privacy questions, data requests, or concerns:{" "}
            <a href="mailto:ujj.kalra10@gmail.com" className="underline" style={{ color: "#C05800" }}>
              ujj.kalra10@gmail.com
            </a>
          </p>
          <p style={{ color: "rgba(148,163,184,0.6)" }} className="text-xs mt-2">
            Operated by Ujjwal Kalra · India
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
