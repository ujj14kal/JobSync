"use client";

import { useRef } from "react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
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
    title: "Deep Resume Matching",
    description:
      "Goes beyond keyword counting — understands context, seniority, and how your experience actually maps to what the job requires.",
    badge: "AI-Powered",
    badgeColor: "#C05800",
    detail: "JobSynk Neural Scorer · Section-level precision · Transferable skill detection · Context-aware",
  },
  {
    icon: Target,
    color: "#713600",
    rgb: "113,54,0",
    beamTo: "#C05800",
    title: "Interview Likelihood Score",
    description:
      "Predicts how likely you are to get shortlisted for a specific role — based on what actually gets people interviews, not guesswork.",
    badge: "Predictive AI",
    badgeColor: "#8c4a18",
    detail: "JobSynk AI Engine · Role-specific prediction · Confidence rating · Improves over time",
  },
  {
    icon: GitBranch,
    color: "#d4aa30",
    rgb: "212,170,48",
    beamTo: "#C05800",
    title: "Skill Gap Intelligence",
    description:
      "Shows exactly which skills you're missing — and gives you credit for related skills you already have. Includes a week-by-week learning plan.",
    badge: "Smart Roadmap",
    badgeColor: "#d4aa30",
    detail: "Transferable skills credited · Ordered learning path · Time estimates",
  },
  {
    icon: TrendingUp,
    color: "#8c9a20",
    rgb: "140,154,32",
    beamTo: "#d4aa30",
    title: "Gets Smarter Over Time",
    description:
      "The JobSynk AI Engine was trained on 6,000 real resume-job pairs and continues to improve. Every outcome signal sharpens the model for everyone on the platform.",
    badge: "Adaptive AI",
    badgeColor: "#8c9a20",
    detail: "Custom PyTorch model · Trained on real data · Improves with usage",
  },
  {
    icon: Zap,
    color: "#d97020",
    rgb: "217,112,32",
    beamTo: "#713600",
    title: "Full Report in 30 Seconds",
    description:
      "Complete ATS analysis — formatting, keywords, impact, technical depth, recruiter impression — all scored in under half a minute.",
    badge: "Instant",
    badgeColor: "#d97020",
    detail: "No waiting · No queues · Results while you watch",
  },
  {
    icon: BarChart3,
    color: "#b86820",
    rgb: "184,104,32",
    beamTo: "#C05800",
    title: "Career Progress Dashboard",
    description:
      "Track every application, see how your scores improve over time, and understand where you stand compared to similar candidates.",
    badge: "Dashboard",
    badgeColor: "#b86820",
    detail: "Application timeline · Score trends · Progress at a glance",
  },
  {
    icon: Users,
    color: "#e89848",
    rgb: "232,152,72",
    beamTo: "#d4aa30",
    title: "Mentor Discovery",
    description:
      "Finds mentors whose career path matches your goal — not just by job title, but by the actual gap you're trying to close.",
    badge: "Smart Match",
    badgeColor: "#e89848",
    detail: "Relevance-ranked · ADPList · Unstop · LinkedIn",
  },
  {
    icon: Shield,
    color: "#7ab840",
    rgb: "122,184,64",
    beamTo: "#d4aa30",
    title: "Your Data Stays Private",
    description:
      "Your resume is stored privately in your account. We never sell your data, never show it to other users, and never use it for advertising.",
    badge: "Private",
    badgeColor: "#7ab840",
    detail: "Private storage · No ads · No data selling · Your data, yours",
  },
];

/* ── Per-column parallax offsets (col 0 = fastest, col 3 = most delayed) ── */
const COL_PARALLAX = [0, 28, 52, 72]; // px lag per column

export default function FeaturesSection() {
  const sectionRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(headingRef, { once: true, margin: "-50px" });

  /* ── Section-level scroll progress ── */
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  /* ── Background orb parallax ── */
  const orb1Y = useTransform(scrollYProgress, [0, 1], ["-40%", "40%"]);
  const orb2Y = useTransform(scrollYProgress, [0, 1], ["30%", "-30%"]);
  const orb3Y = useTransform(scrollYProgress, [0, 1], ["-20%", "35%"]);

  /* ── Column parallax speeds (columns lag at different rates) ── */
  const col0Y = useTransform(scrollYProgress, [0, 1], [`${COL_PARALLAX[0]}px`, `-${COL_PARALLAX[0]}px`]);
  const col1Y = useTransform(scrollYProgress, [0, 1], [`${COL_PARALLAX[1]}px`, `-${COL_PARALLAX[1]}px`]);
  const col2Y = useTransform(scrollYProgress, [0, 1], [`${COL_PARALLAX[2]}px`, `-${COL_PARALLAX[2]}px`]);
  const col3Y = useTransform(scrollYProgress, [0, 1], [`${COL_PARALLAX[3]}px`, `-${COL_PARALLAX[3]}px`]);

  const colMotion = [col0Y, col1Y, col2Y, col3Y];

  return (
    <section ref={sectionRef} className="section relative overflow-hidden">
      {/* ── Parallax background orbs ── */}
      <motion.div
        className="absolute w-[600px] h-[600px] rounded-full blur-[130px] pointer-events-none"
        style={{
          y: orb1Y,
          background: "radial-gradient(circle, rgba(192,88,0,0.09) 0%, transparent 70%)",
          top: "10%",
          right: "-15%",
        }}
      />
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full blur-[120px] pointer-events-none"
        style={{
          y: orb2Y,
          background: "radial-gradient(circle, rgba(212,170,48,0.07) 0%, transparent 70%)",
          bottom: "5%",
          left: "-10%",
        }}
      />
      <motion.div
        className="absolute w-[350px] h-[350px] rounded-full blur-[90px] pointer-events-none"
        style={{
          y: orb3Y,
          background: "radial-gradient(circle, rgba(122,184,64,0.05) 0%, transparent 70%)",
          top: "50%",
          left: "40%",
          translateY: "-50%",
        }}
      />

      <div className="container-xl relative">
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
            Everything you need.{" "}
            <span className="gradient-blue">Nothing you don&apos;t.</span>
          </motion.h2>
          <motion.p
            className="text-secondary text-lg max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            Every feature is built around one goal: getting you more interviews.
            No fluff, no bloat — just the tools that actually move the needle.
          </motion.p>
        </div>

        {/* ── Feature grid — 4 columns, each at a different parallax depth ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((feat, i) => {
            const col = i % 4;
            const Icon = feat.icon;
            return (
              <motion.div
                key={i}
                style={{ y: colMotion[col] }}
                className="flex flex-col"
              >
                <TiltCard intensity={10} scale={1.04} className="group flex-1">
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
                      } as React.CSSProperties}
                      initial={{ opacity: 0, y: 32 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true, margin: "-20px" }}
                      transition={{
                        delay: (col * 0.08),
                        duration: 0.55,
                        ease: [0.16, 1, 0.3, 1],
                      }}
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
                      <div className="text-[10px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
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
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
