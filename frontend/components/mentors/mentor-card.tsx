"use client";

import { motion } from "framer-motion";
import { ExternalLink, Gift, DollarSign, ArrowRight } from "lucide-react";
import type { Mentor } from "@/lib/types";

interface MentorCardProps {
  mentor: Mentor;
  index?: number;
}

const platformMeta: Record<string, { label: string; badgeClass: string; glow: string; logo: string }> = {
  adplist:      { label: "ADPList",      badgeClass: "text-blue-400 bg-blue-400/10 border-blue-400/25",        glow: "rgba(59,130,246,0.07)",    logo: "🔵" },
  unstop:       { label: "Unstop",       badgeClass: "text-amber-400 bg-amber-400/10 border-amber-400/25",     glow: "rgba(251,191,36,0.07)",    logo: "🟡" },
  topmate:      { label: "Topmate",      badgeClass: "text-emerald-400 bg-emerald-400/10 border-emerald-400/25", glow: "rgba(52,211,153,0.07)",  logo: "🟢" },
  mentorcruise: { label: "MentorCruise", badgeClass: "text-orange-400 bg-orange-400/10 border-orange-400/25",  glow: "rgba(251,146,60,0.07)",    logo: "🟠" },
  linkedin:     { label: "LinkedIn",     badgeClass: "text-sky-400 bg-sky-400/10 border-sky-400/25",           glow: "rgba(14,165,233,0.07)",    logo: "🔷" },
  other:        { label: "Other",        badgeClass: "text-[var(--text-muted)] bg-[var(--bg-overlay)] border-[var(--border-subtle)]", glow: "transparent", logo: "⬜" },
};

export function MentorCard({ mentor, index = 0 }: MentorCardProps) {
  const pm = platformMeta[mentor.platform] ?? platformMeta.other;

  return (
    <motion.a
      href={mentor.profile_url}
      target="_blank"
      rel="noopener noreferrer"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.07, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="group block p-5 rounded-2xl border border-[var(--border-default)] hover:border-[var(--accent-primary)]/40 transition-all duration-200 cursor-pointer"
      style={{
        background: `radial-gradient(ellipse at 0% 0%, ${pm.glow} 0%, var(--bg-surface) 65%)`,
      }}
    >
      {/* Top row */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <span className={`text-[10px] px-2.5 py-1 rounded-full border font-semibold uppercase tracking-wide ${pm.badgeClass}`}>
          {pm.label}
        </span>
        {mentor.is_free ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-[10px] font-bold text-emerald-400">
            <Gift className="w-3 h-3" /> Free
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 text-[10px] font-bold text-amber-400">
            <DollarSign className="w-3 h-3" />
            {mentor.price_display || "Paid"}
          </span>
        )}
      </div>

      {/* Role headline */}
      <h3 className="text-[14px] font-semibold text-[var(--text-primary)] mb-2 group-hover:text-[var(--accent-hover)] transition-colors leading-snug">
        {mentor.name.replace(` — ${mentor.title.replace("Find ", "").replace(" mentors", "")}`, "")}
      </h3>

      {/* Description */}
      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed mb-4 line-clamp-3">
        {mentor.bio}
      </p>

      {/* Specializations */}
      {mentor.specializations && mentor.specializations.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {mentor.specializations.slice(0, 4).map((s: string) => (
            <span
              key={s}
              className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)]"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Session format */}
      <p className="text-[11px] text-[var(--text-muted)] mb-4">{mentor.session_format}</p>

      {/* CTA */}
      <div className="flex items-center justify-end">
        <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] group-hover:bg-[var(--accent-hover)] text-white text-[12px] font-semibold transition-colors">
          Find mentors
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </span>
      </div>
    </motion.a>
  );
}
