"use client";

import { motion } from "framer-motion";
import type { ScoreBreakdown } from "@/lib/types";
import { getScoreColor, getScoreLabel } from "@/lib/utils";

interface ScoreBreakdownPanelProps {
  scores: ScoreBreakdown;
}

const scoreItems = [
  { key: "ats_score" as keyof ScoreBreakdown, label: "ATS Compatibility", description: "Format, sections, keyword density" },
  { key: "technical_fit_score" as keyof ScoreBreakdown, label: "Technical Fit", description: "Skill overlap with requirements" },
  { key: "semantic_match_score" as keyof ScoreBreakdown, label: "Semantic Match", description: "Meaning alignment via embeddings" },
  { key: "recruiter_impression_score" as keyof ScoreBreakdown, label: "Recruiter Impression", description: "Clarity, metrics, action verbs" },
  { key: "project_relevance_score" as keyof ScoreBreakdown, label: "Project Relevance", description: "Project tech vs. job requirements" },
];

export function ScoreBreakdownPanel({ scores }: ScoreBreakdownPanelProps) {
  return (
    <div className="space-y-3">
      {scoreItems.map((item, i) => {
        const score = scores[item.key] as number;
        const color = getScoreColor(score);
        const label = getScoreLabel(score);

        return (
          <motion.div
            key={item.key}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08, duration: 0.4 }}
            className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]"
          >
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-[13px] font-medium text-[var(--text-primary)]">
                  {item.label}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {item.description}
                </div>
              </div>
              <div className="text-right">
                <div
                  className="text-[20px] font-bold leading-none"
                  style={{ color }}
                >
                  {score}
                </div>
                <div className="text-[10px] font-medium" style={{ color }}>
                  {label}
                </div>
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-1.5 rounded-full bg-[var(--bg-overlay)] overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${score}%` }}
                transition={{ delay: i * 0.08 + 0.3, duration: 0.8, ease: [0.25, 0.4, 0.25, 1] }}
                className="h-full rounded-full"
                style={{
                  background: color,
                  boxShadow: `0 0 8px ${color}60`,
                }}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
