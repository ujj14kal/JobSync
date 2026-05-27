"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useScroll, useTransform } from "framer-motion";
import { ArrowRight, Sparkles, Zap, Shield } from "lucide-react";
import dynamic from "next/dynamic";
import { ScoreRing } from "@/components/ui/ScoreDonut";

const NeuralNetworkCanvas = dynamic(
  () => import("@/components/3d/NeuralNetworkCanvas"),
  { ssr: false }
);

/* ── Floating card data ── */
const FLOAT_CARDS = [
  {
    id: "score",
    className: "left-[4%] top-[22%] hidden xl:flex",
    delay: 0,
    duration: 5.5,
    content: (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2 text-xs text-secondary">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
          ATS Analysis
        </div>
        <ScoreRing score={84} size={64} strokeWidth={6} />
        <div className="text-xs text-secondary text-center">Resume Score</div>
      </div>
    ),
  },
  {
    id: "match",
    className: "right-[4%] top-[28%] hidden xl:flex",
    delay: 1.2,
    duration: 6,
    content: (
      <div className="flex flex-col gap-3 p-4 min-w-[180px]">
        <div className="flex items-center gap-2 text-xs text-secondary">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
          Skill Match
        </div>
        {[
          { label: "Python", pct: 95, color: "#3b82f6" },
          { label: "React", pct: 78, color: "#8b5cf6" },
          { label: "AWS",   pct: 62, color: "#06b6d4" },
        ].map((item) => (
          <div key={item.label}>
            <div className="flex justify-between text-[10px] mb-1" style={{ color: "rgba(148,163,184,0.8)" }}>
              <span>{item.label}</span>
              <span style={{ color: item.color }}>{item.pct}%</span>
            </div>
            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: item.color, width: `${item.pct}%` }}
                initial={{ width: 0 }}
                animate={{ width: `${item.pct}%` }}
                transition={{ delay: 2 + 0.15, duration: 1.2, ease: [0.16,1,0.3,1] }}
              />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "interview",
    className: "right-[6%] bottom-[24%] hidden xl:flex",
    delay: 0.6,
    duration: 5,
    content: (
      <div className="flex items-center gap-3 p-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)" }}
        >
          <Zap size={16} className="text-green-400" />
        </div>
        <div>
          <div className="text-xs font-semibold text-primary">Interview Probability</div>
          <div className="text-xl font-bold" style={{ color: "#10b981" }}>79%</div>
        </div>
      </div>
    ),
  },
];

