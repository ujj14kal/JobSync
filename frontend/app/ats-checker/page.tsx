import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Free ATS Resume Checker — JobSynk",
  description:
    "Check if your resume passes ATS screening for any job. Paste the job URL, upload your resume, and get an ATS compatibility score with missing keywords in 30 seconds. Free.",
  keywords: ["ATS resume checker", "free ATS scanner", "resume ATS score", "applicant tracking system checker", "ATS resume test", "ATS friendly resume checker"],
  openGraph: {
    title: "Free ATS Resume Checker — JobSynk",
    description: "Paste a job URL. Upload your resume. Know your ATS score in 30 seconds — with missing keywords.",
    siteName: "JobSynk",
  },
};

const FAQS = [
  {
    q: "What is an ATS and why does it matter?",
    a: "ATS stands for Applicant Tracking System — software used by most companies (and nearly all companies with 50+ employees) to automatically filter job applications before a human ever reads them. If your resume doesn't match the job's keywords and format requirements, the ATS rejects it automatically. Studies estimate 75% of resumes are rejected by ATS before reaching a recruiter.",
  },
  {
    q: "How is JobSynk's ATS checker different from other tools?",
    a: "Most ATS checkers ask you to copy-paste the job description manually. JobSynk works from the job posting URL — paste the link and it reads the actual job page directly. It also scores 5 separate dimensions (not one vague number) and shows you exactly which keywords are missing and whether they're required or preferred.",
  },
  {
    q: "Is my resume stored or shared?",
    a: "Your resume is processed to generate the score and then discarded from our servers. We do not sell, share, or use your resume data for any purpose other than generating your analysis.",
  },
  {
    q: "Which job boards does it support?",
    a: "JobSynk works with LinkedIn Jobs, Naukri, Indeed, Internshala, Wellfound, company career pages, and most other job boards. If the page is publicly accessible, JobSynk can read it.",
  },
  {
    q: "What does a good ATS score look like?",
    a: "Scores above 75 generally indicate strong ATS compatibility for that specific role. Between 50–74 means you're missing some important keywords or your experience framing needs work. Below 50 suggests significant gaps — either in skills or in how you've described your experience.",
  },
  {
    q: "How many free analyses do I get?",
    a: "You get 3 full analyses per day on the free plan, with no credit card required. The free demo at /try gives you 1 additional quick check per day without even creating an account.",
  },
  {
    q: "Does formatting affect my ATS score?",
    a: "Yes. ATS systems struggle with tables, text boxes, headers/footers, and certain fonts. JobSynk's ATS compatibility score accounts for standard formatting issues. Plain, single-column resumes in PDF or DOCX format score best.",
  },
  {
    q: "Can I use this for jobs outside India?",
    a: "Yes. JobSynk works for any job URL worldwide. The scoring engine is trained on both Indian (Naukri, Internshala) and international (LinkedIn, Indeed) job postings.",
  },
];

const STEPS = [
  { n: "1", title: "Paste the job URL", body: "Copy the link to any job posting — LinkedIn, Naukri, Indeed, or a company career page. No copy-pasting the description." },
  { n: "2", title: "Upload your resume", body: "Drop your PDF or DOCX. Max 5 MB. Your file is processed and not stored after analysis." },
  { n: "3", title: "Get your ATS score", body: "In about 30 seconds you'll see your overall score, 5 sub-scores, every missing keyword, and what to fix first." },
];

