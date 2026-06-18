import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Check Your Resume Score — Free AI Resume Scorer | JobSynk",
  description:
    "Get an AI-powered resume score for any job in 30 seconds. See your ATS compatibility, technical fit, and recruiter impression score — with actionable fixes. Free, no credit card.",
  keywords: ["resume score", "resume scorer", "AI resume checker", "resume rating", "free resume analysis", "resume score checker", "check resume score online"],
  openGraph: {
    title: "Check Your Resume Score — Free | JobSynk",
    description: "AI scores your resume across 5 dimensions for any specific job. Free, 30 seconds, no card needed.",
    siteName: "JobSynk",
  },
};

const SCORES = [
  {
    name: "ATS Compatibility",
    range: "0–100",
    desc: "How well your resume would survive automated ATS filtering — keyword presence, formatting compliance, section clarity.",
    good: "Above 75 means strong ATS compatibility. Fix missing required keywords and remove tables or text boxes.",
  },
  {
    name: "Technical Fit",
    range: "0–100",
    desc: "How closely your technical skills and experience match what this specific role requires.",
    good: "Above 70 is solid. Gap usually means missing tools, languages, or frameworks the job lists as required.",
  },
  {
    name: "Semantic Match",
    range: "0–100",
    desc: "Deep contextual similarity — whether your experience context genuinely aligns with this job's requirements, beyond keyword presence.",
    good: "Harder to game than ATS score. Improve it by rewriting bullets to reflect the actual impact the role cares about.",
  },
  {
    name: "Recruiter Impression",
    range: "0–100",
    desc: "Estimated first-pass recruiter impression — clarity, achievement quality, bullet strength, and professionalism.",
    good: "Low scores usually mean weak bullet verbs, missing numbers, or generic descriptions. Add quantified achievements.",
  },
  {
    name: "Project Relevance",
    range: "0–100",
    desc: "How relevant your projects and portfolio work are to this specific role. Especially important for students and career changers.",
    good: "Improve by adding a projects section tailored to the role, or highlighting transferable project experience.",
  },
];

const FAQS = [
  {
    q: "What makes a good resume score?",
    a: "An overall score above 75 is strong for most roles. But the sub-scores matter more than the overall number — a 90 ATS score with a 40 semantic match means you've stuffed keywords but your experience doesn't actually fit the role. Look at all five dimensions.",
  },
  {
    q: "Why does my score change for different jobs?",
    a: "Because the score is job-specific, not generic. A 'good' resume for a frontend engineer role scores differently against a product manager job description. This is by design — a high score means you're a strong match for that specific role, not resumes in general.",
  },
  {
    q: "How accurate is the AI scoring?",
    a: "JobSynk's neural scorer was trained on 6,000+ real resume–job pairs and validated against actual hiring outcomes. The model achieves a mean absolute error of 5.68 points — meaning predictions are within about 6 points of human expert ratings on average.",
  },
  {
    q: "My score is low — what should I fix first?",
    a: "Check your missing keywords first (quickest win). Then look at your ATS score — if it's below 60, fix formatting. Then look at recruiter impression — add numbers and stronger action verbs. Semantic match is the hardest to improve and requires rewriting your experience framing.",
  },
  {
    q: "Do I need an account to check my score?",
    a: "No. You can get one free score check per day at jobsynk.in/try without creating an account. For 3 analyses per day with full reports, create a free account — no credit card needed.",
  },
  {
    q: "What file formats does it support?",
    a: "PDF and DOCX. PDF is recommended — it preserves formatting and is what most ATS systems prefer. Max file size is 5 MB.",
  },
];

