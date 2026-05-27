"use client";

import { motion } from "framer-motion";
import { Target, TrendingUp, GitBranch, Users, Zap, Award } from "lucide-react";
import { ScoreRing } from "@/components/ui/ScoreDonut";
import ScoreDonut from "@/components/ui/ScoreDonut";

interface IntelligencePanelProps {
  analysis: {
    overall_score?: number;
    ats_score?: number;
    technical_fit_score?: number;
    semantic_match_score?: number;
    recruiter_impression_score?: number;
    project_relevance_score?: number;
    interview_probability?: number;
    recruiter_fit_tier?: string;
    confidence_level?: string;
    skill_gap_score?: number;
    cohort_percentile?: number;
    fit_explanation?: string;
    positive_signals?: Array<{ factor: string; description: string; impact: string }>;
    negative_signals?: Array<{ factor: string; description: string; impact: string }>;
  };
}

const TIER_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  top_10:      { label: "Top 10% Candidate",   color: "#10b981", bg: "rgba(16,185,129,0.1)" },
  competitive: { label: "Competitive Profile",  color: "#3b82f6", bg: "rgba(59,130,246,0.1)" },
  borderline:  { label: "Borderline Fit",       color: "#f59e0b", bg: "rgba(245,158,11,0.1)" },
  unlikely:    { label: "Needs Improvement",    color: "#ef4444", bg: "rgba(239,68,68,0.1)" },
};

export default function IntelligencePanel({ analysis }: IntelligencePanelProps) {
  const overall = analysis.overall_score ?? 0;
  const interviewProb = analysis.interview_probability ?? 0;
  const tier = analysis.recruiter_fit_tier ?? "borderline";
  const tierConfig = TIER_CONFIG[tier] ?? TIER_CONFIG.borderline;
  const cohortPct = analysis.cohort_percentile ?? 50;
  const skillGap = analysis.skill_gap_score ?? 0;

  const segments = [
    { label: "ATS",       shortLabel: "ATS",       value: analysis.ats_score ?? 0       },
    { label: "Technical", shortLabel: "Technical", value: analysis.technical_fit_score ?? 0 },
    { label: "Semantic",  shortLabel: "Semantic",  value: analysis.semantic_match_score ?? 0 },
    { label: "Recruiter", shortLabel: "Recruiter", value: analysis.recruiter_impression_score ?? 0 },
    { label: "Projects",  shortLabel: "Projects",  value: analysis.project_relevance_score ?? 0 },
  ];

  const probColor =
    interviewProb >= 65 ? "#10b981" :
    interviewProb >= 45 ? "#3b82f6" :
    interviewProb >= 30 ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex flex-col gap-6">
      {/* ── Top row: Donut + Interview prob ── */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* Score breakdown donut */}
        <motion.div
          className="p-6 rounded-2xl"
          style={{ background: "rgba(255,255,255,0.025)", border: "1px solid rgba(255,255,255,0.08)" }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="text-sm font-semibold text-primary mb-5 flex items-center gap-2">
            <Award size={15} className="text-blue-400" />
            Score Breakdown
          </div>
          <ScoreDonut
            segments={segments}
            overallScore={overall}
            size={200}
            strokeWidth={15}
            showLegend
            animationDelay={100}
          />
        </motion.div>

        {/* Interview probability + signals */}
        <div className="flex flex-col gap-4">
          {/* Probability card */}
          <motion.div
            className="p-5 rounded-2xl flex-1"
            style={{
              background: `${probColor}08`,
              border: `1px solid ${probColor}20`,
            }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.5 }}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-primary">
                <Target size={15} style={{ color: probColor }} />
                Interview Probability
              </div>
              <div
                className="px-2.5 py-1 rounded-full text-xs font-bold"
                style={{ background: tierConfig.bg, color: tierConfig.color, border: `1px solid ${tierConfig.color}25` }}
              >
                {tierConfig.label}
              </div>
            </div>

            <div className="flex items-end gap-2 mb-3">
              <span className="text-5xl font-bold tabular-nums" style={{ color: probColor }}>
                {Math.round(interviewProb)}
              </span>
              <span className="text-2xl font-bold mb-1" style={{ color: probColor }}>%</span>
              <span className="text-xs text-muted mb-1.5 ml-1">{analysis.confidence_level} confidence</span>
            </div>

            <div className="h-2.5 rounded-full overflow-hidden mb-3" style={{ background: "rgba(255,255,255,0.06)" }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${probColor}88, ${probColor})` }}
                initial={{ width: 0 }}
                animate={{ width: `${interviewProb}%` }}
                transition={{ delay: 0.3, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
              />
            </div>

            {analysis.fit_explanation && (
              <p className="text-xs text-secondary leading-relaxed">{analysis.fit_explanation}</p>
            )}
          </motion.div>

          {/* Cohort + skill gap */}
          <div className="grid grid-cols-2 gap-3">
            <motion.div
              className="p-4 rounded-xl"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
            >
              <div className="flex items-center gap-1.5 text-xs text-secondary mb-2">
                <Users size={11} />
                Cohort Rank
              </div>
              <div className="text-2xl font-bold tabular-nums" style={{ color: "#8b5cf6" }}>
                {cohortPct > 0 ? `${Math.round(100 - cohortPct)}%` : "—"}
              </div>
              <div className="text-[10px] text-muted mt-0.5">
                {cohortPct > 0 ? `Better than ${Math.round(cohortPct)}% of applicants` : "Not enough data yet"}
              </div>
            </motion.div>

            <motion.div
              className="p-4 rounded-xl"
              style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25, duration: 0.4 }}
            >
              <div className="flex items-center gap-1.5 text-xs text-secondary mb-2">
                <GitBranch size={11} />
                Skill Gap
              </div>
              <div
                className="text-2xl font-bold tabular-nums"
                style={{ color: skillGap < 30 ? "#10b981" : skillGap < 60 ? "#f59e0b" : "#ef4444" }}
              >
                {Math.round(skillGap)}
              </div>
              <div className="text-[10px] text-muted mt-0.5">
                {skillGap < 30 ? "Minimal gap" : skillGap < 60 ? "Moderate gap" : "Large gap"}
              </div>
            </motion.div>
          </div>
        </div>
      </div>

      {/* ── Signals ── */}
      {(analysis.positive_signals?.length || analysis.negative_signals?.length) && (
        <motion.div
          className="p-5 rounded-2xl"
          style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)" }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          <div className="text-sm font-semibold text-primary mb-4 flex items-center gap-2">
            <Zap size={14} className="text-yellow-400" />
            Recruiter Signals
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Positive */}
            <div>
              <div className="text-xs font-medium text-secondary mb-3 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                What's Working
              </div>
              <div className="flex flex-col gap-2">
                {(analysis.positive_signals ?? []).map((sig, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg text-xs"
                    style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.15)" }}
                  >
                    <div className="font-semibold text-green-300 mb-0.5">{sig.factor}</div>
                    <div className="text-secondary leading-relaxed">{sig.description}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Negative */}
            <div>
              <div className="text-xs font-medium text-secondary mb-3 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                What to Fix
              </div>
              <div className="flex flex-col gap-2">
                {(analysis.negative_signals ?? []).map((sig, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg text-xs"
                    style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.15)" }}
                  >
                    <div className="font-semibold text-red-300 mb-0.5">{sig.factor}</div>
                    <div className="text-secondary leading-relaxed">{sig.description}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
