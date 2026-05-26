"use client";

import Link from "next/link";
import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { ArrowRight, Zap } from "lucide-react";

export function CTA() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-50px" });

  return (
    <section ref={ref} className="py-28 px-6 border-t border-[var(--border-subtle)]">
      <div className="max-w-3xl mx-auto text-center relative">
        {/* Glow */}
        <div className="absolute inset-0 bg-[var(--accent-primary)]/5 rounded-3xl blur-3xl" />

        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.5 }}
          className="relative p-12 rounded-3xl border border-[var(--border-default)] bg-[var(--bg-surface)]"
        >
          <div className="inline-flex w-14 h-14 rounded-2xl bg-[var(--accent-primary)] items-center justify-center mb-6 mx-auto">
            <Zap className="w-7 h-7 text-white" fill="white" />
          </div>

          <h2 className="text-4xl font-bold tracking-tight text-[var(--text-primary)] mb-4">
            Ready to land your dream job?
          </h2>
          <p className="text-[var(--text-secondary)] text-base mb-8 max-w-lg mx-auto">
            Join thousands of job seekers who used JobSync to get past ATS
            filters and land interviews at top companies. Free, forever.
          </p>

          <Link
            href="/signup"
            className="inline-flex items-center gap-2 bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[15px] font-medium px-8 py-3.5 rounded-xl transition-all hover:scale-[1.02] active:scale-[0.98] glow-accent"
          >
            Start for free
            <ArrowRight className="w-4 h-4" />
          </Link>

          <p className="text-[12px] text-[var(--text-muted)] mt-4">
            No credit card required · Setup in 2 minutes
          </p>
        </motion.div>
      </div>
    </section>
  );
}
