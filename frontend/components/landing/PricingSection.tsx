"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import {
  Brain, Shield, Zap, GitBranch, Target, FileText,
  Users, TrendingUp, Lock, Heart,
} from "lucide-react";
import Link from "next/link";

const EVERYTHING_FREE = [
  { icon: Brain,      color: "#3b82f6", text: "Full 5-dimension ATS score" },
  { icon: Target,     color: "#8b5cf6", text: "Skill gap analysis with learning paths" },
  { icon: GitBranch,  color: "#06b6d4", text: "Missing keyword detection" },
  { icon: FileText,   color: "#10b981", text: "AI resume bullet rewriter" },
  { icon: TrendingUp, color: "#f59e0b", text: "Career insights & salary data" },
  { icon: Users,      color: "#ec4899", text: "Mentor discovery (ADPList, Unstop, LinkedIn)" },
  { icon: Zap,        color: "#06b6d4", text: "Instant JD extraction from any URL" },
  { icon: Shield,     color: "#10b981", text: "Local AI — resume never sent to OpenAI" },
];

const WHY_TRUST = [
  {
    icon: Heart,
    color: "#ec4899",
    title: "Built for students & job seekers",
    body: "We're job seekers who built the tool we wished existed. No VC-backed paywalls, no upsells.",
  },
  {
    icon: Lock,
    color: "#8b5cf6",
    title: "Your data stays yours",
    body: "Resumes are stored privately in your account. The AI runs on local models — nothing is shared with third-party LLM APIs.",
  },
  {
    icon: Brain,
    color: "#3b82f6",
    title: "Honest AI, no magic numbers",
    body: "We show you what the model actually computed — every score has a dimension breakdown and reasoning behind it.",
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
          background: "radial-gradient(ellipse, rgba(59,130,246,0.05) 0%, transparent 70%)",
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
            <Heart size={12} />
            Free, always
          </motion.div>
          <motion.h2
            className="text-4xl sm:text-5xl font-bold text-primary mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            Everything included.{" "}
            <span className="gradient-blue">No catch.</span>
          </motion.h2>
          <motion.p
            className="text-secondary text-lg max-w-xl mx-auto"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.2 }}
          >
            JobSync is free while we&apos;re building it. Every feature is unlocked — because we believe students and job seekers shouldn&apos;t have to pay to compete.
          </motion.p>
        </div>

        <div className="grid lg:grid-cols-2 gap-10 items-start">
          {/* Feature checklist */}
          <motion.div
            className="p-8 rounded-3xl"
            style={{
              background: "rgba(59,130,246,0.04)",
              border: "1px solid rgba(59,130,246,0.15)",
            }}
            initial={{ opacity: 0, y: 24 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.15, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="flex items-center justify-between mb-6">
              <div>
                <div className="text-sm font-semibold mb-0.5" style={{ color: "#3b82f6" }}>Full Access</div>
                <div className="text-4xl font-bold text-primary">$0 <span className="text-lg font-normal text-muted">/ forever</span></div>
              </div>
              <div
                className="px-3 py-1.5 rounded-full text-xs font-bold"
                style={{ background: "rgba(16,185,129,0.15)", color: "#10b981", border: "1px solid rgba(16,185,129,0.25)" }}
              >
                No credit card
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              {EVERYTHING_FREE.map((feat, i) => (
                <motion.div
                  key={i}
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -8 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ delay: 0.2 + i * 0.05, duration: 0.4 }}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: `${feat.color}18`, border: `1px solid ${feat.color}30` }}
                  >
                    <feat.icon size={13} style={{ color: feat.color }} />
                  </div>
                  <span className="text-xs text-secondary">{feat.text}</span>
                </motion.div>
              ))}
            </div>

            <div className="mt-8">
              <Link href="/signup">
                <motion.button
                  className="btn-primary w-full justify-center py-3.5 text-sm"
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.99 }}
                >
                  Get started — it&apos;s free
                </motion.button>
              </Link>
            </div>
          </motion.div>

          {/* Why trust us */}
          <div className="space-y-5">
            <motion.p
              className="text-xs font-semibold text-muted uppercase tracking-widest mb-6"
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ delay: 0.25 }}
            >
              Why students trust us
            </motion.p>

            {WHY_TRUST.map((item, i) => (
              <motion.div
                key={i}
                className="flex gap-4 p-5 rounded-2xl"
                style={{
                  background: "rgba(255,255,255,0.02)",
                  border: "1px solid rgba(255,255,255,0.06)",
                }}
                initial={{ opacity: 0, y: 16 }}
                animate={isInView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.3 + i * 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${item.color}15`, border: `1px solid ${item.color}25` }}
                >
                  <item.icon size={16} style={{ color: item.color }} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-primary mb-1">{item.title}</div>
                  <p className="text-xs text-secondary leading-relaxed">{item.body}</p>
                </div>
              </motion.div>
            ))}

            <motion.div
              className="p-4 rounded-2xl text-center"
              style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ delay: 0.65 }}
            >
              <p className="text-xs text-muted leading-relaxed">
                We&apos;re early-stage and actively improving.{" "}
                <span className="text-secondary font-medium">
                  Your feedback directly shapes what we build next.
                </span>{" "}
                Every analysis you run helps us make the AI smarter for everyone.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
