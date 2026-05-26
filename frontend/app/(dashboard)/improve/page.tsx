"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { analysisApi } from "@/lib/api/analysis";
import { resumeApi } from "@/lib/api/resume";
import {
  Wand2,
  ArrowRight,
  CheckCircle2,
  Lightbulb,
  Target,
  Loader2,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type ImproveTab = "suggestions" | "rewrites" | "roadmap";

export default function ImprovePage() {
  const [tab, setTab] = useState<ImproveTab>("suggestions");

  const { data: analyses } = useQuery({
    queryKey: ["analyses"],
    queryFn: analysisApi.list,
  });

  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: resumeApi.list,
  });

  const latestAnalysis = analyses?.find((a) => a.status === "complete");
  const activeResume = resumes?.find((r) => r.is_active) ?? resumes?.[0];

  if (!latestAnalysis) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Wand2 className="w-12 h-12 text-[var(--text-muted)] mb-4" />
        <h2 className="text-[20px] font-bold text-[var(--text-primary)] mb-2">
          No analysis yet
        </h2>
        <p className="text-[14px] text-[var(--text-secondary)] mb-6 max-w-md">
          Run an ATS analysis first. The Improve page uses your analysis results to
          generate targeted resume improvements.
        </p>
        <Link
          href="/analysis"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium"
        >
          Run analysis <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    );
  }

  const tabs = [
    { id: "suggestions", label: "Improvements", icon: Lightbulb },
    { id: "rewrites", label: "Bullet Rewrites", icon: Wand2 },
    { id: "roadmap", label: "Action Roadmap", icon: Target },
  ] as const;

  const prioritized = [...(latestAnalysis.improvement_suggestions ?? [])].sort(
    (a, b) => {
      const order = { high: 0, medium: 1, low: 2 };
      return order[a.priority] - order[b.priority];
    }
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between"
      >
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">
            Resume Improvement
          </h1>
          <p className="text-[14px] text-[var(--text-secondary)]">
            AI-powered improvements based on your analysis of{" "}
            <span className="text-[var(--text-primary)] font-medium">
              {latestAnalysis.job?.parsed_data?.title ?? "your target role"}
            </span>
            {latestAnalysis.job?.company_name && ` at ${latestAnalysis.job.company_name}`}
          </p>
        </div>
        <Link
          href={`/analysis/${latestAnalysis.id}`}
          className="flex items-center gap-1 text-[12px] text-[var(--accent-primary)] hover:text-[var(--accent-hover)]"
        >
          View full analysis <ChevronRight className="w-3.5 h-3.5" />
        </Link>
      </motion.div>

      {/* Overall improvement summary */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-3 gap-4"
      >
        {[
          {
            label: "High priority fixes",
            value: prioritized.filter((s) => s.priority === "high").length,
            color: "text-red-400",
            bg: "bg-red-400/10 border-red-400/20",
          },
          {
            label: "Medium priority",
            value: prioritized.filter((s) => s.priority === "medium").length,
            color: "text-amber-400",
            bg: "bg-amber-400/10 border-amber-400/20",
          },
          {
            label: "Bullet rewrites",
            value: latestAnalysis.rewritten_bullets.length,
            color: "text-[var(--accent-hover)]",
            bg: "bg-[var(--accent-muted)] border-[var(--accent-primary)]/20",
          },
        ].map(({ label, value, color, bg }) => (
          <div
            key={label}
            className={`p-4 rounded-2xl border ${bg} text-center`}
          >
            <div className={`text-3xl font-bold ${color} mb-1`}>{value}</div>
            <div className="text-[11px] text-[var(--text-muted)]">{label}</div>
          </div>
        ))}
      </motion.div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-[13px] font-medium transition-all",
              tab === t.id
                ? "bg-[var(--bg-elevated)] text-[var(--text-primary)]"
                : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
            )}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          {tab === "suggestions" && (
            <div className="space-y-4">
              {prioritized.map((suggestion, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-overlay)] border border-[var(--border-subtle)] text-[var(--text-muted)]">
                          {suggestion.category}
                        </span>
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full border font-medium",
                          suggestion.priority === "high"
                            ? "text-red-400 bg-red-400/10 border-red-400/20"
                            : suggestion.priority === "medium"
                              ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                              : "text-blue-400 bg-blue-400/10 border-blue-400/20"
                        )}>
                          {suggestion.priority}
                        </span>
                      </div>
                      <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
                        {suggestion.title}
                      </h3>
                    </div>
                  </div>

                  <p className="text-[13px] text-[var(--text-secondary)] mb-3">
                    {suggestion.description}
                  </p>

                  <div className="flex items-start gap-2 p-3 rounded-lg bg-[var(--accent-subtle)] border border-[var(--accent-primary)]/10">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[var(--accent-primary)] mt-0.5 flex-shrink-0" />
                    <p className="text-[12px] text-[var(--text-secondary)]">
                      <span className="font-medium text-[var(--text-primary)]">Action: </span>
                      {suggestion.action}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {tab === "rewrites" && (
            <div className="space-y-5">
              <p className="text-[13px] text-[var(--text-secondary)]">
                Copy these AI-rewritten bullet points directly into your resume.
                They use stronger action verbs, quantifiable metrics, and role-specific language.
              </p>
              {latestAnalysis.rewritten_bullets.map((bullet, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.06 }}
                  className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden"
                >
                  <div className="px-5 py-2.5 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] flex items-center justify-between">
                    <span className="text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider">
                      {bullet.section}
                    </span>
                    {bullet.metrics_added && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-400">
                        metrics added
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-[var(--border-subtle)]">
                    <div className="p-5">
                      <div className="text-[10px] font-medium text-red-400 mb-2 uppercase tracking-wider">
                        Original
                      </div>
                      <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                        {bullet.original}
                      </p>
                    </div>
                    <div className="p-5">
                      <div className="text-[10px] font-medium text-emerald-400 mb-2 uppercase tracking-wider">
                        Improved
                      </div>
                      <p className="text-[13px] text-[var(--text-primary)] leading-relaxed font-medium">
                        {bullet.rewritten}
                      </p>
                    </div>
                  </div>

                  <div className="px-5 py-3 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                      <Lightbulb className="w-3 h-3 text-[var(--accent-primary)]" />
                      {bullet.improvement_reason}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {tab === "roadmap" && (
            <div className="space-y-4">
              <p className="text-[13px] text-[var(--text-secondary)] mb-6">
                Prioritized action plan to close your skill gaps and improve your ATS score.
              </p>

              {/* Skill acquisition roadmap */}
              {latestAnalysis.skill_gaps.length > 0 && (
                <div>
                  <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-4">
                    Skills to Acquire
                  </h3>
                  <div className="space-y-3">
                    {latestAnalysis.skill_gaps.map((gap, i) => (
                      <motion.div
                        key={gap.skill}
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.05 }}
                        className="flex items-start gap-4 p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                      >
                        <div className="w-6 h-6 rounded-full bg-[var(--accent-muted)] flex items-center justify-center flex-shrink-0 mt-0.5">
                          <span className="text-[10px] font-bold text-[var(--accent-hover)]">{i + 1}</span>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[13px] font-semibold text-[var(--text-primary)]">
                              {gap.skill}
                            </span>
                            <span className="text-[10px] text-[var(--text-muted)]">
                              ~{gap.time_to_learn}
                            </span>
                          </div>
                          <p className="text-[12px] text-[var(--text-secondary)] mb-2">
                            {gap.how_to_acquire}
                          </p>
                          {gap.resources.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {gap.resources.map((r) => (
                                <span
                                  key={r}
                                  className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-overlay)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
                                >
                                  {r}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full border flex-shrink-0",
                          gap.importance === "critical"
                            ? "text-red-400 bg-red-400/10 border-red-400/20"
                            : gap.importance === "important"
                              ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                              : "text-blue-400 bg-blue-400/10 border-blue-400/20"
                        )}>
                          {gap.importance}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
