"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { Check, Sparkles, Zap } from "lucide-react";
import Link from "next/link";

const PLANS = [
  {
    name: "Free",
    price: "$0",
    per: "forever",
    desc: "Get started with basic ATS analysis",
    color: "#475569",
    accent: "rgba(255,255,255,0.06)",
    borderColor: "rgba(255,255,255,0.08)",
    glowColor: "transparent",
    cta: "Get Started Free",
    ctaStyle: "secondary" as const,
    badge: null,
    features: [
      "3 analyses per month",
      "Basic ATS score (5 dimensions)",
      "Keyword gap detection",
      "Basic improvement suggestions",
      "Resume upload (PDF/DOCX)",
    ],
    missing: [
      "Interview probability prediction",
      "Skill gap roadmap",
      "Semantic matching engine",
      "Cohort benchmarking",
    ],
  },
  {
    name: "Pro",
    price: "$19",
    per: "per month",
    desc: "Full intelligence layer for serious job seekers",
    color: "#3b82f6",
    accent: "rgba(59,130,246,0.06)",
    borderColor: "rgba(59,130,246,0.25)",
    glowColor: "rgba(59,130,246,0.12)",
    cta: "Start Pro Trial",
    ctaStyle: "primary" as const,
    badge: { text: "Most Popular", color: "#3b82f6" },
    features: [
      "Unlimited analyses",
      "Full 8-dimension ATS scoring",
      "Interview probability prediction",
      "Skill gap intelligence + roadmap",
      "Semantic matching engine",
      "Bullet rewrite suggestions",
      "Cohort benchmarking",
      "Career insights dashboard",
      "Mentor discovery (semantic)",
    ],
    missing: [],
  },
  {
    name: "Team",
    price: "$49",
    per: "per month",
    desc: "For career coaches and recruiting teams",
    color: "#8b5cf6",
    accent: "rgba(139,92,246,0.06)",
    borderColor: "rgba(139,92,246,0.2)",
    glowColor: "rgba(139,92,246,0.10)",
    cta: "Contact Sales",
    ctaStyle: "secondary" as const,
    badge: null,
    features: [
      "Everything in Pro",
      "Up to 10 seats",
      "Team analytics dashboard",
      "Bulk resume analysis",
      "White-label reports",
      "API access",
      "Priority support",
    ],
    missing: [],
  },
];

export default function PricingSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });

  return (
    <section ref={ref} className="section relative overflow-hidden">
      {/* Ambient glow */}
      <div
        className="absolute top-1/2 left-1/2 w-[800px] h-[400px] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse, rgba(59,130,246,0.06) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="container-lg relative">
        {/* Heading */}
        <div className="text-center mb-14">
          <motion.div
            className="chip mb-4 inline-flex"
            initial={{ opacity: 0, y: 10 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
          >
            <Sparkles size={12} />
            Pricing
          </motion.div>
          <motion.h2
            className="text-4xl sm:text-5xl font-bold text-primary mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            Invest in your{" "}
            <span className="gradient-blue">next $50K raise</span>
          </motion.h2>
          <motion.p
            className="text-secondary text-lg"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.2 }}
          >
            One interview from Pro pays for itself 500×.
          </motion.p>
        </div>

        {/* Plans */}
        <div className="grid md:grid-cols-3 gap-6 items-start">
          {PLANS.map((plan, i) => (
            <motion.div
              key={i}
              className="relative rounded-3xl p-8"
              style={{
                background: plan.accent,
                border: `1px solid ${plan.borderColor}`,
                boxShadow: plan.glowColor !== "transparent"
                  ? `0 0 60px -10px ${plan.glowColor}, 0 24px 48px rgba(0,0,0,0.3)`
                  : "0 4px 16px rgba(0,0,0,0.2)",
              }}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Popular badge */}
              {plan.badge && (
                <div
                  className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-xs font-bold flex items-center gap-1.5"
                  style={{
                    background: `linear-gradient(135deg, ${plan.color}, #8b5cf6)`,
                    color: "white",
                    boxShadow: `0 0 20px -4px ${plan.color}80`,
                  }}
                >
                  <Zap size={11} />
                  {plan.badge.text}
                </div>
              )}

              {/* Plan header */}
              <div className="mb-6">
                <div className="text-sm font-semibold mb-1" style={{ color: plan.color }}>{plan.name}</div>
                <div className="flex items-end gap-2 mb-2">
                  <span className="text-4xl font-bold text-primary">{plan.price}</span>
                  <span className="text-sm text-muted mb-1">{plan.per}</span>
                </div>
                <p className="text-xs text-secondary">{plan.desc}</p>
              </div>

              {/* CTA */}
              <Link href={plan.name === "Team" ? "/contact" : "/signup"}>
                <motion.button
                  className={`w-full py-3 rounded-xl text-sm font-semibold mb-6 transition-all ${
                    plan.ctaStyle === "primary" ? "btn-primary justify-center" : ""
                  }`}
                  style={
                    plan.ctaStyle === "secondary"
                      ? {
                          background: "rgba(255,255,255,0.04)",
                          border: "1px solid rgba(255,255,255,0.1)",
                          color: "rgba(241,245,249,0.9)",
                          cursor: "pointer",
                        }
                      : {}
                  }
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  {plan.cta}
                </motion.button>
              </Link>

              {/* Divider */}
              <div className="h-px mb-6" style={{ background: "rgba(255,255,255,0.07)" }} />

              {/* Features */}
              <div className="flex flex-col gap-3">
                {plan.features.map((feat, j) => (
                  <div key={j} className="flex items-start gap-3">
                    <Check size={14} className="flex-shrink-0 mt-0.5" style={{ color: plan.color }} />
                    <span className="text-xs text-secondary">{feat}</span>
                  </div>
                ))}
                {plan.missing.map((feat, j) => (
                  <div key={j} className="flex items-start gap-3 opacity-30">
                    <div className="w-3.5 h-px flex-shrink-0 mt-2 bg-muted" />
                    <span className="text-xs text-muted line-through">{feat}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Guarantee */}
        <motion.p
          className="text-center text-sm text-muted mt-10"
          initial={{ opacity: 0 }}
          animate={isInView ? { opacity: 1 } : {}}
          transition={{ delay: 0.5 }}
        >
          🔒 No credit card required · Cancel anytime · 14-day free trial on Pro
        </motion.p>
      </div>
    </section>
  );
}
