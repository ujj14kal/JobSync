"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import {
  Brain, Target, GitBranch, TrendingUp,
  Zap, BarChart3, Users, Shield,
} from "lucide-react";
import TiltCard from "@/components/ui/TiltCard";
import { MagicCard } from "@/components/ui/magic-card";
import { BorderBeam } from "@/components/ui/border-beam";

const FEATURES = [
  {
    icon: Brain,
    color: "#C05800",
    rgb: "192,88,0",
    beamTo: "#d4aa30",
    title: "Semantic Matching Engine",
    description:
      "Multi-layer embedding system matches your experience against job requirements with section-level precision — not just keyword counting.",
    badge: "Proprietary",
    badgeColor: "#C05800",
    detail: "384-dim vectors · Cross-section matrix · Transferable skill detection",
  },
  {
    icon: Target,
    color: "#713600",
    rgb: "113,54,0",
    beamTo: "#C05800",
    title: "Recruiter-Fit Prediction",
    description:
      "16-feature ML model predicts interview probability. Starts rule-based, evolves to XGBoost as outcome data accumulates.",
    badge: "AI Model",
    badgeColor: "#8c4a18",
    detail: "Rule-based → ML as data grows · Confidence scoring · Tier classification",
  },
  {
    icon: GitBranch,
    color: "#d4aa30",
    rgb: "212,170,48",
    beamTo: "#C05800",
    title: "Skill Gap Intelligence",
    description:
      "300+ node skill ontology maps prerequisites, similar skills, and learning paths. Get transferable credit for what you already know.",
    badge: "Knowledge Graph",
    badgeColor: "#d4aa30",
    detail: "Transferable skills · Learning roadmap · Time estimates",
  },
  {
    icon: TrendingUp,
    color: "#8c9a20",
    rgb: "140,154,32",
    beamTo: "#d4aa30",
    title: "Feedback Learning Loop",
    description:
      "Every interview outcome teaches the platform. Keyword performance, cohort benchmarks, and weight adjustments compound over time.",
    badge: "Self-Learning",
    badgeColor: "#8c9a20",
    detail: "Outcome tracking · Keyword analytics · Cohort benchmarks",
  },
  {
    icon: Zap,
    color: "#d97020",
    rgb: "217,112,32",
    beamTo: "#713600",
    title: "Real-time ATS Scoring",
    description:
      "8-dimension scoring engine evaluates formatting, impact metrics, technical depth, and recruiter impression simultaneously.",
    badge: "Instant",
    badgeColor: "#d97020",
    detail: "8 dimensions · Recruiter impression · Impact density",
  },
  {
    icon: BarChart3,
    color: "#b86820",
    rgb: "184,104,32",
    beamTo: "#C05800",
    title: "Career Analytics Dashboard",
    description:
      "Track your profile evolution, application funnel, cohort percentile, and skill improvement over time with rich visualizations.",
    badge: "Analytics",
    badgeColor: "#b86820",
    detail: "Funnel tracking · Percentile rank · Progress over time",
  },
  {
    icon: Users,
    color: "#e89848",
    rgb: "232,152,72",
    beamTo: "#d4aa30",
    title: "Mentor Discovery",
    description:
      "Semantic search connects you with mentors whose expertise matches your career gap. Ranked by relevance, not recency.",
    badge: "Vector Search",
    badgeColor: "#e89848",
    detail: "Semantic matching · Industry-specific · Multi-platform",
  },
  {
    icon: Shield,
    color: "#7ab840",
    rgb: "122,184,64",
    beamTo: "#d4aa30",
    title: "Privacy-First Local AI",
    description:
      "Core intelligence runs on-device. No OpenAI API calls for analysis. Your resume never trains someone else's model.",
    badge: "Local Models",
    badgeColor: "#7ab840",
    detail: "Sentence-transformers · Offline capable · Zero data leakage",
  },
];

export default function FeaturesSection() {
  const headingRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(headingRef, { once: true, margin: "-50px" });

  return (
    <section className="section">
      <div className="container-xl">
        {/* ── Section heading ── */}
        <div ref={headingRef} className="text-center mb-16">
          <motion.div
            className="chip-blue mb-6 mx-auto inline-flex"
            initial={{ opacity: 0, y: 10 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5 }}
          >
            <Brain size={12} />
            Intelligence Architecture
          </motion.div>
          <motion.h2
            className="text-4xl sm:text-5xl font-bold text-primary mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            Not an API wrapper.{" "}
            <span className="gradient-blue">A proprietary platform.</span>
          </motion.h2>
          <motion.p
            className="text-secondary text-lg max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            Built with custom ML models that become defensible over time.
            Every feature is engineered for accuracy and scale.
          </motion.p>
        </div>

        {/* ── Feature grid ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((feat, i) => {
            const Icon = feat.icon;
            return (
              <TiltCard
                key={i}
                intensity={8}
                scale={1.03}
                className="group"
              >
                <MagicCard
                  gradientRgb={feat.rgb}
                  gradientOpacity={0.09}
                  gradientSize={260}
                  className="h-full"
                >
                <motion.div
                  className="relative h-full p-6 rounded-2xl overflow-hidden cursor-pointer"
                  style={{
                    background: `linear-gradient(135deg, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.03) 100%)`,
                    border: `1px solid ${feat.color}28`,
                    transition: "border-color 0.3s, box-shadow 0.3s",
                    "--card-bg": "var(--bg-surface)",
                  } as React.CSSProperties}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-30px" }}
                  transition={{ delay: (i % 4) * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  whileHover={{
                    borderColor: `${feat.color}40`,
                    boxShadow: `0 0 0 1px ${feat.color}20, 0 8px 40px ${feat.color}14, 0 24px 48px rgba(0,0,0,0.3)`,
                  }}
                >
                  {/* Border beam on hover */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none">
                    <BorderBeam
                      colorFrom={feat.color}
                      colorTo={feat.beamTo}
                      duration={4 + (i % 3)}
                    />
                  </div>

                  {/* Background glow on hover */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500"
                    style={{
                      background: `radial-gradient(circle at 30% 20%, ${feat.color}10 0%, transparent 60%)`,
                    }}
                  />

                  {/* Icon */}
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center mb-4"
                    style={{
                      background: `${feat.color}15`,
                      border: `1px solid ${feat.color}25`,
                    }}
                  >
                    <Icon size={18} style={{ color: feat.color }} />
                  </div>

                  {/* Badge */}
                  <div
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold mb-3"
                    style={{
                      background: `${feat.badgeColor}15`,
                      color: feat.badgeColor,
                      border: `1px solid ${feat.badgeColor}25`,
                    }}
                  >
                    {feat.badge}
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-semibold text-primary mb-2 leading-tight">
                    {feat.title}
                  </h3>

                  {/* Description */}
                  <p className="text-xs text-secondary leading-relaxed mb-4">
                    {feat.description}
                  </p>

                  {/* Tech detail */}
                  <div
                    className="text-[10px] leading-relaxed"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {feat.detail}
                  </div>

                  {/* Bottom accent line */}
                  <div
                    className="absolute bottom-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${feat.color}60, transparent)`,
                    }}
                  />
                </motion.div>
                </MagicCard>
              </TiltCard>
            );
          })}
        </div>
      </div>
    </section>
  );
}
