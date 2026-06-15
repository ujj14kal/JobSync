"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, Send, CheckCircle2, MessageSquareHeart } from "lucide-react";

const FEATURE_LABEL: Record<string, string> = {
  ats_analysis: "ATS Analysis",
  resume_build: "Resume Builder",
  cover_letter: "Cover Letter",
  interview:    "AI Interview",
  skill_gap:    "Skill Gap Analysis",
  job_search:   "Job Search",
  ai_lab:       "AI Lab",
};

interface FeedbackModalProps {
  open: boolean;
  feature: string;
  analysisId?: string;
  onClose: () => void;
  onSubmitted?: () => void;
}

export function FeedbackModal({ open, feature, analysisId, onClose, onSubmitted }: FeedbackModalProps) {
  const [rating,    setRating]    = useState(0);
  const [hovered,   setHovered]   = useState(0);
  const [feedback,  setFeedback]  = useState("");
  const [loading,   setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const displayFeature = FEATURE_LABEL[feature] ?? feature;

  async function handleSubmit() {
    if (!rating) return;
    setLoading(true);
    try {
      await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, feedback, feature, analysisId }),
      });
    } catch {}
    setSubmitted(true);
    setLoading(false);
    setTimeout(() => {
      onSubmitted?.();
      onClose();
      setSubmitted(false);
      setRating(0);
      setFeedback("");
    }, 2000);
  }

  function handleClose() {
    setRating(0);
    setFeedback("");
    setSubmitted(false);
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          key="fb-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[950] flex items-center justify-center p-4"
          style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)" }}
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.93, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            className="relative w-full max-w-md rounded-3xl overflow-hidden"
            style={{
              background: "linear-gradient(145deg,rgba(18,18,30,0.98),rgba(10,10,18,0.99))",
              border: "1px solid rgba(192,88,0,0.22)",
              boxShadow: "0 0 80px rgba(192,88,0,0.10), 0 32px 64px rgba(0,0,0,0.6)",
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* Accent bar */}
            <div className="h-[2px] w-full"
              style={{ background: "linear-gradient(90deg,transparent,#C05800,transparent)" }} />

            <AnimatePresence mode="wait">
              {submitted ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center gap-4 px-8 py-12 text-center"
                >
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                    style={{ background: "rgba(122,184,64,0.12)", border: "1px solid rgba(122,184,64,0.28)" }}>
                    <CheckCircle2 size={30} style={{ color: "#7ab840" }} />
                  </div>
                  <div>
                    <p className="text-[17px] font-bold text-white mb-1">Thanks for the feedback!</p>
                    <p className="text-[13px]" style={{ color: "rgba(148,163,184,0.65)" }}>
                      It helps us make JobSynk smarter for everyone.
                    </p>
                  </div>
                </motion.div>
              ) : (
                <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {/* Header */}
                  <div className="flex items-start justify-between px-7 pt-7 pb-2">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style={{ background: "rgba(192,88,0,0.12)", border: "1px solid rgba(192,88,0,0.22)" }}>
                        <MessageSquareHeart size={18} style={{ color: "#d97020" }} />
                      </div>
                      <div>
                        <p className="text-[15px] font-bold text-white leading-tight">How did it go?</p>
                        <p className="text-[12px] mt-0.5" style={{ color: "rgba(148,163,184,0.55)" }}>
                          Quick feedback on your {displayFeature} session
                        </p>
                      </div>
                    </div>
                    <button onClick={handleClose}
                      className="p-1.5 rounded-xl transition-colors hover:bg-white/8 flex-shrink-0"
                      style={{ color: "rgba(148,163,184,0.45)" }}>
                      <X size={16} />
                    </button>
                  </div>

                  <div className="px-7 pb-7 pt-4 space-y-5">
                    {/* Stars */}
                    <div className="flex flex-col items-center gap-3 py-2">
                      <div className="flex items-center gap-3">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <motion.button
                            key={star}
                            whileHover={{ scale: 1.18 }}
                            whileTap={{ scale: 0.88 }}
                            onMouseEnter={() => setHovered(star)}
                            onMouseLeave={() => setHovered(0)}
                            onClick={() => setRating(star)}
                          >
                            <Star
                              size={34}
                              fill={(hovered || rating) >= star ? "#d4aa30" : "none"}
                              style={{
                                color: (hovered || rating) >= star ? "#d4aa30" : "rgba(100,116,139,0.4)",
                                transition: "color 0.12s, fill 0.12s",
                              }}
                            />
                          </motion.button>
                        ))}
                      </div>
                      <p className="text-[12px]" style={{ color: "rgba(148,163,184,0.5)" }}>
                        {rating === 0
                          ? "Tap a star to rate"
                          : ["", "Poor", "Fair", "Good", "Great", "Excellent!"][rating]}
                      </p>
                    </div>

                    {/* Text */}
                    <textarea
                      value={feedback}
                      onChange={e => setFeedback(e.target.value)}
                      placeholder="What could be better? (optional)"
                      rows={3}
                      maxLength={500}
                      className="w-full px-4 py-3 rounded-2xl text-[13px] resize-none focus:outline-none transition-colors placeholder:text-[rgba(100,116,139,0.45)]"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "rgba(226,232,240,0.9)",
                      }}
                      onFocus={e => (e.currentTarget.style.borderColor = "rgba(192,88,0,0.38)")}
                      onBlur={e => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
                    />

                    {/* Submit */}
                    <motion.button
                      onClick={handleSubmit}
                      disabled={!rating || loading}
                      whileHover={rating ? { scale: 1.02 } : {}}
                      whileTap={rating ? { scale: 0.98 } : {}}
                      className="w-full py-3 rounded-2xl text-[14px] font-bold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-35"
                      style={{ background: rating ? "linear-gradient(135deg,#C05800,#713600)" : "rgba(255,255,255,0.06)" }}
                    >
                      {loading
                        ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                        : <><Send size={14} /> Send Feedback</>
                      }
                    </motion.button>

                    <button onClick={handleClose}
                      className="w-full text-[12px] py-1 transition-colors"
                      style={{ color: "rgba(100,116,139,0.45)" }}
                      onMouseEnter={e => (e.currentTarget.style.color = "rgba(148,163,184,0.8)")}
                      onMouseLeave={e => (e.currentTarget.style.color = "rgba(100,116,139,0.45)")}>
                      Maybe later
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
