"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { BarChart3, TrendingUp, Target, Zap } from "lucide-react";
import ScoreDonut from "@/components/ui/ScoreDonut";

const DEMO_SEGMENTS = [
  { label: "ATS Compatibility",   shortLabel: "ATS",       value: 84, color: "blue" },
  { label: "Technical Fit",       shortLabel: "Technical", value: 78, color: "purple" },
  { label: "Semantic Match",      shortLabel: "Semantic",  value: 91, color: "cyan" },
  { label: "Recruiter Impression",shortLabel: "Recruiter", value: 72, color: "green" },
  { label: "Project Relevance",   shortLabel: "Projects",  value: 65, color: "amber" },
];

const FEATURE_BULLETS = [
  { icon: Target,    color: "#3b82f6", title: "5-Dimension Scoring",    desc: "ATS, technical fit, semantic match, recruiter impression, project relevance — all scored independently." },
  { icon: TrendingUp,color: "#10b981", title: "Interview Probability",  desc: "ML model predicts your shortlist probability: 79% — strong candidate, top 10% tier." },
  { icon: Zap,       color: "#8b5cf6", title: "Instant Feedback",       desc: "Full analysis in under 10 seconds. No loading screens, no waiting for LLM queues." },
  { icon: BarChart3, color: "#06b6d4", title: "Cohort Benchmarking",    desc: "You're in the top 23% of engineers applying to similar roles this month." },
];

export default function ScoreDemoSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="section relative overflow-hidden">
      {/* Decorative background */}
      <div
        className="absolute right-0 top-1/2 w-[600px] h-[600px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/3"
        style={{
          background: "radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="container-xl relative">
        <div className="grid lg:grid-cols-2 gap-16 items-center">

          {/* ── Left: Score visualization ── */}
          <motion.div
            className="flex flex-col items-center"
            initial={{ opacity: 0, x: -40 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Glass card wrapping the donut */}
            <div
              className="relative w-full max-w-md p-8 rounded-3xl"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 0 0 1px rgba(255,255,255,0.03) inset, 0 24px 64px rgba(0,0,0,0.4)",
              }}
            >
              {/* Top bar */}
              <div className="flex items-center justify-between mb-6">
                <div>
                  <div className="text-sm font-semibold text-primary">ATS Analysis Report</div>
                  <div className="text-xs text-muted mt-0.5">Senior ML Engineer · Google</div>
                </div>
                <div
                  className="px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{
                    background: "rgba(16,185,129,0.12)",
                    color: "#10b981",
                    border: "1px solid rgba(16,185,129,0.25)",
                  }}
                >
                  79% Interview
                </div>
              </div>

              {/* Donut chart */}
              <ScoreDonut
                segments={DEMO_SEGMENTS}
                overallScore={82}
                size={220}
                strokeWidth={16}
                showLegend={true}
                animationDelay={isInView ? 200 : 99999}
              />

              {/* Scan line animation */}
              <div className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none">
                <motion.div
                  className="absolute left-0 right-0 h-px"
                  style={{
                    background: "linear-gradient(90deg, transparent, rgba(59,130,246,0.5), transparent)",
                  }}
                  animate={{ y: [-10, 500] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "linear", delay: 2 }}
                />
              </div>
            </div>

            {/* Interview probability gauge */}
            <motion.div
              className="mt-4 w-full max-w-md p-4 rounded-2xl flex items-center gap-4"
              style={{
                background: "rgba(16,185,129,0.06)",
                border: "1px solid rgba(16,185,129,0.15)",
              }}
              initial={{ opacity: 0, y: 10 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: 0.5, duration: 0.5 }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.25)" }}
              >
                <Target size={20} className="text-green-400" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-semibold text-primary">Interview Probability</span>
                  <span className="text-lg font-bold" style={{ color: "#10b981" }}>79%</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: "linear-gradient(90deg, #10b981, #34d399)" }}
                    initial={{ width: 0 }}
                    animate={isInView ? { width: "79%" } : {}}
                    transition={{ delay: 0.8, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
                <div className="text-xs text-muted mt-1">top_10 tier · high confidence</div>
              </div>
            </motion.div>
          </motion.div>

          {/* ── Right: Feature bullets ── */}
          <motion.div
            className="flex flex-col gap-3"
            initial={{ opacity: 0, x: 40 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-6">
              <div className="chip-purple mb-4 inline-flex">
                <BarChart3 size={12} />
                ATS Intelligence
              </div>
              <h2 className="text-4xl font-bold text-primary mb-4">
                Scores that actually{" "}
                <span className="gradient-blue">predict outcomes</span>
              </h2>
              <p className="text-secondary text-lg leading-relaxed">
                Our 8-dimension ATS engine doesn't just count keywords.
                It evaluates everything a recruiter looks for in 6 seconds —
                then tells you exactly how to improve.
              </p>
            </div>

            <div className="flex flex-col gap-4">
              {FEATURE_BULLETS.map((item, i) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={i}
                    className="flex items-start gap-4 p-4 rounded-2xl"
                    style={{
                      background: "rgba(255,255,255,0.02)",
                      border: "1px solid rgba(255,255,255,0.06)",
                    }}
                    initial={{ opacity: 0, x: 20 }}
                    animate={isInView ? { opacity: 1, x: 0 } : {}}
                    transition={{ delay: 0.1 + i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                    whileHover={{
                      backgroundColor: "rgba(255,255,255,0.04)",
                      borderColor: `${item.color}20`,
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                      style={{ background: `${item.color}15`, border: `1px solid ${item.color}25` }}
                    >
                      <Icon size={16} style={{ color: item.color }} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-primary mb-1">{item.title}</div>
                      <div className="text-xs text-secondary leading-relaxed">{item.desc}</div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
