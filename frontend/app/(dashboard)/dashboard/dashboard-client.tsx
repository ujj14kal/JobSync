"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion, useInView, useMotionValue, useSpring, AnimatePresence } from "framer-motion";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import Link from "next/link";
import TiltCard from "@/components/ui/TiltCard";
import { MagicCard } from "@/components/ui/magic-card";
import {
  ArrowRight, BarChart2, FileText, Users,
  TrendingUp, Upload, Plus, Clock, Briefcase,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { analysisApi } from "@/lib/api/analysis";
import { resumeApi } from "@/lib/api/resume";
import { jobApplicationsApi } from "@/lib/api/job-applications";
import { formatRelativeTime, getScoreColor } from "@/lib/utils";
import type { User as SupabaseUser } from "@supabase/supabase-js";

// ── Animated number counter ───────────────────────────────────────────────────
function AnimatedNumber({ value, duration = 1.2 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, { duration: duration * 1000, bounce: 0 });
  const inView = useInView(ref, { once: true });

  useEffect(() => {
    if (inView) motionVal.set(value);
  }, [inView, value, motionVal]);

  useEffect(() => {
    return spring.on("change", (v) => {
      if (ref.current) ref.current.textContent = String(Math.round(v));
    });
  }, [spring]);

  return <span ref={ref}>0</span>;
}

// ── Recharts shared tooltip style ─────────────────────────────────────────────
const tooltipStyle = {
  contentStyle: {
    background: "var(--bg-elevated)",
    border: "1px solid var(--border-default)",
    borderRadius: "10px",
    color: "var(--text-primary)",
    fontSize: "12px",
    boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
  },
  cursor: { fill: "rgba(255,255,255,0.03)" },
};

// ── Score Trend chart ─────────────────────────────────────────────────────────
function ScoreTrendChart({ analyses }: { analyses: { created_at: string; scores: { overall_score: number } }[] }) {
  const data = [...analyses]
    .reverse()
    .slice(-8)
    .map((a) => ({
      date: new Date(a.created_at).toLocaleDateString("en", { month: "short", day: "numeric" }),
      score: a.scores?.overall_score ?? 0,
    }));

  if (data.length < 2) return null;

  return (
    <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="text-[12px] font-semibold text-[var(--text-secondary)] mb-4">Score Trend</div>
      <ResponsiveContainer width="100%" height={148}>
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
          <defs>
            <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#C05800" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#C05800" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: "#9A7050", fontSize: 9 }} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={{ fill: "#9A7050", fontSize: 9 }} axisLine={false} tickLine={false} />
          <Tooltip {...tooltipStyle} />
          <Area
            type="monotone"
            dataKey="score"
            stroke="#C05800"
            fill="url(#scoreGrad)"
            strokeWidth={2}
            dot={{ fill: "#C05800", r: 3, strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "#D06818" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Application funnel ────────────────────────────────────────────────────────
function FunnelChart({ byStatus }: { byStatus: Record<string, number> }) {
  const stages = [
    { key: "saved",        label: "Saved",        color: "#9A7050", rgb: "154,112,80" },
    { key: "applied",      label: "Applied",      color: "#C05800", rgb: "192,88,0" },
    { key: "screening",    label: "Screening",    color: "#d97020", rgb: "217,112,32" },
    { key: "interviewing", label: "Interviewing", color: "#d4aa30", rgb: "212,170,48" },
    { key: "offer",        label: "Offers",       color: "#7ab840", rgb: "122,184,64" },
    { key: "rejected",     label: "Rejected",     color: "#c84020", rgb: "200,64,32" },
  ];
  const max = Math.max(...stages.map((s) => byStatus[s.key] ?? 0), 1);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });

  return (
    <div ref={ref} className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="text-[12px] font-semibold text-[var(--text-secondary)] mb-4">Application Funnel</div>
      <div className="space-y-3">
        {stages.map(({ key, label, color, rgb }) => {
          const count = byStatus[key] ?? 0;
          const pct = max > 0 ? (count / max) * 100 : 0;
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="text-[10px] text-[var(--text-muted)] w-20 shrink-0 text-right">{label}</span>
              <div className="flex-1 h-2 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: `linear-gradient(90deg,rgba(${rgb},0.6),rgba(${rgb},1))` }}
                  initial={{ width: 0 }}
                  animate={inView ? { width: `${pct}%` } : {}}
                  transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1], delay: 0.1 }}
                />
              </div>
              <span className="text-[10px] font-semibold w-4 shrink-0 text-right" style={{ color }}>
                {count}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Weekly activity bar chart ─────────────────────────────────────────────────
function ActivityChart({ weeklyActivity }: { weeklyActivity: { week: string; count: number }[] }) {
  if (!weeklyActivity?.length || weeklyActivity.every((w) => w.count === 0)) return null;

  return (
    <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
      <div className="text-[12px] font-semibold text-[var(--text-secondary)] mb-4">Weekly Applications</div>
      <ResponsiveContainer width="100%" height={120}>
        <BarChart data={weeklyActivity} margin={{ top: 4, right: 4, bottom: 0, left: -28 }} barSize={14}>
          <CartesianGrid stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis dataKey="week" tick={{ fill: "#9A7050", fontSize: 9 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#9A7050", fontSize: 9 }} axisLine={false} tickLine={false} allowDecimals={false} />
          <Tooltip {...tooltipStyle} />
          <Bar dataKey="count" fill="#C05800" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Job stat cards ────────────────────────────────────────────────────────────
function JobStatCard({ label, value, color, rgb }: { label: string; value: string | number; color: string; rgb: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  return (
    <TiltCard intensity={10} scale={1.04} className="h-full">
      <div
        ref={ref}
        className="relative p-5 rounded-2xl text-center overflow-hidden h-full"
        style={{
          background: `linear-gradient(135deg,rgba(${rgb},0.12) 0%,rgba(${rgb},0.04) 100%)`,
          border: `1px solid rgba(${rgb},0.22)`,
          boxShadow: `0 0 24px rgba(${rgb},0.08), 0 4px 16px rgba(0,0,0,0.2)`,
        }}
      >
        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 0%,rgba(${rgb},0.18),transparent 60%)` }} />
        <div className="text-2xl font-bold relative" style={{ color }}>{value}</div>
        <div className="text-[11px] text-[var(--text-muted)] mt-1 relative font-medium">{label}</div>
        <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg,transparent,rgba(${rgb},0.6),transparent)` }} />
      </div>
    </TiltCard>
  );
}

// ── Quick actions ─────────────────────────────────────────────────────────────
const quickActions = [
  { href: "/analysis", icon: BarChart2,  label: "New ATS Analysis", description: "Match resume to a job", accent: "indigo"  },
  { href: "/resume",   icon: Upload,     label: "Upload Resume",    description: "Add or update your resume", accent: "violet"  },
  { href: "/mentors",  icon: Users,      label: "Find Mentors",     description: "Get matched with experts", accent: "amber"   },
  { href: "/insights", icon: TrendingUp, label: "Career Insights",  description: "Market trends & salary data", accent: "emerald" },
];

const accentBg: Record<string, React.CSSProperties> = {
  indigo:  { background: "linear-gradient(135deg,rgba(255,255,255,0.07) 0%,rgba(192,88,0,0.07) 100%)",   border: "1px solid rgba(192,88,0,0.25)" },
  violet:  { background: "linear-gradient(135deg,rgba(255,255,255,0.07) 0%,rgba(113,54,0,0.07) 100%)",   border: "1px solid rgba(113,54,0,0.25)" },
  amber:   { background: "linear-gradient(135deg,rgba(255,255,255,0.07) 0%,rgba(212,170,48,0.07) 100%)", border: "1px solid rgba(212,170,48,0.25)" },
  emerald: { background: "linear-gradient(135deg,rgba(255,255,255,0.07) 0%,rgba(122,184,64,0.07) 100%)", border: "1px solid rgba(122,184,64,0.25)" },
};
const accentRgb:   Record<string, string> = { indigo: "192,88,0", violet: "113,54,0", amber: "212,170,48", emerald: "122,184,64" };
const accentColor: Record<string, string> = { indigo: "#D06818",  violet: "#8c4a18",  amber: "#d4aa30",    emerald: "#7ab840" };

const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const cardItem   = { hidden: { opacity: 0, y: 20, scale: 0.97 }, show: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 260, damping: 22 } } };
const listItem   = { hidden: { opacity: 0, x: -12 },             show: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 300, damping: 28 } } };

export function DashboardClient({ user }: { user: SupabaseUser | null }) {
  const name = user?.user_metadata?.full_name?.split(" ")[0] ?? "there";

  // Defer React Query cache-driven content to after mount to prevent hydration mismatch.
  // The persisted cache resolves synchronously on the client before React hydrates.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: analyses, isLoading: analysesLoading } = useQuery({
    queryKey: ["analyses"],
    queryFn: analysisApi.list,
    staleTime: 4 * 60 * 1000,
  });
  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: resumeApi.list,
    staleTime: 4 * 60 * 1000,
  });
  const { data: jobStats, isLoading: jobStatsLoading } = useQuery({
    queryKey: ["job-application-stats"],
    queryFn: jobApplicationsApi.stats,
    staleTime: 4 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const latestAnalysis = analyses?.[0];
  const hasResume = (resumes?.length ?? 0) > 0;
  const hasJobData = (jobStats?.total ?? 0) > 0;

  // No InView needed — scroll is inside <main overflow-y-auto>, not window.
  // All sections are always visible so we animate unconditionally.
  const scoresRef = useRef<HTMLDivElement>(null);
  const pipelineRef = useRef<HTMLDivElement>(null);

  return (
    <div className="space-y-8">
      {/* ── Header ── */}
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.16,1,0.3,1] }}>
        <div className="mb-1">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Good morning, {name}</h1>
        </div>
        <p className="text-[14px] text-[var(--text-secondary)]">
          {mounted
            ? (hasResume ? "Ready to analyze another job? Pick a quick action below." : "Let's start by uploading your resume.")
            : "Ready to get started? Pick a quick action below."}
        </p>
      </motion.div>

      {/* ── Onboarding banner ── */}
      <AnimatePresence>
        {mounted && !hasResume && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ delay: 0.12, type: "spring", stiffness: 260, damping: 24 }}
            className="relative p-5 rounded-2xl flex items-center justify-between gap-4 overflow-hidden"
            style={{ background: "linear-gradient(135deg,rgba(192,88,0,0.12),rgba(113,54,0,0.08))", border: "1px solid rgba(192,88,0,0.28)" }}
          >
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 10% 50%,rgba(192,88,0,0.12),transparent 60%)" }} />
            <div className="flex items-center gap-3 relative">
              <motion.div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}
                animate={{ rotate: [0, 5, -5, 0] }}
                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
              >
                <FileText className="w-5 h-5 text-white" />
              </motion.div>
              <div>
                <div className="text-[14px] font-semibold text-[var(--text-primary)]">Upload your resume to get started</div>
                <div className="text-[12px] text-[var(--text-secondary)]">PDF or DOCX · Parsed instantly · Stays private</div>
              </div>
            </div>
            <Link href="/resume" className="btn-primary flex-shrink-0 !px-4 !py-2 !text-[13px]">
              Upload now <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Quick Actions ── */}
      <div>
        <motion.h2
          className="text-[13px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
        >
          Quick Actions
        </motion.h2>
        <motion.div className="grid grid-cols-2 lg:grid-cols-4 gap-3" variants={container} initial="hidden" animate="show">
          {quickActions.map((action) => (
            <motion.div key={action.href} variants={cardItem}>
              <TiltCard intensity={8} scale={1.04} className="h-full">
                <MagicCard gradientRgb={accentRgb[action.accent]} gradientOpacity={0.12} gradientSize={220} className="h-full rounded-2xl">
                  <Link
                    href={action.href}
                    className="group relative flex flex-col p-5 rounded-2xl h-full transition-all duration-300"
                    style={accentBg[action.accent]}
                  >
                    <motion.div
                      className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                      style={{ background: `rgba(${accentRgb[action.accent]},0.15)`, border: `1px solid rgba(${accentRgb[action.accent]},0.25)` }}
                      whileHover={{ scale: 1.1, rotate: 5 }}
                      transition={{ type: "spring", stiffness: 400, damping: 15 }}
                    >
                      <action.icon className="w-4 h-4" style={{ color: accentColor[action.accent] }} />
                    </motion.div>
                    <div className="text-[13px] font-semibold text-[var(--text-primary)] mb-1">{action.label}</div>
                    <div className="text-[12px] text-[var(--text-secondary)]">{action.description}</div>
                    <div className="mt-auto pt-3 flex items-center gap-1 text-[12px] font-medium text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">
                      Go
                      <motion.span className="inline-flex" animate={{ x: [0, 3, 0] }} transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}>
                        <ArrowRight className="w-3 h-3" />
                      </motion.span>
                    </div>
                  </Link>
                </MagicCard>
              </TiltCard>
            </motion.div>
          ))}
        </motion.div>
      </div>

      {/* ── Application Pipeline ── */}
      {!mounted || jobStatsLoading ? (
        <div>
          <div className="flex items-center justify-between mb-4">
            <div className="h-3.5 w-40 rounded-full bg-white/5 animate-shimmer" />
            <div className="h-3.5 w-24 rounded-full bg-white/5 animate-shimmer" />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-white/5 animate-shimmer" />
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="h-48 rounded-2xl bg-white/5 animate-shimmer" />
            <div className="h-48 rounded-2xl bg-white/5 animate-shimmer" />
          </div>
        </div>
      ) : (
        <div ref={pipelineRef}>
          <div className="flex items-center justify-between mb-4">
            <motion.h2
              className="text-[13px] font-semibold text-[var(--text-muted)] uppercase tracking-wider"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            >
              Application Pipeline
            </motion.h2>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Link href="/jobs" className="text-[12px] text-[#C05800] hover:text-[#E08840] flex items-center gap-1 transition-colors">
                <Briefcase className="w-3 h-3" /> Job Tracker <ArrowRight className="w-3 h-3" />
              </Link>
            </motion.div>
          </div>

          {/* Big stat cards — always show, 0 when no data */}
          <motion.div
            className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5"
            variants={container} initial="hidden" animate={"show"}
          >
            <motion.div variants={cardItem}>
              <JobStatCard label="Total Applications" value={jobStats?.total ?? 0} color="#D06818" rgb="192,88,0" />
            </motion.div>
            <motion.div variants={cardItem}>
              <JobStatCard label="Response Rate" value={`${jobStats?.response_rate ?? 0}%`} color="#d4aa30" rgb="212,170,48" />
            </motion.div>
            <motion.div variants={cardItem}>
              <JobStatCard label="Interviews" value={jobStats?.by_status?.interviewing ?? 0} color="#d4aa30" rgb="212,170,48" />
            </motion.div>
            <motion.div variants={cardItem}>
              <JobStatCard label="Offers" value={jobStats?.offers ?? 0} color="#7ab840" rgb="122,184,64" />
            </motion.div>
          </motion.div>

          {/* Charts — show empty state when no applications yet */}
          {hasJobData ? (
            <>
              <motion.div
                className="grid md:grid-cols-2 gap-4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.25, duration: 0.5, ease: [0.16,1,0.3,1] }}
              >
                {(analyses?.length ?? 0) >= 2 && <ScoreTrendChart analyses={analyses!} />}
                {jobStats?.by_status && <FunnelChart byStatus={jobStats.by_status} />}
              </motion.div>
              {jobStats?.weekly_activity && (
                <motion.div
                  className="mt-4"
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35, duration: 0.5, ease: [0.16,1,0.3,1] }}
                >
                  <ActivityChart weeklyActivity={jobStats.weekly_activity} />
                </motion.div>
              )}
            </>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="flex flex-col items-center justify-center py-12 rounded-2xl border border-dashed border-[var(--border-subtle)]"
            >
              <Briefcase className="w-7 h-7 text-[var(--text-muted)] mb-3" />
              <p className="text-[14px] text-[var(--text-secondary)] mb-1">No applications tracked yet</p>
              <p className="text-[12px] text-[var(--text-muted)] mb-4">Start logging jobs to see funnel & trend charts</p>
              <Link href="/jobs" className="btn-primary !px-4 !py-2 !text-[13px] flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Track a job
              </Link>
            </motion.div>
          )}
        </div>
      )}

      {/* ── Recent Analyses ── */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <motion.h2
            className="text-[13px] font-semibold text-[var(--text-muted)] uppercase tracking-wider"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}
          >
            Recent Analyses
          </motion.h2>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>
            <Link href="/analysis" className="text-[12px] text-[#C05800] hover:text-[#E08840] flex items-center gap-1 transition-colors">
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </motion.div>
        </div>

        {!mounted || analysesLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <motion.div key={i} className="h-20 rounded-2xl bg-white/5 animate-shimmer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.06 }} />
            ))}
          </div>
        ) : analyses && analyses.length > 0 ? (
          <motion.div className="space-y-2" variants={container} initial="hidden" animate="show">
            {analyses.slice(0, 5).map((analysis) => (
              <motion.div key={analysis.id} variants={listItem}>
                <Link
                  href={`/analysis/${analysis.id}`}
                  className="group flex items-center gap-4 p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)] transition-all duration-200"
                >
                  <motion.div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-[16px] font-bold flex-shrink-0"
                    style={{
                      background: `${getScoreColor(analysis.scores.overall_score)}18`,
                      color: getScoreColor(analysis.scores.overall_score),
                      border: `1px solid ${getScoreColor(analysis.scores.overall_score)}35`,
                    }}
                    whileHover={{ scale: 1.08 }}
                    transition={{ type: "spring", stiffness: 400, damping: 15 }}
                  >
                    {analysis.scores.overall_score}
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
                      {analysis.job?.parsed_data?.title ?? "Job Analysis"} · {analysis.job?.company_name ?? ""}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[12px] text-[var(--text-muted)] flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(analysis.created_at)}
                      </span>
                      <StatusBadge status={analysis.status} />
                    </div>
                  </div>
                  <motion.div
                    className="flex-shrink-0"
                    animate={{ x: [0, 3, 0] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut", delay: 0.5 }}
                  >
                    <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors" />
                  </motion.div>
                </Link>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.15, type: "spring" }}
            className="flex flex-col items-center justify-center py-16 rounded-2xl border border-[var(--border-subtle)] border-dashed"
          >
            <motion.div animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 2.5, ease: "easeInOut" }}>
              <BarChart2 className="w-8 h-8 text-[var(--text-muted)] mb-3" />
            </motion.div>
            <p className="text-[14px] text-[var(--text-secondary)] mb-1">No analyses yet</p>
            <p className="text-[12px] text-[var(--text-muted)] mb-4">Run your first ATS analysis to see results here</p>
            <Link href="/analysis" className="btn-primary !px-4 !py-2 !text-[13px] flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> New analysis
            </Link>
          </motion.div>
        )}
      </div>

      {/* ── Score Breakdown (latest analysis) ── */}
      {!mounted || analysesLoading ? (
        <div>
          <div className="h-3.5 w-44 rounded-full bg-white/5 animate-shimmer mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-white/5 animate-shimmer" />
            ))}
          </div>
        </div>
      ) : (
        <div ref={scoresRef}>
          <motion.h2
            className="text-[13px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          >
            Latest Score Breakdown
          </motion.h2>

          {latestAnalysis && latestAnalysis.status === "complete" ? (
            <motion.div
              className="grid grid-cols-2 md:grid-cols-5 gap-3"
              variants={container} initial="hidden" animate={"show"}
            >
              {[
                { label: "Overall",   score: latestAnalysis.scores.overall_score },
                { label: "ATS",       score: latestAnalysis.scores.ats_score },
                { label: "Tech Fit",  score: latestAnalysis.scores.technical_fit_score },
                { label: "Semantic",  score: latestAnalysis.scores.semantic_match_score },
                { label: "Recruiter", score: latestAnalysis.scores.recruiter_impression_score },
              ].map(({ label, score }) => {
                const c = getScoreColor(score);
                const rgb = score >= 80 ? "106,170,52" : score >= 60 ? "192,88,0" : score >= 40 ? "212,170,48" : "200,64,32";
                return (
                  <motion.div key={label} variants={cardItem}>
                    <TiltCard intensity={12} scale={1.05}>
                      <div
                        className="relative p-4 rounded-2xl text-center overflow-hidden"
                        style={{
                          background: `linear-gradient(135deg,rgba(${rgb},0.14) 0%,rgba(${rgb},0.05) 100%)`,
                          border: `1px solid rgba(${rgb},0.28)`,
                          boxShadow: `0 0 28px rgba(${rgb},0.10), 0 8px 24px rgba(0,0,0,0.25)`,
                        }}
                      >
                        <div className="absolute inset-0 pointer-events-none" style={{ background: `radial-gradient(circle at 50% 0%,rgba(${rgb},0.18),transparent 60%)` }} />
                        <div className="text-2xl font-bold mb-1 relative" style={{ color: c, textShadow: `0 0 20px ${c}80` }}>
                          {<AnimatedNumber value={score} duration={1.0} />}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)] relative">{label}</div>
                        <motion.div
                          className="absolute bottom-0 left-0 h-0.5 rounded-full"
                          style={{ background: `linear-gradient(90deg,transparent,rgba(${rgb},0.7),transparent)` }}
                          initial={{ width: "0%" }}
                          animate={{ width: `${score}%` }}
                          transition={{ duration: 1.2, ease: [0.16,1,0.3,1], delay: 0.3 }}
                        />
                      </div>
                    </TiltCard>
                  </motion.div>
                );
              })}
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="flex flex-col items-center justify-center py-12 rounded-2xl border border-dashed border-[var(--border-subtle)]"
            >
              <BarChart2 className="w-7 h-7 text-[var(--text-muted)] mb-3" />
              <p className="text-[14px] text-[var(--text-secondary)] mb-1">No score data yet</p>
              <p className="text-[12px] text-[var(--text-muted)] mb-4">Run an ATS analysis to see your resume scores here</p>
              <Link href="/analysis" className="btn-primary !px-4 !py-2 !text-[13px] flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" /> Run analysis
              </Link>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    complete:   { label: "Complete",    className: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
    processing: { label: "Processing…", className: "text-amber-400 bg-amber-400/10 border-amber-400/20" },
    pending:    { label: "Pending",     className: "text-[var(--text-muted)] bg-[var(--bg-overlay)] border-[var(--border-default)]" },
    failed:     { label: "Failed",      className: "text-red-400 bg-red-400/10 border-red-400/20" },
  };
  const cfg = config[status] ?? config.pending;
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
