"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp, TrendingDown, Minus, Search, IndianRupee,
  DollarSign, BarChart2, Briefcase, AlertCircle, RefreshCw, Brain, Globe,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import type { CareerInsight } from "@/lib/types";

type Market = "india" | "global";

const popularRoles = [
  "Software Engineer",
  "Product Manager",
  "Data Scientist",
  "ML Engineer",
  "DevOps Engineer",
  "Frontend Engineer",
  "Backend Engineer",
  "Full Stack Engineer",
];

// ── Salary formatter ──────────────────────────────────────────────────────────
function formatSalary(value: number, currency: string): string {
  if (currency === "INR") {
    const l = value / 100_000;
    return l >= 1 ? `₹${l % 1 === 0 ? l.toFixed(0) : l.toFixed(1)}L` : `₹${(value / 1000).toFixed(0)}K`;
  }
  const k = value / 1000;
  return `$${k % 1 === 0 ? k.toFixed(0) : k.toFixed(0)}K`;
}

// ── Market toggle ─────────────────────────────────────────────────────────────
function MarketToggle({
  market, onChange,
}: { market: Market; onChange: (m: Market) => void }) {
  return (
    <div
      className="inline-flex items-center rounded-xl p-1 gap-1"
      style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      {(["india", "global"] as Market[]).map((m) => {
        const active = market === m;
        return (
          <motion.button
            key={m}
            onClick={() => onChange(m)}
            whileTap={{ scale: 0.97 }}
            className="relative flex items-center gap-2 px-4 py-2 rounded-lg text-[13px] font-semibold transition-all"
            style={{
              color: active ? "white" : "rgba(100,116,139,0.8)",
              background: active ? "linear-gradient(135deg,#C05800,#713600)" : "transparent",
              boxShadow: active ? "0 2px 12px rgba(192,88,0,0.3)" : "none",
            }}
          >
            {m === "india" ? (
              <>
                <span className="text-base leading-none">🇮🇳</span>
                <span>India</span>
                {active && (
                  <span className="text-[10px] font-normal opacity-70 flex items-center gap-0.5">
                    <IndianRupee size={9} />INR
                  </span>
                )}
              </>
            ) : (
              <>
                <Globe size={14} />
                <span>Around the Globe</span>
                {active && (
                  <span className="text-[10px] font-normal opacity-70 flex items-center gap-0.5">
                    <DollarSign size={9} />USD
                  </span>
                )}
              </>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}

// ── Trend icon ─────────────────────────────────────────────────────────────────
function TrendIcon({ trend }: { trend: string }) {
  if (trend === "rising") return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
  if (trend === "declining") return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
  return <Minus className="w-3.5 h-3.5 text-[var(--text-muted)]" />;
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function InsightsPage() {
  const [role, setRole]         = useState("Software Engineer");
  const [searchInput, setSearchInput] = useState("Software Engineer");
  const [market, setMarket]     = useState<Market>("india");

  const currency = market === "india" ? "INR" : "USD";
  const CurrencyIcon = market === "india" ? IndianRupee : DollarSign;

  const { data: insight, isLoading, isError, refetch } = useQuery({
    queryKey: ["career-insight", role, market],
    queryFn: async () => {
      const { data } = await apiClient.get(
        `/insights?role=${encodeURIComponent(role)}&market=${market}`,
      );
      return data as CareerInsight & { market?: string; currency?: string };
    },
    staleTime: 30 * 60 * 1000,
    retry: 2,
  });

  // resolve currency from response or from toggle state
  const effectiveCurrency = (insight as any)?.currency ?? currency;

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-wrap items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Career Insights</h1>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-[var(--accent-muted)] border-[var(--accent-primary)]/30 text-[var(--accent-hover)]">
            <Brain className="w-2.5 h-2.5" />
            Powered by JobSynk AI
          </span>
        </div>
        <p className="text-[14px] text-[var(--text-secondary)]">
          Real market data for your target role — salary benchmarks, trending skills, and hiring trends.
          {market === "india"
            ? " Sourced from Naukri, AmbitionBox & LinkedIn India."
            : " Sourced from LinkedIn, Glassdoor & Levels.fyi."}
        </p>
      </motion.div>

      {/* Market toggle + search */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.08 }}
        className="space-y-4"
      >
        {/* Toggle */}
        <MarketToggle market={market} onChange={(m) => setMarket(m)} />

        {/* Search bar */}
        <form
          onSubmit={(e) => { e.preventDefault(); setRole(searchInput); }}
          className="flex gap-3"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Enter a role to get insights…"
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
          >
            Get insights
          </button>
        </form>

        {/* Quick role chips */}
        <div className="flex flex-wrap gap-2">
          {popularRoles.map((r) => (
            <button
              key={r}
              onClick={() => { setRole(r); setSearchInput(r); }}
              className={`text-[12px] px-3 py-1.5 rounded-lg border transition-colors ${
                role === r
                  ? "bg-[var(--accent-muted)] border-[var(--accent-primary)]/30 text-[var(--accent-hover)]"
                  : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </motion.div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-48 rounded-2xl animate-shimmer" />
          ))}
        </div>
      )}

      {/* Error state */}
      {isError && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-red-400/30 bg-red-400/5">
          <AlertCircle className="w-8 h-8 text-red-400 mb-3" />
          <p className="text-[14px] font-medium text-[var(--text-primary)] mb-1">Could not load insights</p>
          <p className="text-[12px] text-[var(--text-muted)] mb-4 text-center max-w-xs">
            The AI service is temporarily unavailable. Try again in a moment.
          </p>
          <button
            onClick={() => refetch()}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      )}

      {/* ── Insights content ── */}
      <AnimatePresence mode="wait">
        {insight && !isLoading && !isError && (
          <motion.div
            key={`${role}-${market}`}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            {/* Market source badge */}
            <div className="flex items-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium"
                style={{ background: "rgba(192,88,0,0.1)", border: "1px solid rgba(192,88,0,0.2)", color: "#C05800" }}
              >
                {market === "india" ? "🇮🇳 India market · salaries in INR" : "🌍 Global market · salaries in USD"}
              </span>
              <span className="text-[11px] text-[var(--text-muted)]">
                {market === "india"
                  ? "Data via Naukri.com · AmbitionBox · LinkedIn India · NASSCOM"
                  : "Data via LinkedIn · Glassdoor · Levels.fyi · BLS"}
              </span>
            </div>

            {/* ── Salary ranges ── */}
            {insight.salary_range && (
              <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
                <div className="flex items-center gap-2 mb-5">
                  <CurrencyIcon className="w-4 h-4 text-emerald-400" />
                  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                    Salary Ranges · {insight.salary_range.location ?? (market === "india" ? "India" : "United States")}
                  </h2>
                  <span className="ml-auto text-[10px] text-[var(--text-muted)]">
                    {market === "india" ? "per annum (CTC)" : "per year (base)"}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { level: "Entry Level", range: insight.salary_range.entry, years: market === "india" ? "0–3 yrs" : "0–3 yrs" },
                    { level: "Mid Level",   range: insight.salary_range.mid,   years: "3–7 yrs" },
                    { level: "Senior Level", range: insight.salary_range.senior, years: "7+ yrs" },
                  ]
                    .filter(({ range }) => range?.min != null && range?.max != null)
                    .map(({ level, range, years }) => (
                      <div
                        key={level}
                        className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                      >
                        <div className="text-[11px] text-[var(--text-muted)] mb-0.5">{level}</div>
                        <div className="text-[11px] text-[var(--text-muted)] mb-2 opacity-60">{years}</div>
                        <div className="text-[17px] font-bold text-emerald-400 leading-tight">
                          {formatSalary(range.min, effectiveCurrency)}
                          <span className="text-[13px] text-[var(--text-muted)]"> – </span>
                          {formatSalary(range.max, effectiveCurrency)}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)] mt-1">
                          {market === "india" ? "lakhs per annum" : "per year"}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* ── Trending skills ── */}
            {(insight.trending_skills?.length ?? 0) > 0 && (
              <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
                <div className="flex items-center gap-2 mb-5">
                  <TrendingUp className="w-4 h-4 text-[var(--accent-primary)]" />
                  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                    Trending Skills
                    <span className="ml-2 text-[11px] font-normal text-[var(--text-muted)]">
                      {market === "india" ? "in India" : "globally"}
                    </span>
                  </h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {insight.trending_skills.map((skill) => (
                    <div
                      key={skill.skill}
                      className="flex items-center gap-3 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                    >
                      <TrendIcon trend={skill.trend} />
                      <div className="flex-1">
                        <div className="text-[13px] font-medium text-[var(--text-primary)]">
                          {skill.skill}
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <div
                            className="h-1 rounded-full bg-[var(--border-default)] overflow-hidden flex-1 max-w-[80px]"
                          >
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${skill.demand_score}%`,
                                background: "linear-gradient(90deg,#C05800,#e88040)",
                              }}
                            />
                          </div>
                          <span className="text-[11px] text-[var(--text-muted)]">
                            {skill.demand_score}/100 demand
                          </span>
                        </div>
                      </div>
                      <div className={`text-[11px] font-semibold ${
                        skill.yoy_change > 0 ? "text-emerald-400"
                          : skill.yoy_change < 0 ? "text-red-400"
                            : "text-[var(--text-muted)]"
                      }`}>
                        {skill.yoy_change > 0 ? "+" : ""}{skill.yoy_change}% YoY
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Job market + top companies ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
                <div className="flex items-center gap-2 mb-4">
                  <BarChart2 className="w-4 h-4 text-[#C05800]" />
                  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                    Job Market
                    <span className="ml-2 text-[11px] font-normal text-[var(--text-muted)]">
                      {market === "india" ? "India" : "Global"}
                    </span>
                  </h2>
                </div>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] text-[var(--text-secondary)]">Active openings</span>
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                      {insight.job_market.openings_count.toLocaleString("en-IN")}+
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] text-[var(--text-secondary)]">Competition</span>
                    <span className={`text-[13px] font-semibold capitalize ${
                      insight.job_market.competition_level === "high" ? "text-red-400"
                        : insight.job_market.competition_level === "medium" ? "text-amber-400"
                          : "text-emerald-400"
                    }`}>
                      {insight.job_market.competition_level}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[12px] text-[var(--text-secondary)]">Avg. response rate</span>
                    <span className="text-[13px] font-semibold text-emerald-400">
                      {insight.job_market.avg_response_rate}%
                    </span>
                  </div>
                  {insight.job_market.top_ats_systems?.length > 0 && (
                    <div>
                      <span className="text-[12px] text-[var(--text-secondary)]">
                        {market === "india" ? "Top HR / ATS tools" : "Top ATS systems"}
                      </span>
                      <div className="flex flex-wrap gap-1.5 mt-1">
                        {insight.job_market.top_ats_systems.map((ats, idx) => {
                          const label = typeof ats === "string" ? ats : (ats as any)?.name ?? String(ats);
                          return (
                            <span
                              key={idx}
                              className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-overlay)] border border-[var(--border-subtle)] text-[var(--text-muted)]"
                            >
                              {label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
                <div className="flex items-center gap-2 mb-4">
                  <Briefcase className="w-4 h-4 text-amber-400" />
                  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                    Top Hiring Companies
                    <span className="ml-2 text-[11px] font-normal text-[var(--text-muted)]">
                      {market === "india" ? "in India" : "globally"}
                    </span>
                  </h2>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {insight.top_companies.map((company, i) => {
                    const label = typeof company === "string"
                      ? company
                      : (company as any)?.name ?? JSON.stringify(company);
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2 p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                      >
                        <div className="w-5 h-5 rounded-md bg-[var(--accent-muted)] flex items-center justify-center flex-shrink-0">
                          <span className="text-[9px] font-bold text-[var(--accent-hover)]">{i + 1}</span>
                        </div>
                        <span className="text-[12px] text-[var(--text-secondary)] truncate">{label}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Growth projection ── */}
            {insight.growth_projection && (
              <div
                className="flex items-center gap-3 p-4 rounded-2xl"
                style={{ background: "rgba(192,88,0,0.06)", border: "1px solid rgba(192,88,0,0.15)" }}
              >
                <TrendingUp className="w-5 h-5 text-[#C05800] flex-shrink-0" />
                <div>
                  <p className="text-[12px] font-semibold text-[#C05800] mb-0.5">Growth Outlook</p>
                  <p className="text-[13px] text-[var(--text-secondary)]">{insight.growth_projection}</p>
                </div>
              </div>
            )}

            {/* ── Career paths ── */}
            {(insight.career_paths?.length ?? 0) > 0 && (
              <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)] mb-4">
                  Common Career Paths
                </h2>
                <div className="space-y-3">
                  {insight.career_paths.map((path, i) => {
                    const from = typeof path.from === "string" ? path.from : JSON.stringify(path.from);
                    const to   = typeof path.to === "string" ? path.to : JSON.stringify(path.to);
                    const time = typeof path.avg_transition_time === "string" ? path.avg_transition_time : "";
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3 p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                      >
                        <div className="text-[13px] font-medium text-[var(--text-primary)] min-w-0 truncate max-w-[30%]">
                          {from}
                        </div>
                        <div className="flex-1 flex items-center gap-2 min-w-0">
                          <div className="flex-1 h-px bg-[var(--border-default)]" />
                          <span className="text-[11px] text-[var(--text-muted)] whitespace-nowrap px-1">
                            {time}
                          </span>
                          <div className="flex-1 h-px bg-[var(--border-default)]" />
                        </div>
                        <div className="text-[13px] font-medium text-[var(--accent-hover)] min-w-0 truncate max-w-[30%] text-right">
                          {to}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
