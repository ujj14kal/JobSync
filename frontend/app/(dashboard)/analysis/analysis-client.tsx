"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { BarChart2, Clock, ArrowRight, Brain } from "lucide-react";
import { JobInputForm } from "@/components/analysis/job-input-form";
import { useQuery } from "@tanstack/react-query";
import { analysisApi } from "@/lib/api/analysis";
import { formatRelativeTime, getScoreColor } from "@/lib/utils";
import type { Analysis } from "@/lib/types";
import Link from "next/link";

export function AnalysisClient() {
  const router = useRouter();
  const [showHistory, setShowHistory] = useState(false);

  const { data: analyses } = useQuery({
    queryKey: ["analyses"],
    queryFn: analysisApi.list,
  });

  function handleAnalysisStarted(analysis: Analysis) {
    // Poll and redirect when ready
    router.push(`/analysis/${analysis.id}`);
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">
            ATS Analysis
          </h1>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-[var(--accent-muted)] border-[var(--accent-primary)]/30 text-[var(--accent-hover)]">
            <Brain className="w-2.5 h-2.5" />
            Powered by JobSync AI
          </span>
        </div>
        <p className="text-[14px] text-[var(--text-secondary)]">
          Paste a job URL and let JobSync AI extract every detail and score your resume automatically.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Job input form */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-3 p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]"
        >
          <h2 className="text-[16px] font-semibold text-[var(--text-primary)] mb-5">
            Target Job
          </h2>
          <JobInputForm onAnalysisStarted={handleAnalysisStarted} />
        </motion.div>

        {/* Info panel */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="lg:col-span-2 space-y-4"
        >
          {/* What you'll get */}
          <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-3">
              What you'll get
            </h3>
            <ul className="space-y-2">
              {[
                "5 JobSync AI dimension scores",
                "Missing keyword list",
                "Skill gap analysis",
                "JobSync AI recruiter-style feedback",
                "JobSync AI bullet point rewrites",
                "AI-matched mentor recommendations",
              ].map((item) => (
                <li
                  key={item}
                  className="flex items-center gap-2 text-[12px] text-[var(--text-secondary)]"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          {/* How it works */}
          <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-3">
              How it works
            </h3>
            <div className="space-y-3">
              {[
                { step: "1", text: "Paste the job URL — JobSync AI extracts everything automatically" },
                { step: "2", text: "JobSync AI parses requirements, skills, and keywords from the page" },
                { step: "3", text: "Semantic embeddings compare your resume to the job description" },
                { step: "4", text: "JobSync AI generates detailed recruiter feedback and rewrites" },
              ].map(({ step, text }) => (
                <div key={step} className="flex items-start gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-[var(--accent-muted)] flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-[10px] font-bold text-[var(--accent-hover)]">{step}</span>
                  </div>
                  <p className="text-[12px] text-[var(--text-secondary)]">{text}</p>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>

      {/* Recent analyses */}
      {analyses && analyses.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-[13px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Analysis History
            </h2>
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="text-[12px] text-[var(--accent-primary)]"
            >
              {showHistory ? "Hide" : `Show all (${analyses.length})`}
            </button>
          </div>

          <div className="space-y-2">
            {(showHistory ? analyses : analyses.slice(0, 3)).map((analysis) => (
              <Link
                key={analysis.id}
                href={`/analysis/${analysis.id}`}
                className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] transition-all group"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-[15px] font-bold flex-shrink-0"
                  style={{
                    color: getScoreColor(analysis.scores.overall_score),
                    background: `${getScoreColor(analysis.scores.overall_score)}15`,
                    border: `1px solid ${getScoreColor(analysis.scores.overall_score)}25`,
                  }}
                >
                  {analysis.scores.overall_score}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                    {analysis.job?.parsed_data?.title ?? "Job Analysis"}{" "}
                    {analysis.job?.company_name && `· ${analysis.job.company_name}`}
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-[var(--text-muted)]">
                    <Clock className="w-3 h-3" />
                    {formatRelativeTime(analysis.created_at)}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
