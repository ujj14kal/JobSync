"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Building2, Hash, FileText, Loader2, AlertCircle } from "lucide-react";
import { analysisApi } from "@/lib/api/analysis";
import { resumeApi } from "@/lib/api/resume";
import { useQuery } from "@tanstack/react-query";
import type { Analysis, JobDescription } from "@/lib/types";
import { toast } from "sonner";

interface JobInputFormProps {
  onAnalysisStarted: (analysis: Analysis) => void;
}

export function JobInputForm({ onAnalysisStarted }: JobInputFormProps) {
  const [company, setCompany] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [jobId, setJobId] = useState("");
  const [step, setStep] = useState<"form" | "searching" | "confirm" | "analyzing">("form");
  const [foundJob, setFoundJob] = useState<JobDescription | null>(null);
  const [searchProgress, setSearchProgress] = useState(0);

  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: resumeApi.list,
  });

  const activeResume = resumes?.find((r) => r.is_active) ?? resumes?.[0];

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

    // Simulate progress while waiting
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
    setStep("analyzing");
    try {
      const analysis = await analysisApi.create({
        resume_id: activeResume.id,
        job_id: foundJob.id,
      });
      onAnalysisStarted(analysis);
    } catch (err) {
      toast.error((err as Error).message);
      setStep("confirm");
    }
  }

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

  if (step === "confirm" && foundJob) {
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
            <div className="text-[11px] text-[var(--text-muted)]">
              Active resume
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setStep("form")}
            className="flex-1 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[13px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
          >
            Search again
          </button>
          <button
            onClick={handleAnalyze}
            className="flex-1 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
          >
            Run ATS Analysis
          </button>
        </div>
      </motion.div>
    );
  }

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

  // Default: form
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
        disabled={!activeResume || (!company)}
        className="w-full py-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[14px] font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        <Search className="w-4 h-4" />
        Find & analyze job
      </button>
    </form>
  );
}
