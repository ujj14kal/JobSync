import type { Metadata } from "next";
import Link from "next/link";

interface ShareData {
  overall_score: number;
  match_tier: string;
  job_title: string;
  company: string;
  top_missing_keywords: string[];
  created_at: string;
}

async function getShareData(id: string): Promise<ShareData | null> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/analysis/${id}/share`,
      { next: { revalidate: 3600 } }
    );
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const data = await getShareData(id);
  if (!data) return { title: "JobSynk Analysis" };
  const title = `${data.overall_score}/100 for ${data.job_title}${data.company ? ` at ${data.company}` : ""} · JobSynk`;
  const desc  = `${data.match_tier} — ATS analysis powered by JobSynk AI.`;
  return {
    title,
    description: desc,
    openGraph: { title, description: desc, siteName: "JobSynk" },
    twitter:   { card: "summary", title, description: desc },
  };
}

const TIER_COLOR: Record<string, string> = {
  "Strong Match": "#10b981",
  "Good Match":   "#3b82f6",
  "Fair Match":   "#f59e0b",
  "Weak Match":   "#f97316",
  "Poor Match":   "#ef4444",
};

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getShareData(id);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
        <div className="text-center">
          <p className="text-[var(--text-muted)] mb-4">This analysis is no longer available.</p>
          <Link href="/" className="text-[var(--accent-primary)] text-[13px]">Go to JobSynk →</Link>
        </div>
      </div>
    );
  }

  const color = TIER_COLOR[data.match_tier] ?? "#C05800";

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-16" style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-md space-y-6">

        {/* Branding */}
        <p className="text-[13px] font-semibold text-[var(--accent-primary)] tracking-widest uppercase text-center">
          JobSynk · AI Resume Score
        </p>

        {/* Score card */}
        <div className="p-8 rounded-3xl border text-center space-y-4"
          style={{ background: "var(--bg-surface)", borderColor: `${color}35` }}>
          <div className="text-7xl font-black" style={{ color }}>{data.overall_score}</div>
          <div className="text-[13px] text-[var(--text-muted)]">out of 100</div>

          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[13px] font-semibold"
            style={{ background: `${color}14`, borderColor: `${color}30`, color }}>
            {data.match_tier}
          </div>

          <div className="pt-2 border-t border-[var(--border-subtle)]">
            <p className="text-[15px] font-semibold text-[var(--text-primary)]">{data.job_title}</p>
            {data.company && <p className="text-[13px] text-[var(--text-muted)]">{data.company}</p>}
          </div>
        </div>

        {/* Missing keywords */}
        {data.top_missing_keywords.length > 0 && (
          <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <p className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium mb-3">
              Top missing keywords
            </p>
            <div className="flex flex-wrap gap-2">
              {data.top_missing_keywords.map((kw) => (
                <span key={kw}
                  className="px-3 py-1 rounded-full border border-[var(--border-default)] text-[12px] text-[var(--text-secondary)] bg-[var(--bg-elevated)]">
                  {kw}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="text-center space-y-3">
          <Link href="/analysis"
            className="block w-full py-3 rounded-xl font-semibold text-[14px] text-white text-center transition-colors"
            style={{ background: "#C05800" }}>
            Check your own resume — free
          </Link>
          <p className="text-[11px] text-[var(--text-muted)]">
            3 analyses per day · no card required · results in 30 seconds
          </p>
        </div>
      </div>
    </div>
  );
}