const FIXES = [
  { score: "ATS Compatibility", fix: "Add the exact keywords from the job description. Use standard section headings. Remove tables and multi-column layouts." },
  { score: "Technical Fit", fix: "Add missing tools and technologies to your skills section. Even brief experience counts — include personal projects." },
  { score: "Semantic Match", fix: "Rewrite bullet points to reflect outcomes the role cares about. Use the same domain language as the job posting." },
  { score: "Recruiter Impression", fix: "Start bullets with strong action verbs. Add numbers wherever possible (percentages, team sizes, timelines). Cut generic phrases." },
  { score: "Project Relevance", fix: "Add or reorganise a Projects section that highlights work closest to this role. Link to GitHub or live demos." },
];

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

        {/* Why 5 scores */}
        <div className="space-y-5 mb-16">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">Why 5 scores instead of one</h2>
          <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed">
            Most resume checkers give you a single score that mixes everything together. The problem: a high overall
            score can hide critical weaknesses. You might score 78 overall while your ATS compatibility is 40 —
            meaning your resume gets filtered out before a recruiter ever reads it.
          </p>
          <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed">
            JobSynk scores each dimension separately so you know exactly which lever to pull. Fixing a low ATS score
            takes 10 minutes. Fixing a low semantic match takes rewriting your experience framing. Knowing which is
            the problem saves you from wasting time on the wrong thing.
          </p>
        </div>

        {/* The 5 scores */}
        <div className="space-y-5 mb-16">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">What the 5 scores mean</h2>
          <div className="grid gap-4">
            {SCORES.map(s => (
              <div key={s.name} className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[14px] font-semibold text-[var(--text-primary)]">{s.name}</p>
                  <span className="text-[11px] font-medium px-2 py-0.5 rounded-full"
                    style={{ background: "rgba(192,88,0,0.1)", color: "#C05800" }}>{s.range}</span>
                </div>
                <p className="text-[13px] text-[var(--text-secondary)] mb-2">{s.desc}</p>
                <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
                  <span className="font-medium" style={{ color: "#7ab840" }}>How to improve: </span>
                  {s.good}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* How the score is calculated */}
        <div className="space-y-5 mb-16">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">How the score is calculated</h2>
          <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed">
            JobSynk uses a custom neural model trained on over 6,000 real resume–job pairs. It's not a keyword
            counter — it was trained to predict how a senior recruiter would rate the match between a resume and a
            job posting. The model was validated with a mean absolute error of 5.68 points against human expert ratings.
          </p>
          <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed">
            The overall score is a weighted combination of the 5 sub-scores, with ATS compatibility and technical
            fit weighted more heavily for technical roles, and recruiter impression weighted more for
            business and management roles. The weights are inferred from the job description automatically.
          </p>
        </div>

        {/* Quick fixes per score */}
        <div className="space-y-5 mb-16">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">Quick fixes for each score</h2>
          <div className="space-y-3">
            {FIXES.map(f => (
              <div key={f.score} className="flex gap-4 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <div className="flex-shrink-0 w-2 rounded-full self-stretch" style={{ background: "#C05800" }} />
                <div>
                  <p className="text-[13px] font-semibold text-[var(--text-primary)] mb-0.5">{f.score}</p>
                  <p className="text-[13px] text-[var(--text-secondary)]">{f.fix}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* What a score of X means */}
        <div className="space-y-5 mb-16">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">What your overall score means</h2>
          <div className="space-y-3">
            {[
              { range: "85–100", label: "Strong Match", color: "#10b981", desc: "Your resume is well-aligned with this role. Focus on interview prep." },
              { range: "70–84", label: "Good Match", color: "#3b82f6", desc: "Strong candidate. A few targeted tweaks to keywords or framing can push you higher." },
              { range: "55–69", label: "Fair Match", color: "#f59e0b", desc: "Noticeable gaps. Fix missing keywords and rewrite 2–3 weak bullets before applying." },
              { range: "40–54", label: "Weak Match", color: "#f97316", desc: "Significant gaps in skills or experience framing. Consider whether this role is the right target." },
              { range: "0–39",  label: "Poor Match", color: "#ef4444", desc: "Resume is not aligned with this role's requirements. Major rewrite needed or wrong target role." },
            ].map(t => (
              <div key={t.range} className="flex items-start gap-4 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <div className="flex-shrink-0 text-center">
                  <p className="text-[13px] font-bold" style={{ color: t.color }}>{t.range}</p>
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-[var(--text-primary)] mb-0.5">{t.label}</p>
                  <p className="text-[12px] text-[var(--text-secondary)]">{t.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* FAQ */}
        <div className="space-y-5 mb-16">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">Frequently asked questions</h2>
          <div className="space-y-3">
            {FAQS.map(faq => (
              <div key={faq.q} className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-2">{faq.q}</p>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
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
  );
}
