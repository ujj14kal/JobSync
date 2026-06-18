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
  FileText,
  TrendingUp,
  Info,
  MessageSquare,
  Loader2,
  AlertTriangle,
  Share2,
} from "lucide-react";
import { ScoreFeedback } from "@/components/analysis/score-feedback";
import { jobApplicationsApi } from "@/lib/api/job-applications";
import { useFeedback } from "@/components/feedback/FeedbackProvider";
import { FeedbackBanner } from "@/components/feedback/FeedbackBanner";
import { toast } from "sonner";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Tab = "overview" | "keywords" | "feedback" | "rewrite" | "interview";

// ── Analysis progress steps UI ────────────────────────────────────────────────
const PIPELINE_STEPS = [
  { id: "parse",   label: "Parsing resume",          icon: FileText,  duration: 4  },
  { id: "embed",   label: "Generating embeddings",   icon: Brain,     duration: 8  },
  { id: "score",   label: "Scoring with AI",         icon: Sparkles,  duration: 18 },
  { id: "feedback",label: "Writing recruiter report",icon: Users,     duration: 30 },
] as const;

function AnalysisProcessingState({ status }: { status: string }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(id);
  }, []);

  // Determine which step is active based on elapsed time
  const getActiveStep = () => {
    let acc = 0;
    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      acc += PIPELINE_STEPS[i].duration;
      if (elapsed < acc) return i;
    }
    return PIPELINE_STEPS.length - 1;
  };

  const activeStep = getActiveStep();

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {/* Animated ring */}
      <div className="relative w-20 h-20 mb-8">
        <div className="absolute inset-0 rounded-full border-2 border-[var(--accent-primary)]/15" />
        <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--accent-primary)] animate-spin" />
        <div className="absolute inset-2 rounded-full border border-[var(--accent-primary)]/10 border-t-[var(--accent-primary)]/40 animate-spin" style={{ animationDuration: "1.5s", animationDirection: "reverse" }} />
        <div className="absolute inset-0 flex items-center justify-center">
          <Sparkles className="w-6 h-6 text-[var(--accent-primary)]" />
        </div>
      </div>

      <h2 className="text-[20px] font-bold text-[var(--text-primary)] mb-2 text-center">
        Analyzing your resume…
      </h2>
      <p className="text-[13px] text-[var(--text-secondary)] mb-8 text-center max-w-sm">
        Our AI is running a full ATS pipeline. Usually 15–30 seconds.
      </p>

      {/* Step pipeline */}
      <div className="w-full max-w-sm space-y-2">
        {PIPELINE_STEPS.map((step, i) => {
          const Icon = step.icon;
          const done = i < activeStep;
          const active = i === activeStep;
          return (
            <motion.div
              key={step.id}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.12, type: "spring", stiffness: 300, damping: 28 }}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300",
                done   && "opacity-40",
                active && "bg-[var(--accent-primary)]/8 border border-[var(--accent-primary)]/20",
                !done && !active && "opacity-25",
              )}
            >
              <div className={cn(
                "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 transition-all duration-300",
                done   && "bg-emerald-400/10 border border-emerald-400/20",
                active && "bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30",
                !done && !active && "bg-[var(--bg-elevated)] border border-[var(--border-subtle)]",
              )}>
                {done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Icon className={cn(
                    "w-4 h-4 transition-colors",
                    active ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)]",
                  )} />
                )}
              </div>
              <span className={cn(
                "text-[13px] font-medium transition-colors",
                active ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]",
              )}>
                {step.label}
              </span>
              {active && (
                <motion.div
                  className="ml-auto flex gap-0.5"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  {[0, 1, 2].map((d) => (
                    <motion.div
                      key={d}
                      className="w-1 h-1 rounded-full bg-[var(--accent-primary)]"
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ repeat: Infinity, duration: 1.2, delay: d * 0.2 }}
                    />
                  ))}
                </motion.div>
              )}
            </motion.div>
          );
        })}
      </div>

      <p className="text-[11px] text-[var(--text-muted)] mt-6">
        {elapsed}s elapsed · updating automatically
      </p>
    </div>
  );
}

