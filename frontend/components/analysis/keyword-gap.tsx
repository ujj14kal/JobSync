"use client";

import { motion } from "framer-motion";
import type { MissingKeyword, SkillGap } from "@/lib/types";
import { AlertCircle, BookOpen, Zap } from "lucide-react";

interface KeywordGapProps {
  keywords: MissingKeyword[];
  skillGaps: SkillGap[];
}

const importanceConfig = {
  required: {
    label: "Required",
    className: "text-red-400 bg-red-400/10 border-red-400/20",
    dot: "bg-red-400",
  },
  preferred: {
    label: "Preferred",
    className: "text-amber-400 bg-amber-400/10 border-amber-400/20",
    dot: "bg-amber-400",
  },
  nice_to_have: {
    label: "Nice to have",
    className: "text-blue-400 bg-blue-400/10 border-blue-400/20",
    dot: "bg-blue-400",
  },
};

const gapImportanceConfig = {
  critical: { color: "text-red-400", bg: "bg-red-400/10 border-red-400/20" },
  important: { color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20" },
  nice_to_have: { color: "text-blue-400", bg: "bg-blue-400/10 border-blue-400/20" },
};

export function KeywordGapPanel({ keywords, skillGaps }: KeywordGapProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Missing Keywords */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <AlertCircle className="w-4 h-4 text-amber-400" />
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
            Missing Keywords ({keywords.length})
          </h3>
        </div>

        <div className="space-y-2">
          {keywords.length === 0 ? (
            <p className="text-[13px] text-[var(--text-muted)] py-4">
              No missing keywords found. Great job! ✓
            </p>
          ) : (
            keywords.map((kw, i) => {
              const cfg = importanceConfig[kw.importance];
              return (
                <motion.div
                  key={kw.keyword}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">
                      {kw.keyword}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${cfg.className}`}>
                      {cfg.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)]">
                    {kw.context}
                  </p>
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Skill Gaps */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <BookOpen className="w-4 h-4 text-violet-400" />
          <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">
            Skill Gaps ({skillGaps.length})
          </h3>
        </div>

        <div className="space-y-2">
          {skillGaps.length === 0 ? (
            <p className="text-[13px] text-[var(--text-muted)] py-4">
              No critical skill gaps found! ✓
            </p>
          ) : (
            skillGaps.map((gap, i) => {
              const cfg = gapImportanceConfig[gap.importance];
              return (
                <motion.div
                  key={gap.skill}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[13px] font-medium text-[var(--text-primary)]">
                      {gap.skill}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-[var(--text-muted)]">
                        {gap.time_to_learn}
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${gap.importance === 'critical' ? 'text-red-400 bg-red-400/10 border-red-400/20' : gap.importance === 'important' ? 'text-amber-400 bg-amber-400/10 border-amber-400/20' : 'text-blue-400 bg-blue-400/10 border-blue-400/20'}`}>
                        {gap.importance}
                      </span>
                    </div>
                  </div>
                  <p className="text-[11px] text-[var(--text-secondary)] mb-2">
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
                </motion.div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
