"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { GraduationCap, RefreshCw, Briefcase, Globe, Code2, BarChart3 } from "lucide-react";

const USE_CASES = [
  {
    icon: GraduationCap,
    color: "#3b82f6",
    who: "Final-year students",
    headline: "Know exactly what to fix before you apply",
    body: "See which skills are missing for your target role, get AI-rewritten bullets that match recruiter expectations, and understand why your resume may be getting filtered out.",
  },
  {
    icon: RefreshCw,
    color: "#8b5cf6",
    who: "Career switchers",
    headline: "Understand what transfers and what doesn't",
    body: "JobSync's semantic matching maps your existing experience to new role requirements — so you know which skills carry over and exactly what gap you need to close.",
  },
  {
    icon: Briefcase,
    color: "#10b981",
    who: "First-time job seekers",
    headline: "Stop guessing, start knowing",
    body: "Get a plain-English breakdown of your ATS score across 5 dimensions. No jargon, no vague advice — just specific, actionable improvements you can make today.",
  },
  {
    icon: Globe,
    color: "#f59e0b",
    who: "International applicants",
    headline: "Level the playing field",
    body: "Understand exactly which keywords and phrasing ATS systems in your target country expect. Get mentor recommendations from your own region, free.",
  },
  {
    icon: Code2,
    color: "#06b6d4",
    who: "Self-taught developers",
    headline: "Show your skills, not just your degree",
    body: "Projects and open-source work are scored on their own dimension. JobSync evaluates your actual technical depth — not just credentials.",
  },
  {
    icon: BarChart3,
    color: "#ec4899",
    who: "Anyone applying to multiple roles",
    headline: "One resume rarely fits all",
    body: "Paste a job URL and get a tailored analysis in seconds. See precisely how your resume reads for that specific role, not a generic score.",
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
            Built for every{" "}
            <span className="gradient-blue">stage of your career</span>
          </motion.h2>
          <motion.p
            className="text-secondary text-lg max-w-xl mx-auto"
            initial={{ opacity: 0 }}
            animate={isInView ? { opacity: 1 } : {}}
            transition={{ delay: 0.1 }}
          >
            Whether you&apos;re fresh out of college or switching industries, JobSync gives you the same clarity a career coach would — for free.
          </motion.p>
        </div>

        {/* Grid */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {USE_CASES.map((item, i) => (
            <motion.div
              key={i}
              className="relative p-6 rounded-2xl flex flex-col gap-4 group"
              style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
              }}
              initial={{ opacity: 0, y: 24 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.07, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ backgroundColor: "rgba(255,255,255,0.04)", y: -2 }}
            >
              {/* Icon */}
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: `${item.color}18`, border: `1px solid ${item.color}30` }}
              >
                <item.icon size={18} style={{ color: item.color }} />
              </div>

              {/* Content */}
              <div className="flex-1">
                <div
                  className="text-[11px] font-semibold uppercase tracking-wider mb-1.5"
                  style={{ color: item.color }}
                >
                  {item.who}
                </div>
                <h3 className="text-sm font-bold text-primary mb-2 leading-snug">
                  {item.headline}
                </h3>
                <p className="text-xs text-secondary leading-relaxed">{item.body}</p>
              </div>

              {/* Accent bottom border on hover */}
              <div
                className="absolute bottom-0 left-4 right-4 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `linear-gradient(90deg, transparent, ${item.color}50, transparent)` }}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
