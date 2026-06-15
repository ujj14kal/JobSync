"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AlertTriangle, ShieldAlert, CheckCircle } from "lucide-react";

export type PendingWarning = {
  id: string;
  message: string;
  warning_number: number;
  sent_at: string;
};

export default function WarningModal({
  warning,
  onAcknowledge,
}: {
  warning: PendingWarning | null;
  onAcknowledge: (id: string) => Promise<void>;
}) {
  const [accepting, setAccepting] = useState(false);
  const [done, setDone] = useState(false);

  if (!warning || done) return null;

  const isRed = warning.warning_number >= 2;
  const accent = isRed ? "#ef4444" : "#eab308";
  const accentBg = isRed ? "rgba(239,68,68,0.08)" : "rgba(234,179,8,0.08)";
  const accentBorder = isRed ? "rgba(239,68,68,0.35)" : "rgba(234,179,8,0.30)";
  const accentGlow = isRed ? "rgba(239,68,68,0.20)" : "rgba(234,179,8,0.15)";

  async function handleAccept() {
    if (!warning) return;
    setAccepting(true);
    await onAcknowledge(warning.id);
    setDone(true);
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center"
        style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)" }}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className="relative w-full max-w-lg mx-4 rounded-3xl overflow-hidden"
          style={{
            background: "var(--bg-surface)",
            border: `1px solid ${accentBorder}`,
            boxShadow: `0 0 60px ${accentGlow}, 0 24px 64px rgba(0,0,0,0.6)`,
          }}
        >
          {/* Pulsing top accent bar */}
          <motion.div
            animate={{ opacity: [0.7, 1, 0.7] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="h-1 w-full"
            style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
          />

          <div className="px-8 py-8">
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <motion.div
                animate={{ scale: [1, 1.08, 1] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{ background: accentBg, border: `1px solid ${accentBorder}` }}
              >
                {isRed
                  ? <ShieldAlert className="w-8 h-8" style={{ color: accent }} />
                  : <AlertTriangle className="w-8 h-8" style={{ color: accent }} />
                }
              </motion.div>
            </div>

            {/* Badge */}
            <div className="flex justify-center mb-4">
              <span
                className="px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest"
                style={{ background: accentBg, color: accent, border: `1px solid ${accentBorder}` }}
              >
                {isRed ? `⚠ Warning ${warning.warning_number} — Final Notice` : "⚠ Community Warning"}
              </span>
            </div>

            {/* Title */}
            <h2 className="text-center text-[20px] font-bold text-[var(--text-primary)] mb-3">
              {isRed ? "Final Community Warning" : "Community Warning"}
            </h2>

            {/* Admin message */}
            <div
              className="rounded-xl px-5 py-4 mb-5 text-[13px] text-[var(--text-secondary)] leading-relaxed"
              style={{ background: accentBg, border: `1px solid ${accentBorder}` }}
            >
              {warning.message}
            </div>

            {/* Guidelines notice */}
            <div
              className="rounded-xl px-5 py-4 mb-6 space-y-2"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
            >
              <p className="text-[12px] font-semibold text-[var(--text-primary)]">
                JobSynk Community Guidelines
              </p>
              <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
                All users are expected to engage respectfully, honestly, and constructively within the JobSynk community. Harassment, spam, misleading content, or any form of abuse is strictly prohibited.
              </p>
              <p
                className="text-[12px] font-semibold leading-relaxed"
                style={{ color: isRed ? "#ef4444" : "#eab308" }}
              >
                Failure to comply with community guidelines and rules may lead to permanent deactivation from JobSynk.
              </p>
            </div>

            {/* CTA */}
            <button
              onClick={handleAccept}
              disabled={accepting}
              className="w-full flex items-center justify-center gap-2.5 py-3.5 rounded-xl font-bold text-[14px] text-white transition-all disabled:opacity-60"
              style={{
                background: isRed
                  ? "linear-gradient(135deg,#dc2626,#991b1b)"
                  : "linear-gradient(135deg,#ca8a04,#78350f)",
                boxShadow: `0 4px 20px ${accentGlow}`,
              }}
            >
              {accepting
                ? "Acknowledging…"
                : <><CheckCircle className="w-4 h-4" /> I Agree & Acknowledge</>
              }
            </button>

            <p className="text-center text-[10px] text-[var(--text-muted)] mt-3">
              By clicking above you confirm you have read and will comply with JobSynk&apos;s community guidelines.
            </p>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
