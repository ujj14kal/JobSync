"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, Shield, Zap } from "lucide-react";
import { ScoreRingDemo } from "@/components/analysis/score-ring-demo";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, delay: i * 0.1, ease: [0.25, 0.4, 0.25, 1] },
  }),
};

export function Hero() {
  return (
    <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-24 pb-16 overflow-hidden">
      {/* Background grid */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.035]"
        style={{
          backgroundImage: `linear-gradient(var(--border-default) 1px, transparent 1px),
            linear-gradient(90deg, var(--border-default) 1px, transparent 1px)`,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Radial glow */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-[var(--accent-primary)]/8 blur-[120px] pointer-events-none" />

      <div className="relative z-10 max-w-4xl mx-auto text-center">
        {/* Badge */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={0}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] text-[12px] text-[var(--text-secondary)] mb-8"
        >
          <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          AI-powered resume optimization · Free forever
          <ArrowRight className="w-3 h-3" />
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={1}
          className="text-5xl md:text-7xl font-bold tracking-tight text-[var(--text-primary)] leading-[1.05] mb-6"
        >
          Land your dream job
          <br />
          <span className="gradient-accent">with AI precision</span>
        </motion.h1>

        {/* Sub */}
        <motion.p
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={2}
          className="text-lg text-[var(--text-secondary)] max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Upload your resume, enter the job you want. JobSync semantically
          matches your profile against real job descriptions and gives you
          recruiter-grade feedback to close every gap.
        </motion.p>

        {/* CTAs */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={3}
          className="flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <Link
            href="/signup"
            className="flex items-center gap-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[14px] font-medium px-6 py-3 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] glow-accent"
          >
            Analyze my resume free
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="#how-it-works"
            className="flex items-center gap-2 text-[14px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] px-6 py-3 rounded-xl border border-[var(--border-default)] hover:border-[var(--border-strong)] bg-[var(--bg-surface)] transition-all"
          >
            See how it works
          </Link>
        </motion.div>

        {/* Trust signals */}
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="show"
          custom={4}
          className="flex items-center justify-center gap-6 mt-10 text-[12px] text-[var(--text-muted)]"
        >
          {[
            { icon: Shield, text: "No signup required to preview" },
            { icon: Zap, text: "Analysis in under 30 seconds" },
            { icon: Sparkles, text: "Powered by Llama 3.3 70B" },
          ].map(({ icon: Icon, text }) => (
            <span key={text} className="flex items-center gap-1.5">
              <Icon className="w-3.5 h-3.5" />
              {text}
            </span>
          ))}
        </motion.div>
      </div>

      {/* Hero visual */}
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.7, delay: 0.5, ease: [0.25, 0.4, 0.25, 1] }}
        className="relative z-10 mt-20 w-full max-w-5xl mx-auto"
      >
        <HeroDashboard />
      </motion.div>
    </section>
  );
}

function HeroDashboard() {
  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden shadow-2xl shadow-black/40">
      {/* Window bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
        <div className="w-3 h-3 rounded-full bg-[var(--error)]/60" />
        <div className="w-3 h-3 rounded-full bg-[var(--warning)]/60" />
        <div className="w-3 h-3 rounded-full bg-[var(--success)]/60" />
        <div className="flex-1 mx-4 h-5 rounded-md bg-[var(--bg-overlay)] flex items-center justify-center">
          <span className="text-[11px] text-[var(--text-muted)]">
            jobsync.io/analysis
          </span>
        </div>
      </div>

      {/* Dashboard content */}
      <div className="grid grid-cols-12 gap-0 p-0 min-h-[400px]">
        {/* Sidebar */}
        <div className="col-span-2 border-r border-[var(--border-subtle)] bg-[var(--bg-elevated)] p-4 flex flex-col gap-3">
          {["Dashboard", "Analysis", "Resume", "Mentors", "Improve"].map(
            (item, i) => (
              <div
                key={item}
                className={`text-[11px] px-2 py-1.5 rounded-md ${
                  i === 1
                    ? "bg-[var(--accent-muted)] text-[var(--accent-hover)]"
                    : "text-[var(--text-muted)]"
                }`}
              >
                {item}
              </div>
            )
          )}
        </div>

        {/* Main */}
        <div className="col-span-10 p-6">
          <div className="flex items-start justify-between mb-6">
            <div>
              <div className="text-[13px] font-semibold text-[var(--text-primary)] mb-1">
                ATS Analysis · Google SWE L4
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                Analyzed 2 minutes ago
              </div>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/20">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-[11px] text-emerald-400 font-medium">
                Complete
              </span>
            </div>
          </div>

          {/* Score cards */}
          <div className="grid grid-cols-5 gap-3 mb-6">
            {[
              { label: "Overall", score: 78 },
              { label: "ATS Compat.", score: 82 },
              { label: "Tech Fit", score: 74 },
              { label: "Semantic", score: 79 },
              { label: "Recruiter", score: 71 },
            ].map(({ label, score }) => (
              <div
                key={label}
                className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-center"
              >
                <div
                  className="text-xl font-bold mb-1"
                  style={{
                    color:
                      score >= 75
                        ? "var(--score-high)"
                        : score >= 50
                          ? "var(--score-mid)"
                          : "var(--score-low)",
                  }}
                >
                  {score}
                </div>
                <div className="text-[9px] text-[var(--text-muted)]">
                  {label}
                </div>
              </div>
            ))}
          </div>

          {/* Skill gaps */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <div className="text-[11px] font-medium text-[var(--text-primary)] mb-3">
                Missing Keywords
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["Kubernetes", "gRPC", "Distributed Systems", "Go"].map(
                  (k) => (
                    <span
                      key={k}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/10 text-amber-400 border border-amber-400/20"
                    >
                      {k}
                    </span>
                  )
                )}
              </div>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
              <div className="text-[11px] font-medium text-[var(--text-primary)] mb-3">
                Top Strengths
              </div>
              {["Strong Python background", "Relevant ML projects"].map((s) => (
                <div key={s} className="flex items-center gap-2 mb-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                  <span className="text-[10px] text-[var(--text-secondary)]">
                    {s}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
