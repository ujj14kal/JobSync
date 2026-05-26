"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { Upload, Search, BarChart2, Sparkles } from "lucide-react";

const steps = [
  {
    number: "01",
    icon: Upload,
    title: "Upload your resume",
    description:
      "Drop a PDF or DOCX. Our parser extracts every section — work experience, skills, projects, education — with 95%+ accuracy.",
  },
  {
    number: "02",
    icon: Search,
    title: "Enter the target role",
    description:
      "Type the company and job title. We automatically scrape the actual job listing, extract requirements, skills, and responsibilities.",
  },
  {
    number: "03",
    icon: BarChart2,
    title: "Get your ATS scores",
    description:
      "Receive 5 distinct scores covering ATS compatibility, technical fit, semantic alignment, recruiter impression, and project relevance.",
  },
  {
    number: "04",
    icon: Sparkles,
    title: "Improve and reapply",
    description:
      "AI rewrites your weak bullet points, fills skill gaps, recommends mentors, and gives you a roadmap to a top-tier application.",
  },
];

export function HowItWorks() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="how-it-works" className="py-28 px-6 border-t border-[var(--border-subtle)]" ref={ref}>
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] text-[12px] text-[var(--text-secondary)] mb-4">
            Simple 4-step process
          </div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-[var(--text-primary)] mb-4">
            From upload to offer-ready
            <br />
            in minutes
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 relative">
          {/* Connector line */}
          <div className="hidden md:block absolute top-10 left-[12.5%] right-[12.5%] h-px bg-gradient-to-r from-transparent via-[var(--border-default)] to-transparent" />

          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative flex flex-col items-center text-center p-6"
            >
              {/* Step icon bubble */}
              <div className="w-20 h-20 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-default)] flex items-center justify-center mb-6 relative z-10">
                <step.icon className="w-7 h-7 text-[var(--accent-primary)]" />
                <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-[var(--accent-primary)] flex items-center justify-center">
                  <span className="text-[9px] font-bold text-white">
                    {step.number.replace("0", "")}
                  </span>
                </div>
              </div>

              <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-2">
                {step.title}
              </h3>
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
