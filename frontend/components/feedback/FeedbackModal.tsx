"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Star, Send, CheckCircle2, Sparkles } from "lucide-react";

interface FeedbackModalProps {
  open: boolean;
  feature: string;
  analysisId?: string;
  onClose: () => void;
}

export function FeedbackModal({ open, feature, analysisId, onClose }: FeedbackModalProps) {
  const [rating, setRating]     = useState(0);
  const [hovered, setHovered]   = useState(0);
  const [feedback, setFeedback] = useState("");
  const [loading, setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(false);

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
    setTimeout(onClose, 2200);
  }

  const FEATURE_LABEL: Record<string, string> = {
    ats_analysis:  "ATS Analysis",
    resume_build:  "Resume Builder",
    cover_letter:  "Cover Letter",
    interview:     "AI Interview",
    skill_gap:     "Skill Gap Analysis",
  };

  const displayFeature = FEATURE_LABEL[feature] ?? feature;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 z-[900] bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="fixed z-[901] bottom-6 right-6 w-[360px] rounded-2xl overflow-hidden shadow-2xl"
            style={{
              background: "linear-gradient(135deg,rgba(18,18,30,0.98),rgba(10,10,18,0.98))",
              border: "1px solid rgba(192,88,0,0.25)",
              boxShadow: "0 0 60px rgba(192,88,0,0.12), 0 24px 48px rgba(0,0,0,0.5)",
            }}
            initial={{ opacity: 0, y: 24, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <AnimatePresence mode="wait">
              {submitted ? (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center gap-3 p-8 text-center"
                >
                  <div className="w-14 h-14 rounded-full flex items-center justify-center mb-1"
                    style={{ background: "rgba(122,184,64,0.15)", border: "1px solid rgba(122,184,64,0.3)" }}>
                    <CheckCircle2 size={28} style={{ color: "#7ab840" }} />
                  </div>
                  <p className="text-[15px] font-semibold text-white">Thanks for the feedback!</p>
                  <p className="text-[12px]" style={{ color: "rgba(148,163,184,0.7)" }}>
                    It helps us make JobSynk AI smarter.
                  </p>
                </motion.div>
              ) : (
                <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  {/* Header */}
                  <div className="flex items-start justify-between p-5 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center"
                        style={{ background: "rgba(192,88,0,0.15)", border: "1px solid rgba(192,88,0,0.25)" }}>
                        <Sparkles size={13} style={{ color: "#d97020" }} />
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-white leading-tight">Rate this result</p>
                        <p className="text-[11px]" style={{ color: "rgba(148,163,184,0.6)" }}>{displayFeature}</p>
                      </div>
                    </div>
                    <button onClick={onClose}
                      className="p-1 rounded-lg hover:bg-white/8 transition-colors"
                      style={{ color: "rgba(148,163,184,0.5)" }}>
                      <X size={15} />
                    </button>
                  </div>

                  <div className="px-5 pb-5 space-y-4">
                    {/* Stars */}
                    <div className="flex items-center justify-center gap-2 py-2">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <motion.button
                          key={star}
                          whileHover={{ scale: 1.2 }}
                          whileTap={{ scale: 0.9 }}
                          onMouseEnter={() => setHovered(star)}
                          onMouseLeave={() => setHovered(0)}
                          onClick={() => setRating(star)}
                          className="transition-colors"
                        >
                          <Star
                            size={28}
                            fill={(hovered || rating) >= star ? "#d4aa30" : "none"}
                            style={{
                              color: (hovered || rating) >= star ? "#d4aa30" : "rgba(100,116,139,0.5)",
                              transition: "color 0.15s, fill 0.15s",
                            }}
                          />
                        </motion.button>
                      ))}
                    </div>

                    {/* Star labels */}
                    <p className="text-[11px] text-center" style={{ color: "rgba(148,163,184,0.5)" }}>
                      {rating === 0 ? "Tap a star to rate" : ["", "Poor", "Fair", "Good", "Great", "Excellent!"][rating]}
                    </p>

                    {/* Feedback text */}
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="What could be better? (optional)"
                      rows={3}
                      maxLength={500}
                      className="w-full px-3 py-2.5 rounded-xl text-[12px] resize-none focus:outline-none transition-colors placeholder:text-[rgba(100,116,139,0.5)]"
                      style={{
                        background: "rgba(255,255,255,0.04)",
                        border: "1px solid rgba(255,255,255,0.08)",
                        color: "rgba(226,232,240,0.9)",
                      }}
                      onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(192,88,0,0.4)")}
                      onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
                    />

                    {/* Submit */}
                    <motion.button
                      onClick={handleSubmit}
                      disabled={!rating || loading}
                      whileHover={rating ? { scale: 1.02 } : {}}
                      whileTap={rating ? { scale: 0.98 } : {}}
                      className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                      style={{ background: rating ? "linear-gradient(135deg,#C05800,#713600)" : "rgba(255,255,255,0.06)" }}
                    >
                      {loading ? (
                        <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      ) : (
                        <><Send size={13} /> Submit Feedback</>
                      )}
                    </motion.button>

                    <button onClick={onClose}
                      className="w-full text-[11px] py-1 transition-colors hover:text-white"
                      style={{ color: "rgba(100,116,139,0.5)" }}>
                      Skip
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
