import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Check Your Resume Score — Free AI Resume Scorer | JobSynk",
  description:
    "Get an AI-powered resume score for any job in 30 seconds. See your ATS compatibility, technical fit, and recruiter impression score — with actionable fixes. Free, no credit card.",
  keywords: ["resume score", "resume scorer", "AI resume checker", "resume rating", "free resume analysis"],
  openGraph: {
    title: "Check Your Resume Score — Free | JobSynk",
    description: "AI scores your resume across 5 dimensions for any specific job. Free, 30 seconds, no card needed.",
    siteName: "JobSynk",
  },
};

export default function ResumeScorePage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-3xl mx-auto px-6 py-20">

        <p className="text-[12px] text-[var(--text-muted)] mb-8">
          <Link href="/" className="hover:text-[var(--accent-primary)]">JobSynk</Link>
          {" / "} Resume Score Checker
        </p>

        <h1 className="text-4xl font-bold text-[var(--text-primary)] mb-4">
          Check Your Resume Score — Free
        </h1>
        <p className="text-[16px] text-[var(--text-secondary)] mb-10 leading-relaxed">
          Get an AI-powered score for your resume against any job posting. JobSynk analyses 5 separate dimensions
          — not one vague number — so you know exactly where your resume is strong and what needs work.
        </p>

        <Link href="/try"
          className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-semibold text-[15px] text-white mb-16"
          style={{ background: "#C05800" }}>
          Score my resume — no account needed
        </Link>

        <div className="space-y-8">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">What the 5 scores mean</h2>
          <div className="grid gap-4">
            {[
              { name: "ATS Compatibility", desc: "How well your resume would survive automated ATS filtering — keyword presence, formatting, section headers." },
              { name: "Technical Fit",     desc: "How closely your technical skills and experience match what this specific role requires." },
              { name: "Semantic Match",    desc: "Deep contextual similarity — whether your experience context genuinely aligns with this job's requirements." },
              { name: "Recruiter Impression", desc: "Estimated first-pass recruiter impression — clarity, achievement quality, professionalism of your bullets." },
              { name: "Project Relevance", desc: "How relevant your projects and portfolio work are to the role — especially important for students and career changers." },
            ].map(s => (
              <div key={s.name} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">{s.name}</p>
                <p className="text-[13px] text-[var(--text-secondary)]">{s.desc}</p>
              </div>
            ))}
          </div>

          <div className="p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-2">Get your score now</h3>
            <p className="text-[14px] text-[var(--text-secondary)] mb-4">
              No signup needed for a quick demo. Create a free account for 3 full analyses per day.
            </p>
            <div className="flex gap-3">
              <Link href="/try"
                className="px-5 py-2.5 rounded-xl font-semibold text-[13px] text-white"
                style={{ background: "#C05800" }}>
                Try free — no signup
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
