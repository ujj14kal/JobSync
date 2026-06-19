import Link from "next/link";

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
          <h1 className="text-4xl font-bold text-white mb-4">Privacy Policy</h1>
          <p style={{ color: "rgba(148,163,184,0.7)" }} className="text-sm">
            Last updated: June 7, 2026 &nbsp;·&nbsp; Effective: June 7, 2026
          </p>
          <p className="mt-4 text-sm leading-relaxed" style={{ color: "rgba(148,163,184,0.85)" }}>
            JobSynk is an AI-powered career platform built by an individual developer. This policy explains
            exactly what data we collect, how we use it, and what choices you have.
          </p>
        </div>

        {/* 1 */}
        <Section title="1. Who We Are">
          <p>
            JobSynk is an independent project operated by Ujjwal Kalra (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;).
            For any privacy questions, contact:{" "}
            <a href="mailto:hello@jobsynk.in" className="underline" style={{ color: "#C05800" }}>
              hello@jobsynk.in
            </a>
          </p>
        </Section>

        {/* 2 */}
        <Section title="2. What Data We Collect">
          <p><strong className="text-white">Account data</strong> — Your email address and (optionally) your name, collected when you sign up.</p>
          <p><strong className="text-white">Resume content</strong> — When you upload a resume for analysis, the file and extracted text are stored privately in your account. Only you can access your resumes.</p>
          <p><strong className="text-white">Job descriptions</strong> — URLs and job description text you submit for analysis, stored to display your history.</p>
          <p><strong className="text-white">Analysis results</strong> — ATS scores, skill gap reports, and AI feedback generated for you.</p>
        </Section>

        {/* 3 */}
        <Section title="3. How We Use Your Data">
          <p>We use your data solely to provide and improve JobSynk:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>To perform ATS analysis and generate AI feedback on your resume</li>
            <li>To display your analysis history</li>
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
                name: "JobSynk AI Engine (primary) / Groq fallback",
                what: "Free-tier AI features are powered by the JobSynk AI Engine — our proprietary model running within our own infrastructure. Groq (groq.com) is used only as a fallback if our engine is temporarily unavailable. In that case, relevant text (resume snippets and job descriptions) is sent to Groq's API. Groq's privacy policy governs their handling.",
                link: "https://groq.com/privacy-policy",
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
        <Section title="5. Data Retention">
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Resume files and analysis history:</strong> Stored until you delete them or your account.</li>
          </ul>
          <p>
            When you delete your account, all associated data is permanently removed from our systems
            within 30 days.
          </p>
        </Section>

        {/* 6 */}
        <Section title="6. Your Rights and Controls">
          <p>You have the right to:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong className="text-white">Access</strong> — Request a copy of all data we hold about you.</li>
            <li><strong className="text-white">Delete</strong> — Request deletion of your account and all associated data.</li>
            <li><strong className="text-white">Correct</strong> — Update your account information at any time.</li>
            <li><strong className="text-white">Portability</strong> — Request your analysis history in JSON format.</li>
          </ul>
          <p>
            To exercise any of these rights, email{" "}
            <a href="mailto:hello@jobsynk.in" className="underline" style={{ color: "#C05800" }}>
              hello@jobsynk.in
            </a>{" "}
            with the subject &quot;Data Request — JobSynk&quot;. We will respond within 30 days.
          </p>
        </Section>

        {/* 7 */}
        <Section title="7. Security">
          <ul className="list-disc pl-5 space-y-1">
            <li>All data in transit is encrypted via HTTPS/TLS.</li>
            <li>Your account data is protected so it is only accessible to your authenticated session.</li>
            <li>Credentials and API keys are stored in secure secret management systems, not in source code.</li>
          </ul>
          <p>
            No internet service is 100% secure. If you discover a vulnerability, please report it
            responsibly to{" "}
            <a href="mailto:hello@jobsynk.in" className="underline" style={{ color: "#C05800" }}>
              hello@jobsynk.in
            </a>{" "}
            before public disclosure.
          </p>
        </Section>

        {/* 8 */}
        <Section title="8. Children&apos;s Privacy">
          <p>
            JobSynk is not directed at children under 13. We do not knowingly collect personal data from
            anyone under 13. If you believe a child has provided us data, contact us and we will delete
            it promptly.
          </p>
        </Section>

        {/* 9 */}
        <Section title="9. Changes to This Policy">
          <p>
            We may update this policy as the product evolves. When we do, we will update the
            &quot;Last updated&quot; date at the top. For significant changes, we will notify you via
            the email address on your account. Continued use of JobSynk after changes constitutes
            acceptance of the revised policy.
          </p>
        </Section>

        {/* 10 */}
        <Section title="10. Contact">
          <p>
            Privacy questions, data requests, or concerns:{" "}
            <a href="mailto:hello@jobsynk.in" className="underline" style={{ color: "#C05800" }}>
              hello@jobsynk.in
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