export default function ATSCheckerPage() {
  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      <div className="max-w-3xl mx-auto px-6 py-20">

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

        {/* How it works */}
        <div className="space-y-10 mb-16">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">How it works</h2>
          <div className="space-y-4">
            {STEPS.map(s => (
              <div key={s.n} className="flex gap-4 p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-[13px] font-bold text-white"
                  style={{ background: "#C05800" }}>{s.n}</div>
                <div>
                  <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">{s.title}</p>
                  <p className="text-[13px] text-[var(--text-secondary)]">{s.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* What is ATS */}
        <div className="space-y-5 mb-16">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">What is an ATS resume checker?</h2>
          <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed">
            An ATS (Applicant Tracking System) resume checker analyses your resume against a specific job description
            to predict how well automated hiring software will rank your application. Most companies with more than
            50 employees use ATS software to filter resumes before a human ever reads them. If your resume doesn&apos;t
            match the right keywords and format, it gets filtered out — even if you&apos;re fully qualified.
          </p>
          <p className="text-[15px] text-[var(--text-secondary)] leading-relaxed">
            In India, platforms like Naukri and LinkedIn use their own ranking algorithms that work similarly —
            resumes that match the job&apos;s keywords rank higher in recruiter searches. A strong ATS score means
            your resume shows up when recruiters search for candidates, not just when you apply.
          </p>
        </div>

        {/* What JobSynk checks */}
        <div className="space-y-5 mb-16">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">What JobSynk&apos;s ATS checker analyses</h2>
          <ul className="space-y-3">
            {[
              { label: "Keyword match", detail: "Which keywords from the job description appear in your resume, which are missing, and whether each is marked required or preferred." },
              { label: "ATS formatting compatibility", detail: "Whether your resume uses tables, text boxes, or other elements that ATS systems commonly misparse." },
              { label: "Section completeness", detail: "Whether standard sections (experience, education, skills) are clearly labeled and easy for ATS to parse." },
              { label: "Technical skill coverage", detail: "How many of the specific tools, languages, and technologies the role requires are present in your resume." },
              { label: "Semantic relevance", detail: "Whether the context of your experience genuinely matches the role — not just keyword presence, but contextual alignment." },
            ].map(item => (
              <li key={item.label} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">{item.label}</p>
                <p className="text-[13px] text-[var(--text-secondary)]">{item.detail}</p>
              </li>
            ))}
          </ul>
        </div>

        {/* How JobSynk is different */}
        <div className="space-y-5 mb-16">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">How JobSynk is different from other ATS checkers</h2>
          <ul className="space-y-3 text-[15px] text-[var(--text-secondary)]">
            {[
              "Works from a URL — no copy-pasting the job description",
              "Scores 5 separate dimensions, not one vague overall number",
              "Shows exactly which keywords are missing and marks them required vs. preferred",
              "Trained on 6,000+ real resume–job pairs, not just keyword frequency",
              "Generates role-specific interview questions from the same job posting",
              "Free — 3 full analyses per day, no credit card needed",
            ].map(item => (
              <li key={item} className="flex items-start gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C05800] flex-shrink-0 mt-2" />
                {item}
              </li>
            ))}
          </ul>
        </div>

        {/* Tips */}
        <div className="space-y-5 mb-16">
          <h2 className="text-2xl font-bold text-[var(--text-primary)]">Tips for a higher ATS score</h2>
          <ul className="space-y-3 text-[15px] text-[var(--text-secondary)]">
            {[
              { tip: "Use a clean single-column layout", detail: "Avoid tables, text boxes, and columns. ATS systems parse these poorly and often drop entire sections." },
              { tip: "Mirror the job's exact language", detail: "If the job says 'stakeholder management', use that phrase — not 'client relationship management'. ATS matches on exact terms." },
              { tip: "Put skills in a dedicated section", detail: "A clearly labeled 'Skills' or 'Technical Skills' section makes it easier for ATS to extract your capabilities." },
              { tip: "Use standard section headings", detail: "Avoid creative headings like 'My Journey'. Use 'Work Experience', 'Education', 'Skills' — ATS is not creative." },
              { tip: "Quantify achievements", detail: "Numbers help — '40% reduction in load time' scores higher than 'improved performance'. They signal real impact and match recruiter search patterns." },
            ].map(item => (
              <li key={item.tip} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">{item.tip}</p>
                <p className="text-[13px] text-[var(--text-secondary)]">{item.detail}</p>
              </li>
            ))}
          </ul>
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
  );
}
