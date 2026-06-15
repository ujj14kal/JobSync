"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronUp, Send, Star, CheckCircle2, MessageSquareHeart } from "lucide-react";
import { useFeedback } from "./FeedbackProvider";

const FEATURE_LABEL: Record<string, string> = {
  ats_analysis: "ATS Analysis",
  resume_build: "Resume Builder",
  cover_letter: "Cover Letter",
  interview:    "AI Interview",
  skill_gap:    "Skill Gap Analysis",
  job_search:   "Job Search",
  ai_lab:       "AI Lab",
};

interface FeedbackBannerProps {
  feature: string;
  analysisId?: string;
}

export function FeedbackBanner({ feature, analysisId }: FeedbackBannerProps) {
  const { hasDenied, hasSubmitted, submitFeedback } = useFeedback();
  const [visible,   setVisible]   = useState(false);
  const [expanded,  setExpanded]  = useState(false);
  const [rating,    setRating]    = useState(0);
  const [hovered,   setHovered]   = useState(0);
  const [text,      setText]      = useState("");
  const [loading,   setLoading]   = useState(false);
  const [done,      setDone]      = useState(false);

  // Evaluate visibility only on client (localStorage access)
  useEffect(() => {
    setVisible(hasDenied(feature) && !hasSubmitted(feature));
    setDone(hasSubmitted(feature));
  }, [feature, hasDenied, hasSubmitted]);

  if (!visible || done) return null;

  async function handleSubmit() {
    if (!rating) return;
    setLoading(true);
    try {
      await submitFeedback({ feature, analysisId, rating, feedback: text });
    } catch {}
    setLoading(false);
    setDone(true);
    setVisible(false);
  }

  const label = FEATURE_LABEL[feature] ?? feature;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="mt-10 rounded-2xl overflow-hidden"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          {/* Collapsed header — always visible */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(192,88,0,0.10)", border: "1px solid rgba(192,88,0,0.18)" }}>
                <MessageSquareHeart size={15} style={{ color: "#C05800" }} />
              </div>
              <div className="text-left">
                <p className="text-[13px] font-semibold text-[var(--text-primary)] leading-tight">
                  Share your {label} feedback
                </p>
                <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
                  Takes 10 seconds · helps us improve
                </p>
              </div>
            </div>
            <span className="text-[var(--text-muted)]">
              {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            </span>
          </button>

          {/* Expanded form */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="overflow-hidden"
              >
                <div className="px-5 pb-5 pt-1 space-y-4 border-t border-[var(--border-subtle)]">
                  {/* Stars */}
                  <div className="flex items-center gap-2 pt-2">
                    {[1, 2, 3, 4, 5].map(star => (
                      <motion.button
                        key={star}
                        whileHover={{ scale: 1.15 }}
                        whileTap={{ scale: 0.9 }}
                        onMouseEnter={() => setHovered(star)}
                        onMouseLeave={() => setHovered(0)}
                        onClick={() => setRating(star)}
                      >
                        <Star
                          size={26}
                          fill={(hovered || rating) >= star ? "#d4aa30" : "none"}
                          style={{
                            color: (hovered || rating) >= star ? "#d4aa30" : "rgba(100,116,139,0.4)",
                            transition: "color 0.12s, fill 0.12s",
                          }}
                        />
                      </motion.button>
                    ))}
                    {rating > 0 && (
                      <span className="text-[11px] ml-1" style={{ color: "rgba(148,163,184,0.55)" }}>
                        {["", "Poor", "Fair", "Good", "Great", "Excellent!"][rating]}
                      </span>
                    )}
                  </div>

                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    placeholder="What could be better? (optional)"
                    rows={2}
                    maxLength={500}
                    className="w-full px-3 py-2.5 rounded-xl text-[12px] resize-none focus:outline-none transition-colors placeholder:text-[rgba(100,116,139,0.4)]"
                    style={{
                      background: "var(--bg-elevated)",
                      border: "1px solid var(--border-subtle)",
                      color: "var(--text-primary)",
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = "rgba(192,88,0,0.38)")}
                    onBlur={e => (e.currentTarget.style.borderColor = "var(--border-subtle)")}
                  />

                  <div className="flex items-center gap-3">
                    <motion.button
                      onClick={handleSubmit}
                      disabled={!rating || loading}
                      whileHover={rating ? { scale: 1.02 } : {}}
                      whileTap={rating ? { scale: 0.97 } : {}}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl text-[12px] font-bold text-white transition-all disabled:opacity-35"
                      style={{ background: rating ? "linear-gradient(135deg,#C05800,#713600)" : "rgba(255,255,255,0.06)" }}
                    >
                      {loading
                        ? <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        : <><Send size={12} /> Submit</>
                      }
                    </motion.button>
                    <button
                      onClick={() => setVisible(false)}
                      className="text-[11px] transition-colors"
                      style={{ color: "rgba(100,116,139,0.45)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "rgba(148,163,184,0.7)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "rgba(100,116,139,0.45)")}>
                      Dismiss
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
