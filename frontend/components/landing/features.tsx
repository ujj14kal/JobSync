"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import {
  Brain,
  Search,
  FileText,
  Target,
  Users,
  TrendingUp,
  Zap,
  BarChart2,
} from "lucide-react";

const features = [
  {
    icon: Brain,
    title: "Semantic ATS Scoring",
    description:
      "Goes beyond keyword matching. Understands context and meaning to score how well your experience aligns with what recruiters actually want.",
    accent: "indigo",
    badge: "AI-Powered",
  },
  {
    icon: Search,
    title: "Auto Job Scraping",
    description:
      "Enter a company name and role. JobSync finds the real job listing, scrapes requirements, extracts skills, and formats everything automatically.",
    accent: "violet",
    badge: "Web Automation",
  },
  {
    icon: FileText,
    title: "Recruiter-Style Feedback",
    description:
      "Get feedback written as if a senior recruiter reviewed your resume. Specific, actionable, and brutally honest.",
    accent: "blue",
    badge: "LLM Feedback",
  },
  {
    icon: Target,
    title: "Skill Gap Analysis",
    description:
      "Identifies every skill, keyword, and experience gap between your resume and the role — ranked by importance to the recruiter.",
    accent: "cyan",
    badge: "Gap Detection",
  },
  {
    icon: Zap,
    title: "Resume Rewriter",
    description:
      "AI rewrites your bullet points with stronger action verbs, quantifiable metrics, and role-specific language that ATS systems reward.",
    accent: "emerald",
    badge: "Auto-Rewrite",
  },
  {
    icon: Users,
    title: "Mentor Discovery",
    description:
      "Matched with real mentors from Unstop and ADPList based on your target role, company, skill gaps, and career stage.",
    accent: "amber",
    badge: "Smart Matching",
  },
  {
    icon: BarChart2,
    title: "Multi-Dimension Scores",
    description:
      "Five distinct scores: ATS Compatibility, Technical Fit, Semantic Match, Recruiter Impression, and Project Relevance.",
    accent: "rose",
    badge: "5 Scores",
  },
  {
    icon: TrendingUp,
    title: "Career Insights",
    description:
      "Real-time industry trends, trending skills, salary data, and career path recommendations tailored to your target role.",
    accent: "orange",
    badge: "Market Data",
  },
];

const accentMap: Record<string, string> = {
  indigo: "text-indigo-400 bg-indigo-400/10 border-indigo-400/20",
  violet: "text-violet-400 bg-violet-400/10 border-violet-400/20",
  blue: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  cyan: "text-cyan-400 bg-cyan-400/10 border-cyan-400/20",
  emerald: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20",
  amber: "text-amber-400 bg-amber-400/10 border-amber-400/20",
  rose: "text-rose-400 bg-rose-400/10 border-rose-400/20",
  orange: "text-orange-400 bg-orange-400/10 border-orange-400/20",
};

const iconColorMap: Record<string, string> = {
  indigo: "text-indigo-400",
  violet: "text-violet-400",
  blue: "text-blue-400",
  cyan: "text-cyan-400",
  emerald: "text-emerald-400",
  amber: "text-amber-400",
  rose: "text-rose-400",
  orange: "text-orange-400",
};

export function Features() {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section id="features" className="py-28 px-6" ref={ref}>
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--border-default)] bg-[var(--bg-surface)] text-[12px] text-[var(--text-secondary)] mb-4">
            Everything you need
          </div>
          <h2 className="text-4xl md:text-5xl font-bold tracking-tight text-[var(--text-primary)] mb-4">
            Every tool a serious
            <br />
            job seeker needs
          </h2>
          <p className="text-[var(--text-secondary)] text-lg max-w-xl mx-auto">
            From semantic ATS analysis to AI-rewritten bullets — JobSync covers
            every stage of the job application process.
          </p>
        </motion.div>

        {/* Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.4, delay: i * 0.05 }}
              className="group p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)] transition-all duration-200"
            >
              {/* Icon */}
              <div className="mb-4">
                <feature.icon
                  className={`w-5 h-5 ${iconColorMap[feature.accent]}`}
                />
              </div>

              {/* Badge */}
              <div className="mb-3">
                <span
                  className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${accentMap[feature.accent]}`}
                >
                  {feature.badge}
                </span>
              </div>

              <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-2">
                {feature.title}
              </h3>
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
