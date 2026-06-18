"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { BarChart2, Users, Clock, Shield, Zap, Target, Brain, FileText } from "lucide-react";

interface Stats { analyses_run: number; users: number; }

function AnimatedCount({ value, suffix = "" }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    if (!value) return;
    let start = 0;
    const end = value;
    const duration = 1800;
    const step = end / (duration / 16);
    const timer = setInterval(() => {
      start += step;
      if (start >= end) { setDisplay(end); clearInterval(timer); }
      else setDisplay(Math.floor(start));
    }, 16);
    return () => clearInterval(timer);
  }, [value]);
  return <>{display.toLocaleString()}{suffix}</>;
}

const DIFFERENTIATORS = [
  {
    icon: Zap,
    color: "#C05800",
    title: "Works from a URL — no copy-pasting",
    body: "Every other ATS tool makes you copy-paste the job description. JobSynk just needs the link — paste it and the AI reads the actual posting.",
  },
  {
    icon: Brain,
    color: "#7ab840",
    title: "5 real dimensions, not one fake score",
    body: "ATS compatibility, technical fit, semantic match, recruiter impression, and project relevance — each scored separately so you know exactly where you stand.",
  },
  {
    icon: Target,
    color: "#d4aa30",
    title: "Role-specific interview questions",
    body: "After your analysis, get 8 targeted interview questions generated directly from that job's requirements — not generic templates.",
  },
  {
    icon: FileText,
    color: "#C05800",
    title: "AI-rewritten bullet points",
    body: "Not just feedback — actual rewritten bullets with stronger verbs, quantified metrics, and language that matches what this specific role is looking for.",
  },
  {
    icon: Users,
    color: "#7ab840",
    title: "Job pipeline tracker built in",
    body: "Track every application from saved to offer in a kanban board. One place for your entire job search — analysis, applications, outcomes.",
  },
  {
    icon: Shield,
    color: "#d4aa30",
    title: "Gets smarter with every outcome",
    body: "When you report whether you got an interview, the AI learns. Scores improve over time as real outcome data accumulates — no other free tool does this.",
  },
];

export function Testimonials() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/public/stats`)
      .then(r => r.json())
      .then(setStats)
      .catch(() => {});
  }, []);

  return (
    <section className="py-24 px-6 border-t border-[var(--border-subtle)]">
      <div className="max-w-7xl mx-auto">

        {/* Live stats bar */}
        {stats && (stats.analyses_run > 0 || stats.users > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="flex flex-wrap items-center justify-center gap-10 mb-20 py-6 px-8 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
          >
            {stats.analyses_run > 0 && (
              <div className="text-center">
                <p className="text-3xl font-bold text-[var(--text-primary)]">
                  <AnimatedCount value={stats.analyses_run} />
                </p>
                <p className="text-[12px] text-[var(--text-muted)] mt-1">Resumes analysed</p>
              </div>
            )}
            {stats.users > 0 && (
              <div className="text-center">
                <p className="text-3xl font-bold text-[var(--text-primary)]">
                  <AnimatedCount value={stats.users} />
                </p>
                <p className="text-[12px] text-[var(--text-muted)] mt-1">Job seekers signed up</p>
              </div>
            )}
            <div className="text-center">
              <p className="text-3xl font-bold text-[var(--text-primary)]">30<span className="text-xl">s</span></p>
              <p className="text-[12px] text-[var(--text-muted)] mt-1">Average analysis time</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold text-[var(--text-primary)]">₹0</p>
              <p className="text-[12px] text-[var(--text-muted)] mt-1">To get started</p>
            </div>
          </motion.div>
        )}

        {/* Section header */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <h2 className="text-4xl font-bold tracking-tight text-[var(--text-primary)] mb-3">
            Why JobSynk is different
          </h2>
          <p className="text-[var(--text-secondary)] text-base max-w-xl mx-auto">
            Most resume tools give you a generic score and call it a day. Here's what we actually do differently.
          </p>
        </motion.div>

        {/* Differentiator grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {DIFFERENTIATORS.map((d, i) => {
            const Icon = d.icon;
            return (
              <motion.div
                key={d.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
                className="p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-default)] transition-colors"
              >
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center mb-4"
                  style={{ background: `${d.color}18`, border: `1px solid ${d.color}30` }}
                >
                  <Icon className="w-4 h-4" style={{ color: d.color }} />
                </div>
                <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-2">{d.title}</h3>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{d.body}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
