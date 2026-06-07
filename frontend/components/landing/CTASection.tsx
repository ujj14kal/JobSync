"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export default function CTASection() {
  const ref = useRef<HTMLDivElement>(null);

  /* ── Scroll-driven parallax layers at different depths ── */
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });

  // Far background orb (slowest)
  const orb1Y = useTransform(scrollYProgress, [0, 1], ["-40%", "40%"]);
  const orb1X = useTransform(scrollYProgress, [0, 1], ["-5%", "5%"]);
  // Mid orb
  const orb2Y = useTransform(scrollYProgress, [0, 1], ["30%", "-30%"]);
  const orb2X = useTransform(scrollYProgress, [0, 1], ["5%", "-5%"]);
  // Near orb (fastest)
  const orb3Y = useTransform(scrollYProgress, [0, 1], ["-20%", "50%"]);
  // Content subtle drift
  const contentY = useTransform(scrollYProgress, [0, 1], ["-10px", "10px"]);

  return (
    <section ref={ref} className="section-sm relative overflow-hidden">
      {/* ── Multi-layer parallax background ── */}

      {/* Layer 1 — large far orb (brand orange) */}
      <motion.div
        className="absolute w-[800px] h-[700px] rounded-full pointer-events-none blur-[120px]"
        style={{
          x: orb1X,
          y: orb1Y,
          background: "radial-gradient(ellipse, rgba(192,88,0,0.14) 0%, rgba(192,88,0,0.04) 50%, transparent 70%)",
          left: "50%",
          top: "50%",
          translateX: "-50%",
          translateY: "-50%",
        }}
      />

      {/* Layer 2 — mid orb (gold) — opposite direction */}
      <motion.div
        className="absolute w-[500px] h-[400px] rounded-full pointer-events-none blur-[90px]"
        style={{
          x: orb2X,
          y: orb2Y,
          background: "radial-gradient(circle, rgba(212,170,48,0.10) 0%, transparent 70%)",
          right: "-5%",
          top: "20%",
        }}
      />

      {/* Layer 3 — small near orb (green) — fastest */}
      <motion.div
        className="absolute w-[300px] h-[300px] rounded-full pointer-events-none blur-[70px]"
        style={{
          y: orb3Y,
          background: "radial-gradient(circle, rgba(122,184,64,0.08) 0%, transparent 70%)",
          left: "5%",
          bottom: "10%",
        }}
      />

      {/* Top separator line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(192,88,0,0.4), rgba(212,170,48,0.3), transparent)" }}
      />

      {/* ── Content (subtle vertical drift) ── */}
      <motion.div
        className="container-lg relative text-center"
        style={{ y: contentY }}
      >
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Badge */}
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-8"
            style={{
              background: "rgba(192,88,0,0.10)",
              border: "1px solid rgba(192,88,0,0.28)",
              color: "#e89848",
            }}
          >
            <Sparkles size={14} />
            Start for free · No credit card
          </div>

          <h2 className="text-5xl sm:text-6xl font-bold text-primary mb-6 leading-tight">
            Stop guessing.{" "}
            <span className="gradient-blue">Start knowing.</span>
          </h2>

          <p className="text-xl text-secondary max-w-2xl mx-auto mb-10">
            Paste a job URL, upload your resume, and get a full AI-powered ATS analysis in under 30 seconds.
            Free forever. No credit card. No fluff.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <motion.button
                className="btn-primary text-base px-10 py-4"
                whileHover={{ scale: 1.04, boxShadow: "0 0 40px rgba(192,88,0,0.35)" }}
                whileTap={{ scale: 0.97 }}
              >
                Analyze My Resume — Free
                <ArrowRight size={18} />
              </motion.button>
            </Link>
            <div className="text-sm text-muted">Results in under 10 seconds</div>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
