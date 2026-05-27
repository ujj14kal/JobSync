"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";

export default function CTASection() {
  return (
    <section className="section-sm relative overflow-hidden">
      {/* Background */}
      <div
        className="absolute inset-0"
        style={{
          background: "radial-gradient(ellipse at 50% 50%, rgba(59,130,246,0.08) 0%, rgba(139,92,246,0.06) 40%, transparent 70%)",
        }}
      />
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(59,130,246,0.3), rgba(139,92,246,0.3), transparent)" }}
      />

      <div className="container-lg relative text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        >
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium mb-8"
            style={{
              background: "rgba(139,92,246,0.1)",
              border: "1px solid rgba(139,92,246,0.25)",
              color: "#a78bfa",
            }}
          >
            <Sparkles size={14} />
            Start for free · No credit card
          </div>

          <h2 className="text-5xl sm:text-6xl font-bold text-primary mb-6 leading-tight">
            Your dream job is{" "}
            <span className="gradient-cyan-blue">one analysis away</span>
          </h2>

          <p className="text-xl text-secondary max-w-2xl mx-auto mb-10">
            Join 2,400+ engineers who used JobSync's AI to land roles at Google, Stripe,
            Anthropic, and more. Analyze your first resume free.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/signup">
              <motion.button
                className="btn-primary text-base px-10 py-4"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                Analyze My Resume — Free
                <ArrowRight size={18} />
              </motion.button>
            </Link>
            <div className="text-sm text-muted">Results in under 10 seconds</div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
