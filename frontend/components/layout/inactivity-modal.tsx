"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Clock, LogOut, RefreshCw } from "lucide-react";

interface InactivityModalProps {
  isOpen: boolean;
  timeRemaining: number;
  onStayLoggedIn: () => void;
  onLogout: () => void;
}

export function InactivityModal({
  isOpen,
  timeRemaining,
  onStayLoggedIn,
  onLogout,
}: InactivityModalProps) {
  const mins = Math.floor(timeRemaining / 60);
  const secs = timeRemaining % 60;
  const timeStr = mins > 0
    ? `${mins}:${String(secs).padStart(2, "0")}`
    : `${secs}s`;

  const urgency = timeRemaining <= 30;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.92, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 16 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="w-full max-w-sm rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] p-6 shadow-2xl">
              {/* Icon */}
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${
                urgency ? "bg-red-400/10 border border-red-400/30" : "bg-amber-400/10 border border-amber-400/30"
              }`}>
                <Clock className={`w-6 h-6 ${urgency ? "text-red-400" : "text-amber-400"}`} />
              </div>

              <h2 className="text-[16px] font-semibold text-[var(--text-primary)] text-center mb-1">
                Session Expiring Soon
              </h2>
              <p className="text-[13px] text-[var(--text-secondary)] text-center mb-5">
                You've been inactive. Your session will end in{" "}
                <span className={`font-bold tabular-nums ${urgency ? "text-red-400" : "text-amber-400"}`}>
                  {timeStr}
                </span>
                .
              </p>

              {/* Countdown ring */}
              <div className="flex justify-center mb-6">
                <div className={`text-3xl font-black tabular-nums ${
                  urgency ? "text-red-400" : "text-amber-400"
                }`}>
                  {timeStr}
                </div>
              </div>

              {/* Actions */}
              <div className="flex flex-col gap-2">
                <button
                  onClick={onStayLoggedIn}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Stay Logged In
                </button>
                <button
                  onClick={onLogout}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[var(--border-default)] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Log Out Now
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
