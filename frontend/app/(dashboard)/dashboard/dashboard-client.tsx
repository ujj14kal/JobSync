"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  ArrowRight,
  BarChart2,
  FileText,
  Sparkles,
  Users,
  TrendingUp,
  Upload,
  Plus,
  Clock,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { analysisApi } from "@/lib/api/analysis";
import { resumeApi } from "@/lib/api/resume";
import { formatRelativeTime, getScoreColor } from "@/lib/utils";
import type { User as SupabaseUser } from "@supabase/supabase-js";

const quickActions = [
  {
    href: "/analysis",
    icon: BarChart2,
    label: "New ATS Analysis",
    description: "Match resume to a job",
    accent: "indigo",
  },
  {
    href: "/resume",
    icon: Upload,
    label: "Upload Resume",
    description: "Add or update your resume",
    accent: "violet",
  },
  {
    href: "/mentors",
    icon: Users,
    label: "Find Mentors",
    description: "Get matched with experts",
    accent: "amber",
  },
  {
    href: "/insights",
    icon: TrendingUp,
    label: "Career Insights",
    description: "Market trends & salary data",
    accent: "emerald",
  },
];

const accentBg: Record<string, string> = {
  indigo: "bg-indigo-400/10 border-indigo-400/20",
  violet: "bg-violet-400/10 border-violet-400/20",
  amber: "bg-amber-400/10 border-amber-400/20",
  emerald: "bg-emerald-400/10 border-emerald-400/20",
};

const accentIcon: Record<string, string> = {
  indigo: "text-indigo-400",
  violet: "text-violet-400",
  amber: "text-amber-400",
  emerald: "text-emerald-400",
};

export function DashboardClient({ user }: { user: SupabaseUser | null }) {
  const name = user?.user_metadata?.full_name?.split(" ")[0] ?? "there";

  const { data: analyses, isLoading: analysesLoading } = useQuery({
    queryKey: ["analyses"],
    queryFn: analysisApi.list,
  });

  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: resumeApi.list,
  });

  const latestAnalysis = analyses?.[0];
  const hasResume = (resumes?.length ?? 0) > 0;

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">
          Good morning, {name} 👋
        </h1>
        <p className="text-[14px] text-[var(--text-secondary)]">
          {hasResume
            ? "Ready to analyze another job? Pick a quick action below."
            : "Let's start by uploading your resume."}
        </p>
      </motion.div>

      {/* Onboarding banner if no resume */}
      {!hasResume && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-5 rounded-2xl border border-[var(--accent-primary)]/30 bg-[var(--accent-subtle)] flex items-center justify-between gap-4"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary)] flex items-center justify-center flex-shrink-0">
              <FileText className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-[14px] font-semibold text-[var(--text-primary)]">
                Upload your resume to get started
              </div>
              <div className="text-[12px] text-[var(--text-secondary)]">
                PDF or DOCX · Parsed instantly · Stays private
              </div>
            </div>
          </div>
          <Link
            href="/resume"
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
          >
            Upload now <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </motion.div>
      )}

      {/* Quick Actions */}
      <div>
        <h2 className="text-[13px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {quickActions.map((action, i) => (
            <motion.div
              key={action.href}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * i }}
            >
              <Link
                href={action.href}
                className={`group flex flex-col p-5 rounded-2xl border ${accentBg[action.accent]} hover:scale-[1.01] transition-all duration-200 h-full`}
              >
                <action.icon className={`w-5 h-5 ${accentIcon[action.accent]} mb-3`} />
                <div className="text-[13px] font-semibold text-[var(--text-primary)] mb-1">
                  {action.label}
                </div>
                <div className="text-[12px] text-[var(--text-secondary)]">
                  {action.description}
                </div>
                <div className="mt-auto pt-3 flex items-center gap-1 text-[12px] font-medium text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors">
                  Go <ArrowRight className="w-3 h-3" />
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Recent Analyses */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[13px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Recent Analyses
          </h2>
          <Link
            href="/analysis"
            className="text-[12px] text-[var(--accent-primary)] hover:text-[var(--accent-hover)] flex items-center gap-1"
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {analysesLoading ? (
          <div className="space-y-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-20 rounded-2xl animate-shimmer" />
            ))}
          </div>
        ) : analyses && analyses.length > 0 ? (
          <div className="space-y-3">
            {analyses.slice(0, 5).map((analysis) => (
              <motion.div
                key={analysis.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Link
                  href={`/analysis/${analysis.id}`}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] transition-all group"
                >
                  {/* Score ring */}
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center text-[16px] font-bold flex-shrink-0"
                    style={{
                      background: `${getScoreColor(analysis.scores.overall_score)}18`,
                      color: getScoreColor(analysis.scores.overall_score),
                      border: `1px solid ${getScoreColor(analysis.scores.overall_score)}30`,
                    }}
                  >
                    {analysis.scores.overall_score}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
                      {analysis.job?.parsed_data?.title ?? "Job Analysis"} ·{" "}
                      {analysis.job?.company_name ?? ""}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-[12px] text-[var(--text-muted)] flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelativeTime(analysis.created_at)}
                      </span>
                      <StatusBadge status={analysis.status} />
                    </div>
                  </div>

                  <ArrowRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors flex-shrink-0" />
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-[var(--border-subtle)] border-dashed">
            <BarChart2 className="w-8 h-8 text-[var(--text-muted)] mb-3" />
            <p className="text-[14px] text-[var(--text-secondary)] mb-1">
              No analyses yet
            </p>
            <p className="text-[12px] text-[var(--text-muted)] mb-4">
              Run your first ATS analysis to see results here
            </p>
            <Link
              href="/analysis"
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New analysis
            </Link>
          </div>
        )}
      </div>

      {/* Latest score summary if available */}
      {latestAnalysis && latestAnalysis.status === "complete" && (
        <div>
          <h2 className="text-[13px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-4">
            Latest Score Breakdown
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: "Overall", score: latestAnalysis.scores.overall_score },
              { label: "ATS Compat.", score: latestAnalysis.scores.ats_score },
              { label: "Tech Fit", score: latestAnalysis.scores.technical_fit_score },
              { label: "Semantic", score: latestAnalysis.scores.semantic_match_score },
              { label: "Recruiter", score: latestAnalysis.scores.recruiter_impression_score },
            ].map(({ label, score }) => (
              <div
                key={label}
                className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-center"
              >
                <div
                  className="text-2xl font-bold mb-1"
                  style={{ color: getScoreColor(score) }}
                >
                  {score}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    complete: {
      label: "Complete",
      className: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
    },
    processing: {
      label: "Processing…",
      className: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    },
    pending: {
      label: "Pending",
      className: "text-[var(--text-muted)] bg-[var(--bg-overlay)] border-[var(--border-default)]",
    },
    failed: {
      label: "Failed",
      className: "text-red-400 bg-red-400/10 border-red-400/20",
    },
  };
  const cfg = config[status] ?? config.pending;
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cfg.className}`}>
      {cfg.label}
    </span>
  );
}
