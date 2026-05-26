"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const stats = [
  { value: "94%", label: "ATS pass rate after optimization" },
  { value: "3.2×", label: "More interview callbacks on average" },
  { value: "< 30s", label: "Full analysis time" },
  { value: "50K+", label: "Resumes analyzed" },
];

export function Stats() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <section ref={ref} className="py-12 border-y border-[var(--border-subtle)]">
      <div className="max-w-5xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {stats.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 12 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="text-center"
            >
              <div className="text-3xl md:text-4xl font-bold text-[var(--text-primary)] tracking-tight mb-1">
                {stat.value}
              </div>
              <div className="text-[12px] text-[var(--text-muted)]">
                {stat.label}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
