import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Free ATS Resume Checker — JobSynk",
  description:
    "Check if your resume passes ATS screening for any job. Paste the job URL, upload your resume, and get an ATS compatibility score with missing keywords in 30 seconds. Free.",
  keywords: ["ATS resume checker", "free ATS scanner", "resume ATS score", "applicant tracking system checker"],
  openGraph: {
    title: "Free ATS Resume Checker — JobSynk",
    description: "Paste a job URL. Upload your resume. Know your ATS score in 30 seconds — with missing keywords.",
    siteName: "JobSynk",
  },
};

export default function ATSCheckerPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-3xl mx-auto px-6 py-20">

        {/* Breadcrumb */}
        <p className="text-[12px] text-[var(--text-muted)] mb-8">
          <Link href="/" className="hover:text-[var(--accent-primary)]">JobSynk</Link>
          {" / "} ATS Resume Checker
        </p>

        <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-4">
          Free ATS Resume Checker
        </h1>
        <p className="text-[16px] text-[var(--text-secondary)] mb-10 leading-relaxed">
          Most ATS tools make you copy-paste the job description. JobSynk reads the actual job posting from the URL —
          paste the link, upload your resume, and get your exact ATS compatibility score with every missing keyword in under 30 seconds.
        </p>

        <Link href="/try"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-[15px] text-white mb-16"
          style={{ background: "#C05800" }}>
          Check my resume free — no signup
        </Link>

        <div className="space-y-8">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">What is an ATS resume checker?</h2>
          <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed">
            An ATS (Applicant Tracking System) resume checker analyses your resume against a specific job description
            to predict how well automated hiring software will rank your application. Most large companies use ATS
            software to filter resumes before a human ever reads them. If your resume doesn&apos;t match the right
            keywords and format, it gets filtered out — even if you&apos;re qualified.
          </p>

          <h2 className="text-2xl font-bold text-[var(--text-primary)]">How JobSynk&apos;s ATS checker is different</h2>
          <ul className="space-y-3 text-[15px] text-[var(--text-secondary)]">
            {[
              "Works from a URL — no copy-pasting the job description",
              "Scores 5 separate dimensions: ATS compatibility, technical fit, semantic match, recruiter impression, and project relevance",
              "Shows exactly which keywords are missing and whether they're required or preferred",
              "Generates role-specific interview questions from the same job posting",
              "Free — 3 full analyses per day, no credit card needed",
            ].map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C05800] flex-shrink-0 mt-2" />
                {item}
              </li>
            ))}
          </ul>

          <div className="p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-2">Ready to check your resume?</h3>
            <p className="text-[14px] text-[var(--text-secondary)] mb-4">
              Sign up free and run up to 3 analyses per day. Results in about 30 seconds.
            </p>
            <div className="flex gap-3">
              <Link href="/try"
                className="px-5 py-2.5 rounded-xl font-semibold text-[13px] text-white"
                style={{ background: "#C05800" }}>
                Try without signing up
              </Link>
              <Link href="/signup"
                className="px-5 py-2.5 rounded-xl font-semibold text-[13px] border border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
                Create free account
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
