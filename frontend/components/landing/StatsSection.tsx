"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";

function CountUp({ to, suffix = "", prefix = "", decimals = 0, duration = 2.0 }: {
  to: number; suffix?: string; prefix?: string; decimals?: number; duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const motionVal = useMotionValue(0);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    const unsub = motionVal.on("change", (v) => {
      setDisplay(v.toFixed(decimals));
    });
    return unsub;
  }, [motionVal, decimals]);

  useEffect(() => {
    if (!isInView) return;
    const controls = animate(motionVal, to, { duration, ease: [0.16, 1, 0.3, 1] });
    return controls.stop;
  }, [isInView, to, duration, motionVal]);

  return (
    <span ref={ref}>
      {prefix}{display}{suffix}
    </span>
  );
}

const STATS = [
  { value: 5, suffix: "", label: "AI Score Dimensions", sublabel: "ATS · Technical · Semantic · Recruiter · Projects", color: "#3b82f6" },
  { value: 0, suffix: "$", prefix: "", label: "Cost to Use", sublabel: "Free forever — no credit card, no subscription", color: "#10b981", isZero: true },
  { value: 30, suffix: "s", label: "Analysis Time", sublabel: "Full AI report generated in under 30 seconds", color: "#8b5cf6" },
  { value: 100, suffix: "%", label: "Private by Design", sublabel: "Your resume never sent to OpenAI or third parties", color: "#06b6d4" },
];

export default function StatsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <section ref={ref} className="relative py-20 overflow-hidden">
      {/* Subtle divider line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      <div className="container-xl">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {STATS.map((stat, i) => (
            <motion.div
              key={i}
              className="relative flex flex-col items-center text-center p-6 rounded-2xl"
              style={{
                background: "rgba(255,255,255,0.02)",
                border: "1px solid rgba(255,255,255,0.06)",
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Glow */}
              <div
                className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ background: `radial-gradient(circle at 50% 0%, ${stat.color}12 0%, transparent 60%)` }}
              />

              {/* Number */}
              <div
                className="text-4xl sm:text-5xl font-bold tabular-nums mb-1"
                style={{ color: stat.color }}
              >
                {(stat as any).isZero
                  ? <span>$0</span>
                  : <CountUp to={stat.value} suffix={stat.suffix} decimals={(stat as any).decimals ?? 0} />
                }
              </div>

              {/* Label */}
              <div className="text-sm font-semibold text-primary mb-1">{stat.label}</div>
              <div className="text-xs text-muted">{stat.sublabel}</div>

              {/* Decorative bottom accent */}
              <motion.div
                className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px"
                style={{ background: `linear-gradient(90deg, transparent, ${stat.color}, transparent)` }}
                initial={{ width: 0 }}
                animate={isInView ? { width: "70%" } : { width: 0 }}
                transition={{ delay: 0.4 + i * 0.08, duration: 0.8 }}
              />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
