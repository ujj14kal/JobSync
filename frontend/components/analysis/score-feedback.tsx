"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ThumbsUp, ThumbsDown, CheckCircle2, ChevronDown } from "lucide-react";
import { apiClient } from "@/lib/api/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const OUTCOMES = [
  { value: "got_interview",  label: "Got an interview 🎉",       positive: true },
  { value: "screening_call", label: "Screening call received",   positive: true },
  { value: "offer",          label: "Got an offer! 🎊",          positive: true },
  { value: "no_response",    label: "No response yet",           positive: false },
  { value: "rejected",       label: "Application rejected",      positive: false },
  { value: "withdrew",       label: "I withdrew",                positive: false },
];

interface Props {
  analysisId: string;
  jobTitle?: string;
}

export function ScoreFeedback({ analysisId, jobTitle }: Props) {
  const [step, setStep] = useState<"idle" | "outcome" | "rating" | "done">("idle");
  const [outcome, setOutcome] = useState("");
  const [rating, setRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  async function submitOutcome(o: string) {
    setOutcome(o);
    setStep("rating");
  }

  async function submitFull() {
    if (!outcome) return;
    setSubmitting(true);
    try {
      await apiClient.post("/feedback/outcome", {
        analysis_id: analysisId,
        outcome,
        accuracy_rating: rating || null,
      });
      setStep("done");
      toast.success("Thanks! Your feedback helps improve JobSync AI.");
    } catch {
      toast.error("Failed to submit feedback");
    } finally {
      setSubmitting(false);
    }
  }

  if (step === "done") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center gap-2 text-[12px] text-emerald-400"
      >
        <CheckCircle2 className="w-4 h-4" />
        Feedback recorded — thank you!
      </motion.div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Idle: show prompt */}
      {step === "idle" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-center gap-3"
        >
          <span className="text-[12px] text-[var(--text-muted)]">Did you apply? Tell us what happened:</span>
          <button
            onClick={() => setStep("outcome")}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] text-[12px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors"
          >
            Record outcome <ChevronDown className="w-3 h-3" />
          </button>
        </motion.div>
      )}

      {/* Outcome picker */}
      <AnimatePresence>
        {step === "outcome" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="p-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-3"
          >
            <p className="text-[13px] font-medium text-[var(--text-primary)]">
              What happened with {jobTitle ? `"${jobTitle}"` : "this application"}?
            </p>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map((o) => (
                <button
                  key={o.value}
                  onClick={() => submitOutcome(o.value)}
                  className={cn(
                    "px-3 py-2 rounded-xl border text-[12px] text-left transition-colors",
                    o.positive
                      ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-300 hover:bg-emerald-400/10"
                      : "border-[var(--border-subtle)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--border-default)]"
                  )}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Accuracy rating */}
      <AnimatePresence>
        {step === "rating" && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-3"
          >
            <p className="text-[13px] font-medium text-[var(--text-primary)]">
              How accurate were the AI scores? <span className="text-[var(--text-muted)] font-normal">(optional)</span>
            </p>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => setRating(n)}
                  className={cn(
                    "w-9 h-9 rounded-xl border text-[13px] font-semibold transition-all",
                    rating >= n
                      ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white"
                      : "bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)]"
                  )}
                >
                  {n}
                </button>
              ))}
              <span className="text-[11px] text-[var(--text-muted)] self-center ml-1">
                {rating === 0 ? "" : rating <= 2 ? "Not accurate" : rating === 3 ? "Somewhat accurate" : rating === 4 ? "Mostly accurate" : "Very accurate"}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={submitFull}
                disabled={submitting}
                className="px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[12px] font-medium transition-colors disabled:opacity-60"
              >
                {submitting ? "Saving…" : "Submit feedback"}
              </button>
              <button
                onClick={() => setStep("idle")}
                className="px-4 py-2 rounded-xl border border-[var(--border-subtle)] text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
              >
                Skip
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