export function AnalysisResultClient({ id }: { id: string }) {
  const [tab, setTab] = useState<Tab>("overview");
  const [pollingActive, setPollingActive] = useState(true);
  const [tracked, setTracked] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [interviewPrepEnabled, setInterviewPrepEnabled] = useState(false);
  const { markServiceUsed } = useFeedback();
  useEffect(() => setMounted(true), []);

  const { data: interviewPrep, isFetching: interviewPrepLoading, error: interviewPrepError } = useQuery({
    queryKey: ["interview-prep", id],
    queryFn: () => analysisApi.getInterviewPrep(id),
    enabled: interviewPrepEnabled,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: 1,
  });

  async function handleTrackJob() {
    if (!analysis || tracked) return;
    try {
      await jobApplicationsApi.create({
        job_title: analysis.job?.parsed_data?.title || "Unknown Role",
        company: analysis.job?.company_name || "Unknown Company",
        job_url: analysis.job?.source_url,
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
    gcTime: 60 * 60 * 1000,
    retry: 4,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
  });

  useEffect(() => {
    if (analysis?.status === "complete" || analysis?.status === "failed") {
      setPollingActive(false);
    }
    if (analysis?.status === "complete") {
      markServiceUsed({ feature: "ats_analysis", analysisId: id });
    }
  }, [analysis?.status, id, markServiceUsed]);

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
    return <AnalysisProcessingState status={analysis.status} />;
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
              catch (e: any) { toast.error(e?.message || "Failed to retry analysis"); }
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
    { id: "overview",   label: "Overview" },
    { id: "keywords",   label: "Keywords & Gaps" },
    { id: "feedback",   label: "Recruiter Feedback" },
    { id: "rewrite",    label: "Bullet Rewrites" },
    { id: "interview",  label: "Interview Prep" },
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
          <button
            onClick={() => {
              const url = `${window.location.origin}/share/${id}`;
              navigator.clipboard.writeText(url).then(() => toast.success("Share link copied!"));
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border-default)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
          >
            <Share2 className="w-3.5 h-3.5" />
            Share
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
            <span className="text-[10px] text-[var(--accent-hover)] font-medium">JobSynk AI Score</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "ATS Compat.", score: analysis.scores.ats_score,                    tip: "How well your resume passes automated parsing — keywords, formatting, section headers" },
              { label: "Tech Fit",    score: analysis.scores.technical_fit_score,           tip: "Match between your technical skills & experience and what this role actually requires" },
              { label: "Semantic",    score: analysis.scores.semantic_match_score,          tip: "Deep contextual similarity — does your experience context actually match this job's context" },
              { label: "Recruiter",   score: analysis.scores.recruiter_impression_score,    tip: "Estimated recruiter first-pass impression — clarity, achievement quality, professionalism" },
            ].map(({ label, score, tip }) => (
              <div
                key={label}
                className="relative group p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-center"
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
                <div className="text-[10px] text-[var(--text-muted)] flex items-center justify-center gap-1">
                  {label}
                  <Info className="w-2.5 h-2.5 opacity-40 group-hover:opacity-80 transition-opacity" />
                </div>
                {/* Tooltip */}
                <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 px-3 py-2 rounded-lg bg-[var(--bg-overlay)] border border-[var(--border-default)] text-[11px] text-[var(--text-secondary)] leading-relaxed opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-lg text-left">
                  {tip}
                </div>
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
        </div>
      </motion.div>

      {/* Match tier badge — honest score-based label, no fabricated probabilities */}
      {mounted && (() => {
        const score = analysis.scores.overall_score ?? 0;
        const { color, tier, context } =
          score >= 75 ? { color: "#10b981", tier: "Strong Match",  context: "Highly relevant to this role" } :
          score >= 55 ? { color: "#3b82f6", tier: "Good Match",    context: "Competitive applicant" }        :
          score >= 35 ? { color: "#f59e0b", tier: "Fair Match",    context: "Some gaps to address" }         :
          score >= 20 ? { color: "#f97316", tier: "Weak Match",    context: "Significant gaps present" }     :
                        { color: "#ef4444", tier: "Poor Match",    context: "Not suited for this role" };
        return (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }}
            className="inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border text-[12px] font-medium"
            style={{ background: `${color}14`, borderColor: `${color}30`, color }}>
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{tier}</span>
            <span className="opacity-60 font-normal">·</span>
            <span className="opacity-75 font-normal">{context}</span>
          </motion.div>
        );
      })()}

      {/* Recruiter summary */}
      {analysis.recruiter_summary && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--accent-subtle)]"
        >
          <div className="flex items-center gap-2 mb-2">
            {(analysis as any).feedback_model === "claude-sonnet"
              ? <Sparkles className="w-4 h-4" style={{ color: "#a78bfa" }} />
              : <Brain className="w-4 h-4 text-[var(--accent-primary)]" />}
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">
              {(analysis as any).feedback_model === "claude-sonnet"
                ? "Claude Sonnet Recruiter Analysis"
                : "JobSynk AI Recruiter Analysis"}
            </span>
            {(analysis as any).feedback_model === "claude-sonnet" && (
              <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full"
                style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", color: "#a78bfa" }}>
                Pro · Claude Sonnet
              </span>
            )}
          </div>
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
            {analysis.recruiter_summary}
          </p>
        </motion.div>
      )}

      {/* JobSynk AI dimension reasoning */}
      {analysis.ai_reasoning && Object.values(analysis.ai_reasoning).some(Boolean) && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}
          className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4 h-4 text-[var(--accent-primary)]" />
            <span className="text-[13px] font-semibold text-[var(--text-primary)]">JobSynk AI Reasoning</span>
            <span className="ml-auto text-[10px] text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-full px-2 py-0.5">Neural Scorer</span>
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

      {/* Resume completeness banner */}
      {analysis.resume_completeness && analysis.resume_completeness.score < 80 && (() => {
        const failing = analysis.resume_completeness.checks.filter((c: { passed: boolean }) => !c.passed);
        return (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="p-4 rounded-2xl border border-orange-400/25 bg-orange-400/5 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0" />
              <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                Resume completeness: {analysis.resume_completeness.score}%
              </span>
              <span className="ml-auto text-[11px] text-orange-400/80">Fix these to score higher</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {failing.map((c: { id: string; label: string; tip?: string | null }) => (
                <div key={c.id} className="flex items-start gap-2">
                  <XCircle className="w-3.5 h-3.5 text-orange-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[12px] font-medium text-[var(--text-secondary)]">{c.label}</p>
                    {c.tip && <p className="text-[11px] text-[var(--text-muted)]">{c.tip}</p>}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        );
      })()}

      {/* Missing keywords quick-action card */}
      {analysis.missing_keywords && analysis.missing_keywords.length > 0 && (() => {
        const topMissing = [
          ...analysis.missing_keywords.filter((k: { keyword: string; importance: string }) => k.importance === "required"),
          ...analysis.missing_keywords.filter((k: { keyword: string; importance: string }) => k.importance === "preferred"),
          ...analysis.missing_keywords.filter((k: { keyword: string; importance: string }) => k.importance === "nice_to_have"),
        ].slice(0, 5);
        return (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className="p-5 rounded-2xl border border-amber-400/25 bg-amber-400/5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Quick wins — add these to your resume</span>
              </div>
              <button onClick={() => setTab("keywords")}
                className="flex items-center gap-1 text-[11px] text-amber-400 hover:text-amber-300 transition-colors">
                See all <ArrowRight className="w-3 h-3" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {topMissing.map((kw: { keyword: string; importance: string }) => (
                <span key={kw.keyword}
                  className={cn(
                    "px-3 py-1 rounded-full border text-[12px] font-medium",
                    kw.importance === "required"
                      ? "text-red-400 bg-red-400/10 border-red-400/25"
                      : kw.importance === "preferred"
                        ? "text-amber-400 bg-amber-400/10 border-amber-400/25"
                        : "text-blue-400 bg-blue-400/10 border-blue-400/25"
                  )}>
                  {kw.keyword}
                  {kw.importance === "required" && <span className="ml-1 opacity-60">·required</span>}
                </span>
              ))}
            </div>
            <p className="text-[11px] text-[var(--text-muted)]">
              Including these keywords (naturally, in context) will improve your ATS compatibility for this role.
            </p>
          </motion.div>
        );
      })()}

      {/* Outcome feedback card */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
        className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
        <div className="flex items-start gap-3 mb-4">
          <div className="w-8 h-8 rounded-xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <TrendingUp className="w-4 h-4 text-[var(--accent-primary)]" />
          </div>
          <div>
            <p className="text-[13px] font-semibold text-[var(--text-primary)]">Did you apply?</p>
            <p className="text-[12px] text-[var(--text-muted)] mt-0.5">
              Reporting your outcome helps calibrate the AI — the more real outcomes we collect, the more accurate scores become for everyone.
            </p>
          </div>
        </div>
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
            onClick={() => {
              setTab(t.id);
              if (t.id === "interview") setInterviewPrepEnabled(true);
            }}
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
                    <Brain className="w-2.5 h-2.5" /> JobSynk AI
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
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">JobSynk AI Keyword Analysis</span>
                <span className="ml-auto text-[10px] text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-full px-2 py-0.5">Powered by JobSynk AI</span>
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
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">JobSynk AI Improvement Suggestions</span>
                {(analysis as any).feedback_model === "claude-sonnet"
                  ? <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", color: "#a78bfa" }}>Claude Sonnet · Pro</span>
                  : <span className="ml-auto text-[10px] text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-full px-2 py-0.5">JobSynk AI</span>}
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

          {tab === "interview" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <MessageSquare className="w-4 h-4 text-[var(--accent-primary)]" />
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">Interview Prep</span>
                <span className="ml-auto text-[10px] text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-full px-2 py-0.5">JobSynk AI · Groq</span>
              </div>
              <p className="text-[13px] text-[var(--text-secondary)]">
                Questions generated from this specific job description — not generic templates.
              </p>

              {interviewPrepLoading && (
                <div className="flex items-center gap-3 py-10 justify-center text-[var(--text-muted)]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-[13px]">Generating interview questions from this JD…</span>
                </div>
              )}

              {interviewPrepError && (
                <div className="p-4 rounded-xl border border-red-400/20 bg-red-400/5 text-[13px] text-red-400">
                  Failed to generate questions — please try again.
                </div>
              )}

              {!interviewPrepLoading && !interviewPrep && !interviewPrepError && (
                <div className="flex flex-col items-center py-10 gap-4">
                  <MessageSquare className="w-8 h-8 text-[var(--text-muted)]" />
                  <p className="text-[13px] text-[var(--text-muted)] text-center max-w-sm">
                    JobSynk AI will generate 8 targeted interview questions from this job's requirements and tech stack.
                  </p>
                  <button
                    onClick={() => setInterviewPrepEnabled(true)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    Generate interview questions
                  </button>
                </div>
              )}

              {interviewPrep?.questions?.map((q, i) => (
                <div key={i}
                  className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "text-[10px] px-2 py-0.5 rounded-full border font-medium",
                      q.type === "technical"   ? "text-blue-400 bg-blue-400/10 border-blue-400/20" :
                      q.type === "behavioral"  ? "text-purple-400 bg-purple-400/10 border-purple-400/20" :
                                                 "text-amber-400 bg-amber-400/10 border-amber-400/20"
                    )}>
                      {q.type}
                    </span>
                    <span className="text-[11px] text-[var(--text-muted)]">Q{i + 1}</span>
                  </div>

                  <p className="text-[14px] font-semibold text-[var(--text-primary)] leading-snug">
                    {q.question}
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
                    <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
                      <p className="text-[10px] text-[var(--accent-primary)] font-semibold uppercase tracking-wider mb-1.5">Why they ask this</p>
                      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{q.why_asked}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-emerald-400/5 border border-emerald-400/15">
                      <p className="text-[10px] text-emerald-400 font-semibold uppercase tracking-wider mb-1.5">How to answer</p>
                      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{q.answer_framework}</p>
                    </div>
                    <div className="p-3 rounded-xl bg-red-400/5 border border-red-400/15">
                      <p className="text-[10px] text-red-400 font-semibold uppercase tracking-wider mb-1.5">Avoid this</p>
                      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{q.red_flag}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === "rewrite" && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-2">
                <Brain className="w-4 h-4 text-[var(--accent-primary)]" />
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">JobSynk AI Resume Rewriter</span>
                {(analysis as any).feedback_model === "claude-sonnet"
                  ? <span className="ml-auto text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", color: "#a78bfa" }}>Claude Sonnet · Pro</span>
                  : <span className="ml-auto text-[10px] text-[var(--text-muted)] border border-[var(--border-subtle)] rounded-full px-2 py-0.5">JobSynk AI</span>}
              </div>
              <p className="text-[13px] text-[var(--text-secondary)] mb-2">
                JobSynk AI-rewritten bullet points with stronger verbs, quantified metrics, and role-specific language.
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

        </motion.div>
      </AnimatePresence>

      {/* Human help nudge */}
      <div className="mt-2 px-4 py-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex items-center gap-3">
        <Users className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
        <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
          Want guidance from a real person?{" "}
          <a href="https://adplist.org" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-primary)] hover:underline">ADPList</a>
          {" · "}
          <a href="https://topmate.io/explore/category/tech" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-primary)] hover:underline">Topmate</a>
          {" · "}
          <a href="https://mentorcruise.com" target="_blank" rel="noopener noreferrer" className="text-[var(--accent-primary)] hover:underline">MentorCruise</a>
          {" "}have real mentors you can book directly.
        </p>
      </div>

      <FeedbackBanner feature="ats_analysis" analysisId={id} />
    </div>
  );
}