export default function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end start"] });
  const y = useTransform(scrollYProgress, [0, 1], ["0%", "25%"]);
  const opacity = useTransform(scrollYProgress, [0, 0.7], [1, 0]);

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-20"
    >
      {/* ── Neural network background ── */}
      <div className="absolute inset-0">
        <NeuralNetworkCanvas />
      </div>

      {/* ── Ambient gradient orbs ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute w-[700px] h-[700px] rounded-full opacity-20 blur-[120px]"
          style={{
            background: "radial-gradient(circle, #3b82f6, transparent 70%)",
            top: "10%",
            left: "20%",
            transform: "translate(-50%,-50%)",
          }}
        />
        <div
          className="absolute w-[500px] h-[500px] rounded-full opacity-15 blur-[100px]"
          style={{
            background: "radial-gradient(circle, #8b5cf6, transparent 70%)",
            top: "35%",
            right: "15%",
            transform: "translate(50%,-50%)",
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full opacity-10 blur-[80px]"
          style={{
            background: "radial-gradient(circle, #06b6d4, transparent 70%)",
            bottom: "10%",
            left: "40%",
            transform: "translate(-50%,50%)",
          }}
        />
      </div>

      {/* ── Floating glass cards ── */}
      {FLOAT_CARDS.map((card) => (
        <motion.div
          key={card.id}
          className={`absolute glass-md rounded-2xl ${card.className}`}
          style={{
            border: "1px solid rgba(255,255,255,0.08)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04) inset",
          }}
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{
            opacity: 1,
            y: [0, -10, 0],
            scale: 1,
          }}
          transition={{
            opacity: { delay: card.delay + 1.5, duration: 0.6 },
            scale: { delay: card.delay + 1.5, duration: 0.6 },
            y: {
              delay: card.delay + 1.5,
              duration: card.duration,
              repeat: Infinity,
              ease: "easeInOut",
            },
          }}
        >
          {card.content}
        </motion.div>
      ))}

      {/* ── Main hero content ── */}
      <motion.div
        className="relative z-10 text-center px-6 max-w-5xl mx-auto"
        style={{ y, opacity }}
      >
        {/* Eyebrow badge */}
        <motion.div
          className="inline-flex items-center gap-2 mb-8"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
            style={{
              background: "rgba(99,102,241,0.1)",
              border: "1px solid rgba(99,102,241,0.25)",
              color: "#a78bfa",
            }}
          >
            <Sparkles size={14} className="text-purple-400" />
            <span>Proprietary AI Intelligence Layer</span>
            <span
              className="ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
              style={{ background: "#8b5cf6", color: "white" }}
            >
              NEW
            </span>
          </div>
        </motion.div>

        {/* Headline */}
        <motion.h1
          className="text-5xl sm:text-6xl lg:text-8xl font-bold tracking-tight leading-[1.05] mb-6"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <span className="text-primary">Land your dream job</span>
          <br />
          <span className="gradient-cyan-blue">with AI that learns</span>
          <br />
          <span className="text-primary">from every hire</span>
        </motion.h1>

        {/* Sub-headline */}
        <motion.p
          className="text-lg sm:text-xl text-secondary max-w-2xl mx-auto mb-10 leading-relaxed"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          JobSync's proprietary AI analyzes your resume with recruiter-grade intelligence —
          semantic matching, skill gap prediction, and interview probability scoring that
          improves with every application.
        </motion.p>

        {/* Trust chips */}
        <motion.div
          className="flex flex-wrap items-center justify-center gap-3 mb-10"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
        >
          {[
            { icon: <Shield size={12} />, text: "Local AI — no data sent to OpenAI" },
            { icon: <Zap size={12} />, text: "Real-time analysis in seconds" },
            { icon: <Sparkles size={12} />, text: "Learns from 10K+ outcomes" },
          ].map((chip) => (
            <div
              key={chip.text}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
              style={{
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(148,163,184,0.9)",
              }}
            >
              <span className="text-blue-400">{chip.icon}</span>
              {chip.text}
            </div>
          ))}
        </motion.div>

        {/* CTAs */}
        <motion.div
          className="flex flex-col sm:flex-row items-center justify-center gap-4"
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
          <Link href="/signup">
            <motion.button
              className="btn-primary text-base px-8 py-4"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              Analyze My Resume Free
              <ArrowRight size={18} />
            </motion.button>
          </Link>
          <Link href="/login">
            <motion.button
              className="btn-secondary text-base px-8 py-4"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              See Live Demo
            </motion.button>
          </Link>
        </motion.div>

        {/* Social proof */}
        <motion.div
          className="mt-12 flex items-center justify-center gap-8 text-sm text-muted"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.5 }}
        >
          <div className="flex -space-x-2">
            {["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b"].map((color, i) => (
              <div
                key={i}
                className="w-8 h-8 rounded-full border-2 flex items-center justify-center text-xs font-bold"
                style={{
                  background: `${color}20`,
                  borderColor: `${color}40`,
                  color: color,
                }}
              >
                {String.fromCharCode(65 + i)}
              </div>
            ))}
          </div>
          <span>Trusted by 2,400+ job seekers</span>
          <div className="flex gap-0.5">
            {[...Array(5)].map((_, i) => (
              <span key={i} style={{ color: "#f59e0b" }}>★</span>
            ))}
            <span className="ml-1">4.9/5</span>
          </div>
        </motion.div>
      </motion.div>

      {/* ── Scroll indicator ── */}
      <motion.div
        className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        <div className="text-xs text-muted">Scroll to explore</div>
        <motion.div
          className="w-5 h-8 rounded-full border border-white/10 flex items-start justify-center pt-1.5"
          animate={{ opacity: [0.5, 1, 0.5] }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <motion.div
            className="w-1 h-1.5 rounded-full bg-white/40"
            animate={{ y: [0, 10, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          />
        </motion.div>
      </motion.div>
    </section>
  );
}
