"use client";

import { useRef } from "react";
import { motion, useInView, useScroll, useTransform } from "framer-motion";
import { GraduationCap, RefreshCw, Briefcase, Globe, Code2, BarChart3 } from "lucide-react";

const USE_CASES = [
  {
    icon: GraduationCap,
    color: "#C05800", rgb: "192,88,0",
    who: "Final-year students",
    headline: "Know exactly what to fix before you apply",
    body: "See which skills are missing for your target role, get AI-rewritten bullets that match recruiter expectations, and understand why your resume may be getting filtered out.",
  },
  {
    icon: RefreshCw,
    color: "#d4aa30", rgb: "212,170,48",
    who: "Career switchers",
    headline: "Understand what transfers and what doesn't",
    body: "JobSync's semantic matching maps your existing experience to new role requirements — so you know which skills carry over and exactly what gap you need to close.",
  },
  {
    icon: Briefcase,
    color: "#7ab840", rgb: "122,184,64",
    who: "First-time job seekers",
    headline: "Stop guessing, start knowing",
    body: "Get a plain-English breakdown of your ATS score across 5 dimensions. No jargon, no vague advice — just specific, actionable improvements you can make today.",
  },
  {
    icon: Globe,
    color: "#C05800", rgb: "192,88,0",
    who: "International applicants",
    headline: "Level the playing field",
    body: "Understand exactly which keywords and phrasing ATS systems in your target country expect. Get mentor recommendations from your own region, free.",
  },
  {
    icon: Code2,
    color: "#d4aa30", rgb: "212,170,48",
    who: "Self-taught developers",
    headline: "Show your skills, not just your degree",
    body: "Projects and open-source work are scored on their own dimension. JobSync evaluates your actual technical depth — not just credentials.",
  },
  {
    icon: BarChart3,
    color: "#7ab840", rgb: "122,184,64",
    who: "Anyone applying to multiple roles",
    headline: "One resume rarely fits all",
    body: "Paste a job URL and get a tailored analysis in seconds. See precisely how your resume reads for that specific role, not a generic score.",
  },
];

/* ── Marquee row component ── */
function MarqueeRow({
  items,
  direction = 1,
  speed = 35,
}: {
  items: typeof USE_CASES;
  direction?: 1 | -1;
  speed?: number;
}) {
  // Duplicate for seamless loop
  const doubled = [...items, ...items];
  const totalWidth = items.length * 340; // ~340px per card

  return (
    <div className="overflow-hidden relative">
      {/* Fade edges */}
      <div className="absolute inset-y-0 left-0 w-24 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to right, var(--bg-base), transparent)" }} />
      <div className="absolute inset-y-0 right-0 w-24 z-10 pointer-events-none"
        style={{ background: "linear-gradient(to left, var(--bg-base), transparent)" }} />

      <motion.div
        className="flex gap-4 will-change-transform"
        style={{ width: `${totalWidth * 2}px` }}
        animate={{
          x: direction === 1 ? [0, -totalWidth] : [-totalWidth, 0],
        }}
        transition={{
          duration: speed,
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop",
        }}
      >
        {doubled.map((item, i) => {
          const Icon = item.icon;
          return (
            <motion.div
              key={i}
              className="relative flex-shrink-0 w-[320px] p-5 rounded-2xl flex flex-col gap-3 group cursor-default"
              style={{
                background: `linear-gradient(135deg, rgba(${item.rgb},0.07) 0%, rgba(255,255,255,0.02) 100%)`,
                border: `1px solid rgba(${item.rgb},0.14)`,
              }}
              whileHover={{ y: -4, scale: 1.02, transition: { duration: 0.2 } }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `rgba(${item.rgb},0.12)`, border: `1px solid rgba(${item.rgb},0.20)` }}
                >
                  <Icon size={16} style={{ color: item.color }} />
                </div>
                <div
                  className="text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: item.color }}
                >
                  {item.who}
                </div>
              </div>

              <h3 className="text-sm font-bold text-primary leading-snug">
                {item.headline}
              </h3>
              <p className="text-xs text-secondary leading-relaxed line-clamp-3">{item.body}</p>

              {/* Bottom accent */}
              <div
                className="absolute bottom-0 left-4 right-4 h-px opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `linear-gradient(90deg, transparent, rgba(${item.rgb},0.5), transparent)` }}
              />
            </motion.div>
          );
        })}
      </motion.div>
    </div>
  );
}

export default function TestimonialsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  /* ── Scroll parallax on the heading ── */
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const headingY = useTransform(scrollYProgress, [0, 1], ["-20px", "20px"]);

  return (
    <section ref={ref} className="section overflow-hidden">
      <div className="container-xl">
        {/* Heading */}
        <motion.div className="text-center mb-14" style={{ y: headingY }}>
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
        </motion.div>
      </div>

      {/* ── Dual infinite marquee (opposite directions) ── */}
      <motion.div
        className="flex flex-col gap-4"
        initial={{ opacity: 0 }}
        animate={isInView ? { opacity: 1 } : {}}
        transition={{ delay: 0.2, duration: 0.6 }}
      >
        {/* Row 1: scrolls left → */}
        <MarqueeRow items={USE_CASES} direction={1} speed={40} />
        {/* Row 2: scrolls right ← */}
        <MarqueeRow items={[...USE_CASES].reverse()} direction={-1} speed={34} />
      </motion.div>
    </section>
  );
}
