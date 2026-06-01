"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { analysisApi } from "@/lib/api/analysis";
import { ScoreRingLarge } from "@/components/analysis/score-ring";
import { ScoreBreakdownPanel } from "@/components/analysis/score-breakdown";
import { KeywordGapPanel } from "@/components/analysis/keyword-gap";
import {
  CheckCircle2,
  XCircle,
  Lightbulb,
  Wand2,
  Users,
  ArrowRight,
  RefreshCw,
  ChevronRight,
  Briefcase,
  Brain,
  Sparkles,
} from "lucide-react";
import { ScoreFeedback } from "@/components/analysis/score-feedback";
import { jobApplicationsApi } from "@/lib/api/job-applications";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Tab = "overview" | "keywords" | "feedback" | "rewrite" | "mentors";

export function AnalysisResultClient({ id }: { id: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [pollingActive, setPollingActive] = useState(true);
  const [tracked, setTracked] = useState(false);

  async function handleTrackJob() {
    if (!analysis || tracked) return;
    try {
      await jobApplicationsApi.create({
        job_title: analysis.job?.parsed_data?.title || "Unknown Role",
        company: analysis.job?.company_name || "Unknown Company",
        job_url: analysis.job?.job_url,
        analysis_id: id,
        ats_score: analysis.scores?.overall_score,
        status: "saved",
      });
      setTracked(true);
      toast.success("Added to Job Tracker!");
    } catch {
      toast.error("Failed to add to tracker");
    }
  }

  const { data: analysis, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["analysis", id],
    queryFn: () => analysisApi.get(id),
    refetchInterval: pollingActive ? 3000 : false,
    retry: 4,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });

  useEffect(() => {
    if (analysis?.status === "complete" || analysis?.status === "failed") {
      setPollingActive(false);
    }
  }, [analysis?.status]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-transparent border-t-[var(--accent-primary)] animate-spin" />
      </div>
    );
  }

  if (isError) {
    const msg = (error as Error)?.message ?? "Unknown error";
    return (
      <div className="text-center py-20">
        <p className="text-[var(--text-primary)] font-medium mb-1">Could not load analysis</p>
        <p className="text-[13px] text-[var(--text-muted)] mb-4">{msg}</p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => refetch()}
            className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
          >
            Try again
          </button>
          <Link href="/analysis" className="px-4 py-2 rounded-xl border border-[var(--border-default)] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
            ← Back
          </Link>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="text-center py-20">
        <p className="text-[var(--text-muted)]">Analysis not found.</p>
        <Link href="/analysis" className="text-[var(--accent-primary)] text-[13px] mt-2 inline-block">
          ← Back to analysis
        </Link>
      </div>
    );
  }

  const isProcessing = analysis.status === "pending" || analysis.status === "processing";
  const isFailed = analysis.status === "failed";

  if (isProcessing) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <div className="relative w-16 h-16 mb-6">
          <div className="absolute inset-0 rounded-full border-2 border-[var(--accent-primary)]/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--accent-primary)] animate-spin" />
        </div>
        <h2 className="text-[18px] font-semibold text-[var(--text-primary)] mb-2">
          Analyzing your resume…
        </h2>
        <p className="text-[13px] text-[var(--text-secondary)]">
          This usually takes 15–30 seconds. The page will update automatically.
        </p>
      </div>
    );
  }

  if (isFailed) {
    return (
      <div className="text-center py-20">
        <div className="w-12 h-12 rounded-full bg-red-400/10 border border-red-400/20 flex items-center justify-center mx-auto mb-4">
          <XCircle className="w-6 h-6 text-red-400" />
        </div>
        <h2 className="text-[17px] font-semibold text-[var(--text-primary)] mb-2">Analysis failed</h2>
        <p className="text-[13px] text-[var(--text-muted)] mb-1 max-w-sm mx-auto">
          {(analysis as any).error_message
            ? `Error: ${(analysis as any).error_message}`
            : "Something went wrong while processing your resume. This is usually a temporary issue."}
        </p>
        <p className="text-[12px] text-[var(--text-muted)] mb-6">
          Your daily quota has not been charged for a failed analysis.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={async () => {
              try { await analysisApi.retry(id); refetch(); setPollingActive(true); }
              catch (e: any) { /* show nothing, retry UI handles it */ }
            }}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Retry analysis
          </button>
          <Link
            href="/analysis"
            className="px-5 py-2.5 rounded-xl border border-[var(--border-default)] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            ← New search
          </Link>
        </div>
      </div>
    );
  }

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "keywords", label: "Keywords & Gaps" },
    { id: "feedback", label: "Recruiter Feedback" },
    { id: "rewrite", label: "Bullet Rewrites" },
    { id: "mentors", label: "Mentor Matches" },
  ] as const;

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div>
          <div className="flex items-center gap-2 text-[12px] text-[var(--text-muted)] mb-1">
            <Link href="/analysis" className="hover:text-[var(--text-secondary)]">
              Analysis
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span>{analysis.job?.parsed_data?.title ?? "Job Analysis"}</span>
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            {analysis.job?.parsed_data?.title ?? "ATS Analysis"}
          </h1>
          <p className="text-[14px] text-[var(--text-secondary)] mt-1">
            {analysis.job?.company_name}
            {analysis.job?.parsed_data?.location && ` · ${analysis.job.parsed_data.location}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleTrackJob}
            disabled={tracked}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-60"
          >
            <Briefcase className="w-3.5 h-3.5" />
            {tracked ? "Tracked ✓" : "Track job"}
          </button>
          <Link
            href="/analysis"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            New analysis
          </Link>
        </div>
      </motion.div>

      {/* Score header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] flex flex-col md:flex-row items-center gap-8"
      >
        <ScoreRingLarge score={analysis.scores.overall_score} />

        {/* Quick score pills */}
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-2">
            <Brain className="w-3 h-3 text-[var(--accent-primary)]" />
            <span className="text-[10px] text-[var(--accent-hover)] font-medium">JobSync AI Score</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "ATS Compat.", score: analysis.scores.ats_score },
              { label: "Tech Fit", score: analysis.scores.technical_fit_score },
              { label: "Semantic", score: analysis.scores.semantic_match_score },
              { label: "Recruiter", score: analysis.scores.recruiter_impression_score },
            ].map(({ label, score }) => (
              <div
                key={label}
                className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-center"
              >
                <div
                  className="text-xl font-bold mb-0.5"
                  style={{
                    color:
                      score >= 75
                        ? "var(--score-high)"
                        : score >= 50
                          ? "var(--score-mid)"
                          : "var(--score-low)",
                  }}
                >
                  {score}
                </div>
                <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex flex-col gap-2 flex-shrink-0">
          <Link
            href="/improve"
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors whitespace-nowrap"
          >
            <Wand2 className="w-3.5 h-3.5" />
            Improve resume
          </Link>
          <Link
            href="/mentors"
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors whitespace-nowrap"
          >
            <Users className="w-3.5 h-3.5" />
            Find mentors
          </Link>
        </div>
      </motion.div>

      {/* JobSync AI badge row */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
        className="flex flex-wrap items-center gap-2">
        {/* Always show JobSync AI as the scorer */}
        <span className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border",
          analysis.scored_by === "jobsync-custom-ai"
            ? "bg-purple-400/10 border-purple-400/20 text-purple-400"
            : "bg-[var(--accent-muted)] border-[var(--accent-primary)]/30 text-[var(--accent-hover)]"
        )}>
          <Brain className="w-3 h-3" />
          Scored by JobSync AI
        </span>

        {/* Fallback badge — only shown when Groq LLM was the actual scorer */}
        {analysis.scored_by === "groq-llm" && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-amber-400/10 border-amber-400/25 text-amber-400">
            <Sparkles className="w-3 h-3" />
            Fallback Mechanism Applied
          </span>
        )}

        {/* Hire recommendation */}
        {analysis.hire_recommendation && (
          <span className={cn(
            "px-2.5 py-1 rounded-full text-[11px] font-medium border",
            analysis.hire_recommendation.includes("Yes") ? "bg-emerald-400/10 border-emerald-400/20 text-emerald-400"
              : analysis.hire_recommendation.includes("No") ? "bg-red-400/10 border-red-400/20 text-red-400"
              : "bg-amber-400/10 border-amber-400/20 text-amber-400"
          )}>
            {analysis.hire_recommendation}
          </span>
        )}
      </motion.div>

      {/* Recruiter summary */}
      {analysis.recruiter_summary && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--accent-subtle)]"
        >
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-[var(--accent-primary)]" />
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">
              JobSync AI Recruiter Analysis
            </span>
          </div>
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
            {analysis.recruiter_summary}
          </p>
        </motion.div>
      )}

      {/* JobSync AI dimension reasoning */}
      {analysis.ai_reasoning && Object.values(analysis.ai_reasoning).some(Boolean) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
          className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-[var(--accent-primary)]" />
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">JobSync AI Reasoning</span>
            <span className="ml-auto text-[10px] text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-full px-2 py-0.5">Powered by JobSync AI</span>
          </div>
          <div className="space-y-2">
            {(Object.entries(analysis.ai_reasoning) as [string, string][])
              .filter(([, v]) => v)
              .map(([key, value]) => (
                <div key={key} className="flex gap-3">
                  <span className="text-[11px] uppercase tracking-wider text-[var(--text-muted)] font-medium w-20 flex-shrink-0 pt-0.5 capitalize">
                    {key}
                  </span>
                  <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{value}</p>
                </div>
              ))}
          </div>
        </motion.div>
      )}

      {/* Feedback widget */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}>
        <ScoreFeedback
          analysisId={id}
          jobTitle={analysis.job?.parsed_data?.title}
        />
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] w-full overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-shrink-0 px-4 py-2 rounded-lg text-[13px] font-medium transition-all whitespace-nowrap",
              tab === t.id
                ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {tab === "overview" && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Strengths */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                    Strengths ({analysis.strengths.length})
                  </h3>
                </div>
                <div className="space-y-3">
                  {analysis.strengths.map((s, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-emerald-400/15"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] font-medium text-[var(--text-primary)]">
                          {s.title}
                        </span>
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full border",
                          s.impact === "high"
                            ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
                            : s.impact === "medium"
                              ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                              : "text-[var(--text-muted)] bg-[var(--bg-overlay)] border-[var(--border-subtle)]"
                        )}>
                          {s.impact} impact
                        </span>
                      </div>
                      <p className="text-[12px] text-[var(--text-secondary)]">{s.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Weaknesses */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <XCircle className="w-4 h-4 text-red-400" />
                  <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                    Weaknesses ({analysis.weaknesses.length})
                  </h3>
                </div>
                <div className="space-y-3">
                  {analysis.weaknesses.map((w, i) => (
                    <div
                      key={i}
                      className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-red-400/10"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[13px] font-medium text-[var(--text-primary)]">
                          {w.title}
                        </span>
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full border",
                          w.severity === "critical"
                            ? "text-red-400 bg-red-400/10 border-red-400/20"
                            : w.severity === "major"
                              ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                              : "text-[var(--text-muted)] bg-[var(--bg-overlay)] border-[var(--border-subtle)]"
                        )}>
                          {w.severity}
                        </span>
                      </div>
                      <p className="text-[12px] text-[var(--text-secondary)]">{w.description}</p>
                      <div className="text-[10px] text-[var(--text-muted)] mt-1">
                        Section: {w.section}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Score breakdown */}
              <div className="lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                    Score Breakdown
                  </h3>
                  <span className="inline-flex items-center gap-1 text-[10px] text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-full px-2 py-0.5">
                    <Brain className="w-2.5 h-2.5" /> JobSync AI
                  </span>
                </div>
                <ScoreBreakdownPanel scores={analysis.scores} />
              </div>
            </div>
          )}

          {tab === "keywords" && (
            <div className="space-y-1">
              <div className="flex items-center gap-2 mb-4">
                <Brain className="w-4 h-4 text-[var(--accent-primary)]" />
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">JobSync AI Keyword Analysis</span>
                <span className="ml-auto text-[10px] text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-full px-2 py-0.5">Powered by JobSync AI</span>
              </div>
              <KeywordGapPanel
                keywords={analysis.missing_keywords}
                skillGaps={analysis.skill_gaps}
              />
            </div>
          )}

          {tab === "feedback" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-[var(--accent-primary)]" />
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">JobSync AI Improvement Suggestions</span>
                <span className="ml-auto text-[10px] text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-full px-2 py-0.5">Powered by JobSync AI</span>
              </div>
              {analysis.improvement_suggestions.map((s, i) => (
                <div
                  key={i}
                  className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-overlay)] text-[var(--text-muted)] border border-[var(--border-subtle)]">
                        {s.category}
                      </span>
                      <span className={cn(
                        "text-[10px] px-2 py-0.5 rounded-full border font-medium",
                        s.priority === "high"
                          ? "text-red-400 bg-red-400/10 border-red-400/20"
                          : s.priority === "medium"
                            ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                            : "text-blue-400 bg-blue-400/10 border-blue-400/20"
                      )}>
                        {s.priority} priority
                      </span>
                    </div>
                  </div>
                  <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">
                    {s.title}
                  </h3>
                  <p className="text-[13px] text-[var(--text-secondary)] mb-3">
                    {s.description}
                  </p>
                  <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent-primary)]/10">
                    <ArrowRight className="w-3.5 h-3.5 text-[var(--accent-primary)] mt-0.5 flex-shrink-0" />
                    <p className="text-[12px] text-[var(--text-secondary)]">{s.action}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "rewrite" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-[var(--accent-primary)]" />
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">JobSync AI Resume Rewriter</span>
                <span className="ml-auto text-[10px] text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-full px-2 py-0.5">Powered by JobSync AI</span>
              </div>
              <p className="text-[13px] text-[var(--text-secondary)] mb-2">
                JobSync AI-rewritten bullet points with stronger verbs, quantified metrics, and role-specific language.
              </p>
              {analysis.rewritten_bullets.map((b, i) => (
                <div
                  key={i}
                  className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3"
                >
                  <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-wider font-medium">
                    {b.section}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="p-3 rounded-xl bg-red-400/5 border border-red-400/15">
                      <div className="text-[10px] text-red-400 font-medium mb-1.5">
                        BEFORE
                      </div>
                      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                        {b.original}
                      </p>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-400/5 border border-emerald-400/15">
                      <div className="text-[10px] text-emerald-400 font-medium mb-1.5 flex items-center gap-1">
                        AFTER
                        {b.metrics_added && (
                          <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-400/10 text-[9px]">
                            +metrics
                          </span>
                        )}
                      </div>
                      <p className="text-[12px] text-[var(--text-primary)] leading-relaxed font-medium">
                        {b.rewritten}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                    <Lightbulb className="w-3 h-3 text-[var(--accent-primary)]" />
                    {b.improvement_reason}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "mentors" && (
            <div className="text-center py-12">
              <Users className="w-10 h-10 text-[var(--text-muted)] mx-auto mb-3" />
              <p className="text-[14px] text-[var(--text-secondary)] mb-4">
                Get mentor recommendations tailored to this analysis
              </p>
              <Link
                href="/mentors"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
              >
                Find my mentors <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
