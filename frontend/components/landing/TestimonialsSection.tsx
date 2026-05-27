"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";

const TESTIMONIALS = [
  {
    name: "Priya Mehta",
    role: "ML Engineer → Google",
    initial: "P",
    color: "#3b82f6",
    quote: "JobSync's semantic matching caught that my PyTorch experience directly transferred to the JAX skills Google required. I never would have framed it that way. Got the offer.",
    score: 91,
    improvement: "+22pts",
  },
  {
    name: "Alex Kim",
    role: "SWE → Stripe",
    initial: "A",
    color: "#8b5cf6",
    quote: "The interview probability feature is genuinely accurate. It told me 78% — I got the interview. When I was at 42% for another role, I skipped it. Saved me 3 hours of prep.",
    score: 84,
    improvement: "+31pts",
  },
  {
    name: "Zara Osei",
    role: "Data Scientist → Databricks",
    initial: "Z",
    color: "#10b981",
    quote: "The skill gap roadmap was perfect. It told me to learn dbt in 2 weeks before applying — I added it to my resume and got 3× more responses. Unbelievable ROI.",
    score: 78,
    improvement: "+28pts",
  },
  {
    name: "Ryan Torres",
    role: "DevOps → Cloudflare",
    initial: "R",
    color: "#06b6d4",
    quote: "I was in the borderline tier. JobSync showed me exactly what was holding me back. Rewrote 4 bullets with the AI, re-ran the analysis, jumped to competitive. Hired in 3 weeks.",
    score: 73,
    improvement: "+18pts",
  },
  {
    name: "Mei Zhang",
    role: "Frontend → Figma",
    initial: "M",
    color: "#f59e0b",
    quote: "The cohort benchmark feature hit different. Knowing I was in the top 15% of React engineers for this role gave me the confidence to negotiate $30K higher.",
    score: 88,
    improvement: "+15pts",
  },
  {
    name: "Omar Hassan",
    role: "Backend → Anthropic",
    initial: "O",
    color: "#ec4899",
    quote: "As someone applying to AI companies, the fact that JobSync uses local models (not OpenAI) for analysis was a big trust factor. Privacy-first and genuinely accurate.",
    score: 96,
    improvement: "+19pts",
  },
];

export default function TestimonialsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <section ref={ref} className="section overflow-hidden">
      <div className="container-xl">
        {/* Heading */}
        <div className="text-center mb-14">
          <motion.h2
            className="text-4xl sm:text-5xl font-bold text-primary mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            From rejected to{" "}
            <span className="gradient-blue">hired at FAANG</span>
          </motion.h2>
          <motion.p
            className="text-secondary text-lg"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.1 }}
          >
            Real outcomes from real candidates.
          </motion.p>
        </div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={i}
              className="relative p-6 rounded-2xl flex flex-col gap-4"
              style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
              initial={{ opacity: 0, y: 24 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.07, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{
                backgroundColor: "rgba(255,255,255,0.04)",
                y: -2,
              }}
            >
              {/* Quote */}
              <p className="text-sm text-secondary leading-relaxed flex-1">
                &ldquo;{t.quote}&rdquo;
              </p>

              {/* Divider */}
              <div className="h-px bg-white/5" />

              {/* Author row */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: `${t.color}20`, color: t.color, border: `1px solid ${t.color}30` }}
                  >
                    {t.initial}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-primary">{t.name}</div>
                    <div className="text-[10px] text-muted">{t.role}</div>
                  </div>
                </div>

                {/* Score badge */}
                <div className="flex flex-col items-end">
                  <div className="text-sm font-bold tabular-nums" style={{ color: t.color }}>{t.score}</div>
                  <div className="text-[10px]" style={{ color: "#10b981" }}>{t.improvement}</div>
                </div>
              </div>

              {/* Accent bottom border on hover */}
              <div
                className="absolute bottom-0 left-4 right-4 h-px opacity-0 group-hover:opacity-100"
                style={{ background: `linear-gradient(90deg, transparent, ${t.color}50, transparent)` }}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
