"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useInView, useMotionValue, animate, useScroll, useTransform } from "framer-motion";

function CountUp({ to, suffix = "", prefix = "", decimals = 0, duration = 2.0 }: {
  to: number; suffix?: string; prefix?: string; decimals?: number; duration?: number;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true });
  const motionVal = useMotionValue(0);
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    const unsub = motionVal.on("change", (v) => { setDisplay(v.toFixed(decimals)); });
    return unsub;
  }, [motionVal, decimals]);

  useEffect(() => {
    if (!isInView) return;
    const controls = animate(motionVal, to, { duration, ease: [0.16, 1, 0.3, 1] });
    return controls.stop;
  }, [isInView, to, duration, motionVal]);

  return <span ref={ref}>{prefix}{display}{suffix}</span>;
}

const STATS = [
  {
    value: 5, suffix: "", label: "AI Score Dimensions",
    sublabel: "ATS · Technical · Semantic · Recruiter · Projects",
    color: "#C05800", rgb: "192,88,0",
  },
  {
    value: 0, suffix: "$", label: "Cost to Use", isZero: true,
    sublabel: "Free forever — no credit card, no subscription",
    color: "#7ab840", rgb: "122,184,64",
  },
  {
    value: 30, suffix: "s", label: "Analysis Time",
    sublabel: "Full AI report generated in under 30 seconds",
    color: "#d4aa30", rgb: "212,170,48",
  },
  {
    value: 100, suffix: "%", label: "Private by Design",
    sublabel: "Your resume never sent to OpenAI or third parties",
    color: "#C05800", rgb: "192,88,0",
  },
];

export default function StatsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  /* ── Scroll-driven parallax on background orbs ── */
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const orb1Y = useTransform(scrollYProgress, [0, 1], ["-30%", "30%"]);
  const orb2Y = useTransform(scrollYProgress, [0, 1], ["20%", "-20%"]);
  const orb3Y = useTransform(scrollYProgress, [0, 1], ["-15%", "25%"]);

  return (
    <section ref={ref} className="relative py-20 overflow-hidden">
      {/* Top / bottom separator lines */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

      {/* ── Parallax background orbs ── */}
      <motion.div
        className="absolute w-[500px] h-[400px] rounded-full blur-[120px] pointer-events-none"
        style={{
          y: orb1Y,
          background: "radial-gradient(circle, rgba(192,88,0,0.10) 0%, transparent 70%)",
          left: "-10%",
          top: "50%",
          translateY: "-50%",
        }}
      />
      <motion.div
        className="absolute w-[400px] h-[350px] rounded-full blur-[100px] pointer-events-none"
        style={{
          y: orb2Y,
          background: "radial-gradient(circle, rgba(212,170,48,0.08) 0%, transparent 70%)",
          right: "-8%",
          top: "50%",
          translateY: "-50%",
        }}
      />
      <motion.div
        className="absolute w-[300px] h-[300px] rounded-full blur-[80px] pointer-events-none"
        style={{
          y: orb3Y,
          background: "radial-gradient(circle, rgba(122,184,64,0.06) 0%, transparent 70%)",
          left: "50%",
          top: "50%",
          translateX: "-50%",
          translateY: "-50%",
        }}
      />

      <div className="container-xl relative">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {STATS.map((stat, i) => (
            <motion.div
              key={i}
              className="relative flex flex-col items-center text-center p-6 rounded-2xl"
              style={{
                background: `linear-gradient(135deg, rgba(${stat.rgb},0.06) 0%, rgba(${stat.rgb},0.02) 100%)`,
                border: `1px solid rgba(${stat.rgb},0.12)`,
              }}
              initial={{ opacity: 0, y: 30 + i * 8 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ delay: i * 0.10, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
            >
              <div
                className="absolute inset-0 rounded-2xl"
                style={{ background: `radial-gradient(circle at 50% 0%, rgba(${stat.rgb},0.10) 0%, transparent 60%)` }}
              />

              <div className="text-4xl sm:text-5xl font-bold tabular-nums mb-1 relative" style={{ color: stat.color }}>
                {(stat as { isZero?: boolean }).isZero
                  ? <span>$0</span>
                  : <CountUp to={stat.value} suffix={stat.suffix} />
                }
              </div>

              <div className="text-sm font-semibold text-primary mb-1 relative">{stat.label}</div>
              <div className="text-xs text-muted relative">{stat.sublabel}</div>

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
