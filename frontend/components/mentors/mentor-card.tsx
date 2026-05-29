"use client";

import { motion } from "framer-motion";
import { ExternalLink, Star, Briefcase, CheckCircle2, DollarSign, Gift, Brain } from "lucide-react";
import type { Mentor } from "@/lib/types";
import Image from "next/image";

interface MentorCardProps {
  mentor: Mentor;
  index?: number;
}

const platformConfig: Record<string, { label: string; color: string }> = {
  unstop:      { label: "Unstop",       color: "text-purple-400 bg-purple-400/10 border-purple-400/20" },
  adplist:     { label: "ADPList",      color: "text-blue-400 bg-blue-400/10 border-blue-400/20" },
  linkedin:    { label: "LinkedIn",     color: "text-sky-400 bg-sky-400/10 border-sky-400/20" },
  mentorcruise:{ label: "MentorCruise", color: "text-orange-400 bg-orange-400/10 border-orange-400/20" },
  toptal:      { label: "Toptal",       color: "text-emerald-400 bg-emerald-400/10 border-emerald-400/20" },
  other:       { label: "Other",        color: "text-[var(--text-muted)] bg-[var(--bg-overlay)] border-[var(--border-subtle)]" },
};

export function MentorCard({ mentor, index = 0 }: MentorCardProps) {
  const platform = platformConfig[mentor.platform] ?? platformConfig.other;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, duration: 0.4 }}
      className="group p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] transition-all duration-200"
    >
      {/* Header */}
      <div className="flex items-start gap-3 mb-4">
        {/* Avatar */}
        <div className="relative flex-shrink-0">
          {mentor.avatar_url ? (
            <Image
              src={mentor.avatar_url}
              alt={mentor.name}
              width={44}
              height={44}
              className="w-11 h-11 rounded-xl object-cover"
            />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-[var(--accent-muted)] flex items-center justify-center">
              <span className="text-[14px] font-semibold text-[var(--accent-hover)]">
                {mentor.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
              </span>
            </div>
          )}
          {mentor.is_verified && (
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 flex items-center justify-center">
              <CheckCircle2 className="w-2.5 h-2.5 text-white" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold text-[var(--text-primary)]">
              {mentor.name}
            </span>
            {mentor.match_score !== undefined && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 font-medium">
                {Math.round(mentor.match_score * 100)}% match
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)] mt-0.5">
            <Briefcase className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">
              {mentor.title} at {mentor.company}
            </span>
          </div>
        </div>

        {/* Platform badge */}
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium flex-shrink-0 ${platform.color}`}>
          {platform.label}
        </span>
      </div>

      {/* Bio */}
      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed mb-4 line-clamp-2">
        {mentor.bio}
      </p>

      {/* Specializations */}
      {mentor.specializations.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-4">
          {mentor.specializations.slice(0, 5).map((spec) => (
            <span
              key={spec}
              className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-overlay)] border border-[var(--border-subtle)] text-[var(--text-secondary)]"
            >
              {spec}
            </span>
          ))}
          {mentor.specializations.length > 5 && (
            <span className="text-[11px] text-[var(--text-muted)]">
              +{mentor.specializations.length - 5}
            </span>
          )}
        </div>
      )}

      {/* Match reasons */}
      {mentor.match_reasons && mentor.match_reasons.length > 0 && (
        <div className="mb-4 p-3 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent-primary)]/10">
          <div className="flex items-center gap-1.5 mb-1.5">
            <Brain className="w-3 h-3 text-[var(--accent-primary)]" />
            <span className="text-[10px] font-medium text-[var(--accent-primary)] uppercase tracking-wider">
              Matched by JobSync AI
            </span>
          </div>
          {mentor.match_reasons.slice(0, 2).map((reason) => (
            <div key={reason} className="flex items-start gap-1.5 text-[11px] text-[var(--text-secondary)]">
              <div className="w-1 h-1 rounded-full bg-[var(--accent-primary)] mt-1.5 flex-shrink-0" />
              {reason}
            </div>
          ))}
        </div>
      )}

      {/* Pricing badge */}
      <div className="mb-3">
        {mentor.is_free ? (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-[11px] font-semibold text-emerald-400">
            <Gift className="w-3 h-3" /> Free
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400/10 border border-amber-400/20 text-[11px] font-semibold text-amber-400">
            <DollarSign className="w-3 h-3" />
            {mentor.price_display || "Paid"}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
          {mentor.rating && (
            <span className="flex items-center gap-1">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
              {mentor.rating.toFixed(1)}
              {mentor.review_count && (
                <span>({mentor.review_count})</span>
              )}
            </span>
          )}
          <span>{mentor.availability}</span>
          <span>{mentor.session_format}</span>
        </div>

        <a
          href={mentor.profile_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[12px] font-medium transition-colors"
        >
          View profile
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </motion.div>
  );
}
