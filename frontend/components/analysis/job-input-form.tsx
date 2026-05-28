"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Building2, Hash, FileText,
  Loader2, AlertCircle, Clock, RefreshCw,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { analysisApi } from "@/lib/api/analysis";
import { resumeApi } from "@/lib/api/resume";
import type { Analysis, JobDescription } from "@/lib/types";
import { toast } from "sonner";
import { ServiceStatusBadge } from "./service-status-badge";

interface JobInputFormProps {
  onAnalysisStarted: (analysis: Analysis) => void;
}

type Step = "form" | "searching" | "confirm" | "analyzing" | "at_capacity";

// How long (seconds) to wait before offering a "Try again" button
const CAPACITY_RETRY_AFTER = 30;

export function JobInputForm({ onAnalysisStarted }: JobInputFormProps) {
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobId, setJobId] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [foundJob, setFoundJob] = useState<JobDescription | null>(null);
  const [searchProgress, setSearchProgress] = useState(0);

  // Countdown state for "at_capacity" screen
  const [retryCountdown, setRetryCountdown] = useState(CAPACITY_RETRY_AFTER);
  const [capacityInfo, setCapacityInfo] = useState<{ active: number; max: number } | null>(null);

  // Live service status (polled every 10 s)
  const { data: serviceStatus } = useQuery({
    queryKey: ["service-status"],
    queryFn: analysisApi.getStatus,
    refetchInterval: 10_000,
    staleTime: 8_000,
    retry: false,
  });

  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: resumeApi.list,
  });

  const activeResume = resumes?.find((r) => r.is_active) ?? resumes?.[0];

  // Countdown timer for the "at_capacity" step
  useEffect(() => {
    if (step !== "at_capacity") return;
    setRetryCountdown(CAPACITY_RETRY_AFTER);
    const timer = setInterval(() => {
      setRetryCountdown((n) => {
        if (n <= 1) { clearInterval(timer); return 0; }
        return n - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [step]);

  // Auto-return to confirm when service clears capacity AND countdown ended
  useEffect(() => {
    if (step === "at_capacity" && retryCountdown === 0 && serviceStatus && !serviceStatus.at_capacity) {
      setStep("confirm");
    }
  }, [step, retryCountdown, serviceStatus]);

  // ── Handlers ────────────────────────────────────────────────────────────────

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!company || (!jobTitle && !jobId)) {
      toast.error("Please enter a company name and either a job title or job ID.");
      return;
    }
    if (!activeResume) {
      toast.error("Please upload a resume first.");
      return;
    }

    setStep("searching");
    setSearchProgress(0);

    const interval = setInterval(() => {
      setSearchProgress((p) => Math.min(p + 8, 85));
    }, 400);

    try {
      const job = await analysisApi.searchJob({
        company_name: company,
        job_title: jobTitle || undefined,
        job_id: jobId || undefined,
      });
      clearInterval(interval);
      setSearchProgress(100);
      setFoundJob(job);
      setStep("confirm");
    } catch (err) {
      clearInterval(interval);
      toast.error((err as Error).message || "Could not find job listing. Try a different search.");
      setStep("form");
    }
  }

  async function handleAnalyze() {
    if (!foundJob || !activeResume) return;

    // Soft block: if the live status already says "at capacity", don't even try
    if (serviceStatus?.at_capacity) {
      setCapacityInfo({
        active: serviceStatus.active_analyses,
        max: serviceStatus.max_concurrent,
      });
      setStep("at_capacity");
      return;
    }

    setStep("analyzing");
    try {
      const analysis = await analysisApi.create({
        resume_id: activeResume.id,
        job_id: foundJob.id,
      });
      onAnalysisStarted(analysis);
    } catch (err: any) {
      // HTTP 503 = at capacity
      if (err.response?.status === 503) {
        const detail = err.response.data?.detail ?? {};
        setCapacityInfo({
          active: detail.active_analyses ?? serviceStatus?.active_analyses ?? "?",
          max: detail.max_concurrent ?? serviceStatus?.max_concurrent ?? "?",
        });
        setStep("at_capacity");
        return;
      }
      // HTTP 429 = daily quota
      if (err.response?.status === 429) {
        toast.error(err.response.data?.detail ?? "Daily analysis limit reached. Try again tomorrow.");
        setStep("confirm");
        return;
      }
      toast.error((err as Error).message || "Something went wrong.");
      setStep("confirm");
    }
  }

  // ── Step: searching ──────────────────────────────────────────────────────────

  if (step === "searching") {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-20"
      >
        <div className="relative w-16 h-16 mb-6">
          <div className="absolute inset-0 rounded-full border-2 border-[var(--accent-primary)]/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--accent-primary)] animate-spin" />
          <div className="absolute inset-3 rounded-full bg-[var(--accent-muted)] flex items-center justify-center">
            <Search className="w-5 h-5 text-[var(--accent-primary)]" />
          </div>
        </div>
        <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-2">
          Searching for job listing…
        </h3>
        <p className="text-[13px] text-[var(--text-secondary)] mb-6 text-center max-w-xs">
          Scanning {company}'s careers page and job boards for "{jobTitle || jobId}"
        </p>
        <div className="w-64 h-1.5 rounded-full bg-[var(--bg-overlay)] overflow-hidden">
          <motion.div
            animate={{ width: `${searchProgress}%` }}
            transition={{ duration: 0.4 }}
            className="h-full rounded-full bg-[var(--accent-primary)]"
          />
        </div>
        <p className="text-[11px] text-[var(--text-muted)] mt-2">{searchProgress}%</p>
      </motion.div>
    );
  }

  // ── Step: at_capacity ────────────────────────────────────────────────────────

  if (step === "at_capacity") {
    const canRetry = retryCountdown === 0;
    const currentStatus = serviceStatus;

    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center py-16 text-center"
      >
        {/* Icon */}
        <div className="relative w-16 h-16 mb-5">
          <div className="absolute inset-0 rounded-full border-2 border-red-400/20 bg-red-400/5" />
          <div className="absolute inset-3 flex items-center justify-center">
            <Clock className="w-6 h-6 text-red-400" />
          </div>
        </div>

        <h3 className="text-[17px] font-semibold text-[var(--text-primary)] mb-2">
          Service is at capacity
        </h3>
        <p className="text-[13px] text-[var(--text-secondary)] mb-1 max-w-sm">
          {capacityInfo
            ? `${capacityInfo.active} of ${capacityInfo.max} analysis slots are currently in use.`
            : "All analysis slots are currently occupied."}
        </p>
        <p className="text-[12px] text-[var(--text-muted)] mb-6 max-w-xs">
          Slots free up as soon as an active analysis finishes — usually within 30–60 seconds.
        </p>

        {/* Live status */}
        {currentStatus && (
          <div className="mb-6 w-full max-w-xs">
            <ServiceStatusBadge variant="detailed" className="w-full" />
          </div>
        )}

        {/* Countdown / retry */}
        <AnimatePresence mode="wait">
          {!canRetry ? (
            <motion.div
              key="countdown"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center gap-2"
            >
              <div className="text-[13px] text-[var(--text-secondary)]">
                Try again in{" "}
                <span className="font-mono font-bold text-[var(--text-primary)]">
                  {retryCountdown}s
                </span>
              </div>
              {/* Shrinking bar */}
              <div className="w-48 h-1 rounded-full bg-[var(--bg-overlay)] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-red-400"
                  initial={{ width: "100%" }}
                  animate={{ width: "0%" }}
                  transition={{ duration: CAPACITY_RETRY_AFTER, ease: "linear" }}
                />
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="retry-btn"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center gap-3"
            >
              {currentStatus?.at_capacity ? (
                <p className="text-[12px] text-amber-400">
                  Still at capacity — slots may free up shortly.
                </p>
              ) : (
                <p className="text-[12px] text-emerald-400">
                  A slot is available! You can try now.
                </p>
              )}
              <button
                onClick={() => { setStep("confirm"); }}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Try again
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setStep("form")}
          className="mt-5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] underline transition-colors"
        >
          Start a new search instead
        </button>
      </motion.div>
    );
  }

  // ── Step: confirm ────────────────────────────────────────────────────────────

  if (step === "confirm" && foundJob) {
    const atCapacity = serviceStatus?.at_capacity ?? false;

    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        <div className="flex items-center gap-2 mb-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400" />
          <span className="text-[13px] text-emerald-400 font-medium">Job found!</span>
        </div>

        <div className="p-5 rounded-2xl border border-emerald-400/20 bg-emerald-400/5">
          <div className="text-[16px] font-bold text-[var(--text-primary)] mb-1">
            {foundJob.parsed_data.title}
          </div>
          <div className="text-[14px] text-[var(--text-secondary)] mb-3">
            {foundJob.company_name}
            {foundJob.parsed_data.location && ` · ${foundJob.parsed_data.location}`}
            {foundJob.parsed_data.job_type && ` · ${foundJob.parsed_data.job_type}`}
          </div>

          {foundJob.parsed_data.required_skills.length > 0 && (
            <div className="mb-3">
              <div className="text-[11px] text-[var(--text-muted)] mb-2 uppercase tracking-wider font-medium">
                Required Skills
              </div>
              <div className="flex flex-wrap gap-1.5">
                {foundJob.parsed_data.required_skills.slice(0, 12).map((s) => (
                  <span
                    key={s}
                    className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-overlay)] text-[var(--text-secondary)] border border-[var(--border-subtle)]"
                  >
                    {s}
                  </span>
                ))}
                {foundJob.parsed_data.required_skills.length > 12 && (
                  <span className="text-[11px] text-[var(--text-muted)]">
                    +{foundJob.parsed_data.required_skills.length - 12} more
                  </span>
                )}
              </div>
            </div>
          )}

          {foundJob.source_url && (
            <a
              href={foundJob.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[var(--accent-primary)] hover:text-[var(--accent-hover)] underline"
            >
              View original listing ↗
            </a>
          )}
        </div>

        <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
          <FileText className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0" />
          <div>
            <div className="text-[12px] font-medium text-[var(--text-primary)]">
              Analyzing: {activeResume?.file_name}
            </div>
            <div className="text-[11px] text-[var(--text-muted)]">Active resume</div>
          </div>
        </div>

        {/* Capacity warning (only when near/at limit) */}
        {serviceStatus && serviceStatus.utilization_pct >= 60 && (
          <ServiceStatusBadge variant="detailed" />
        )}

        <div className="flex gap-3">
          <button
            onClick={() => setStep("form")}
            className="flex-1 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Search again
          </button>
          <button
            onClick={handleAnalyze}
            disabled={atCapacity}
            title={atCapacity ? "Service is at capacity — please wait a moment" : undefined}
            className="flex-1 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {atCapacity ? "Service busy…" : "Run ATS Analysis"}
          </button>
        </div>

        {atCapacity && (
          <p className="text-[11px] text-[var(--text-muted)] text-center">
            All {serviceStatus?.max_concurrent ?? 0} slots are occupied. The button will enable automatically when one frees up.
          </p>
        )}
      </motion.div>
    );
  }

  // ── Step: analyzing ──────────────────────────────────────────────────────────

  if (step === "analyzing") {
    const stages = [
      "Extracting resume sections…",
      "Generating semantic embeddings…",
      "Computing cosine similarity…",
      "Running ATS keyword analysis…",
      "Generating recruiter feedback…",
      "Identifying skill gaps…",
      "Composing improvement suggestions…",
    ];

    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-20"
      >
        <div className="relative w-16 h-16 mb-6">
          <div className="absolute inset-0 rounded-full border-2 border-[var(--accent-primary)]/20" />
          <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[var(--accent-primary)] animate-spin" />
          <div className="absolute inset-3 rounded-full bg-[var(--accent-muted)] flex items-center justify-center">
            <Loader2 className="w-5 h-5 text-[var(--accent-primary)] animate-spin" />
          </div>
        </div>
        <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-2">
          Running ATS analysis…
        </h3>
        <div className="space-y-2 mt-4 w-64">
          {stages.map((stage, i) => (
            <motion.div
              key={stage}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.4 }}
              className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: i * 0.4 + 0.1 }}
                className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] flex-shrink-0"
              />
              {stage}
            </motion.div>
          ))}
        </div>
      </motion.div>
    );
  }

  // ── Step: form (default) ─────────────────────────────────────────────────────

  return (
    <form onSubmit={handleSearch} className="space-y-5">
      {!activeResume && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-amber-400/5 border border-amber-400/20">
          <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0" />
          <span className="text-[12px] text-amber-400">
            No resume found. Please{" "}
            <a href="/resume" className="underline font-medium">
              upload one first
            </a>
            .
          </span>
        </div>
      )}

      {/* Live capacity badge — always visible on the form step */}
      <ServiceStatusBadge variant="full" className="w-fit" />

      {/* Company */}
      <div>
        <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
          Company name <span className="text-[var(--error)]">*</span>
        </label>
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            placeholder="e.g. Google, Stripe, Meta"
            required
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
          />
        </div>
      </div>

      {/* Job title */}
      <div>
        <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
          Job title
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            placeholder="e.g. Software Engineer L4, Product Manager"
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
          />
        </div>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-[var(--border-subtle)]" />
        </div>
        <div className="relative flex justify-center">
          <span className="px-3 text-[11px] text-[var(--text-muted)] bg-[var(--bg-surface)]">
            or use job ID
          </span>
        </div>
      </div>

      {/* Job ID */}
      <div>
        <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
          Job ID{" "}
          <span className="text-[var(--text-muted)] font-normal">(from URL or listing)</span>
        </label>
        <div className="relative">
          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            type="text"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            placeholder="e.g. 123456789"
            className="w-full pl-10 pr-4 py-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
          />
        </div>
      </div>

      <button
        type="submit"
        disabled={!activeResume || !company}
        className="w-full py-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[14px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Search className="w-4 h-4" />
        Find &amp; analyze job
      </button>
    </form>
  );
}
