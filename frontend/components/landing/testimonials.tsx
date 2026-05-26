"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Star } from "lucide-react";

const testimonials = [
  {
    quote:
      "JobSync told me I was missing 'distributed systems' and 'Kubernetes' keywords. I added relevant experience, reapplied, and got a Google interview in 2 weeks.",
    name: "Arjun Mehta",
    role: "SWE → Google L4",
    avatar: "AM",
    company: "Google",
    score: 89,
  },
  {
    quote:
      "The recruiter impression score is gold. It told me my bullet points lacked metrics — the AI rewrites were genuinely better. I felt the difference immediately.",
    name: "Priya Sharma",
    role: "PM → Meta APM",
    avatar: "PS",
    company: "Meta",
    score: 82,
  },
  {
    quote:
      "I uploaded my resume and got matched with a mentor at Stripe who had the exact same background. Had two sessions, landed the role 3 months later.",
    name: "Carlos Rivera",
    role: "Backend → Stripe",
    avatar: "CR",
    company: "Stripe",
    score: 91,
  },
  {
    quote:
      "The semantic match score is more accurate than any other ATS tool I've tried. It understands that 'ML pipelines' and 'machine learning infrastructure' mean the same thing.",
    name: "Lin Wei",
    role: "Data Scientist → OpenAI",
    avatar: "LW",
    company: "OpenAI",
    score: 85,
  },
  {
    quote:
      "Skill gap analysis showed I needed system design experience. The mentor matched me with someone who coached me through it. Got the offer 6 weeks later.",
    name: "Aisha Johnson",
    role: "SWE → Amazon SDE II",
    avatar: "AJ",
    company: "Amazon",
    score: 77,
  },
  {
    quote:
      "I went from 12% ATS score to 81% after following the improvement suggestions. The keyword insertion feels natural, not stuffed.",
    name: "Raj Patel",
    role: "Recent grad → Microsoft",
    avatar: "RP",
    company: "Microsoft",
    score: 81,
  },
];

export function Testimonials() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section className="py-28 px-6 border-t border-[var(--border-subtle)]" ref={ref}>
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl font-bold tracking-tight text-[var(--text-primary)] mb-3">
            Trusted by job seekers
            <br />
            at top companies
          </h2>
          <p className="text-[var(--text-secondary)] text-base">
            Real results from real people who optimized with JobSync.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {testimonials.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.06 }}
              className="p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-default)] transition-colors"
            >
              {/* Stars */}
              <div className="flex gap-0.5 mb-4">
                {[...Array(5)].map((_, j) => (
                  <Star
                    key={j}
                    className="w-3.5 h-3.5 text-amber-400 fill-amber-400"
                  />
                ))}
              </div>

              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed mb-4">
                "{t.quote}"
              </p>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-[var(--accent-muted)] border border-[var(--accent-primary)]/30 flex items-center justify-center">
                    <span className="text-[10px] font-semibold text-[var(--accent-hover)]">
                      {t.avatar}
                    </span>
                  </div>
                  <div>
                    <div className="text-[12px] font-medium text-[var(--text-primary)]">
                      {t.name}
                    </div>
                    <div className="text-[11px] text-[var(--text-muted)]">
                      {t.role}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-[var(--text-muted)]">
                    Final score
                  </div>
                  <div className="text-[13px] font-bold text-emerald-400">
                    {t.score}/100
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
