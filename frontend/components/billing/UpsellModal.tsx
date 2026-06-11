"use client";

/**
 * UpsellModal — shown whenever a user tries to use a paid feature.
 * Shows Pro Monthly + Pro Yearly (highlighted as Best Value).
 * "Not this time" proceeds with the individual purchase.
 *
 * Usage:
 *   const { showUpsell } = useUpsell();
 *   showUpsell({ feature: "Resume Builder", onProceed: () => openCheckout() });
 */

import { createContext, useCallback, useContext, useState, ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Zap, Crown, CheckCircle2, ArrowRight, Sparkles } from "lucide-react"; // Crown kept to satisfy Turbopack module graph
import { CheckoutModal } from "./CheckoutModal";

// ── Context ───────────────────────────────────────────────────────────────────
interface UpsellOptions {
  feature: string;   // e.g. "Resume Builder"
}

interface UpsellContextValue {
  showUpsell: (opts: UpsellOptions) => void;
}

const UpsellContext = createContext<UpsellContextValue>({ showUpsell: () => {} });

export function useUpsell() {
  return useContext(UpsellContext);
}

// ── Pro plan features list ────────────────────────────────────────────────────
const PRO_FEATURES = [
  "20 Claude Sonnet ATS analyses/month",
  "8 AI resume generations (Sonnet)",
  "5 AI cover letters/month",
  "Ask Claude chat assistant",
  "PDF report exports",
  "Priority processing",
];

// ── Provider ─────────────────────────────────────────────────────────────────
export function UpsellProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts]         = useState<UpsellOptions | null>(null);
  const [checkout, setCheckout] = useState<"pro_monthly" | "pro_yearly" | null>(null);

  const showUpsell = useCallback((o: UpsellOptions) => setOpts(o), []);
  const close      = useCallback(() => setOpts(null), []);

  return (
    <UpsellContext.Provider value={{ showUpsell }}>
      {children}

      {/* Upsell overlay */}
      <AnimatePresence>
        {opts && !checkout && (
          <motion.div
            className="fixed inset-0 z-[9000] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={close}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            />

            {/* Card */}
            <motion.div
              className="relative z-10 w-full max-w-lg rounded-3xl overflow-hidden"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 24 }}
              transition={{ type: "spring", stiffness: 280, damping: 26 }}
            >
              {/* Header */}
              <div
                className="px-6 pt-6 pb-5 relative overflow-hidden"
                style={{ background: "linear-gradient(135deg,rgba(192,88,0,0.12),rgba(113,54,0,0.06))" }}
              >
                <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 30% 50%,rgba(192,88,0,0.15),transparent 60%)" }} />
                <button
                  onClick={close}
                  className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <X className="w-4 h-4 text-[var(--text-muted)]" />
                </button>
                <div className="flex items-center gap-2 mb-2 relative">
                  <img src="/logo.png" alt="JobSynk" className="w-8 h-8 object-contain" />
                  <span className="text-[12px] font-semibold text-[#C05800] uppercase tracking-wider">Upgrade to Pro</span>
                </div>
                <h2 className="text-[20px] font-bold text-[var(--text-primary)] relative">
                  Get more out of <span className="text-[#C05800]">{opts.feature}</span>
                </h2>
                <p className="text-[13px] text-[var(--text-secondary)] mt-1 relative">
                  Subscribe and save — instead of paying ₹{opts.feature === "Voice Interview" ? "349" : "149"}+ per use.
                </p>
              </div>

              {/* Plans */}
              <div className="p-6 grid grid-cols-2 gap-3">
                {/* Monthly */}
                <motion.button
                  onClick={() => setCheckout("pro_monthly")}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="relative p-4 rounded-2xl text-left transition-all"
                  style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}
                >
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] mb-1">Monthly</div>
                  <div className="text-[24px] font-bold text-[var(--text-primary)]">₹299</div>
                  <div className="text-[11px] text-[var(--text-muted)]">per month</div>
                  <div className="mt-3 flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                    <ArrowRight className="w-3 h-3" /> Cancel anytime
                  </div>
                </motion.button>

                {/* Yearly — highlighted */}
                <motion.button
                  onClick={() => setCheckout("pro_yearly")}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="relative p-4 rounded-2xl text-left transition-all overflow-hidden"
                  style={{ background: "linear-gradient(135deg,rgba(192,88,0,0.15),rgba(113,54,0,0.08))", border: "1px solid rgba(192,88,0,0.35)" }}
                >
                  <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold" style={{ background: "#C05800", color: "#fff" }}>
                    BEST VALUE
                  </div>
                  <div className="text-[11px] font-semibold text-[#C05800] mb-1">Yearly</div>
                  <div className="text-[24px] font-bold text-[var(--text-primary)]">₹2,499</div>
                  <div className="text-[11px] text-[#C05800] font-medium">₹208/month · save ₹1,089</div>
                  <div className="mt-3 flex items-center gap-1 text-[11px] text-[var(--text-secondary)]">
                    <Sparkles className="w-3 h-3 text-[#C05800]" /> 30% off
                  </div>
                </motion.button>
              </div>

              {/* Feature list */}
              <div className="px-6 pb-2">
                <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-3">Everything included</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {PRO_FEATURES.map((f) => (
                    <div key={f} className="flex items-start gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#7ab840] flex-shrink-0 mt-0.5" />
                      <span className="text-[11px] text-[var(--text-secondary)] leading-tight">{f}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Powered by Claude badge */}
              <div className="px-6 pb-4 mt-3">
                <div className="flex items-center justify-center gap-1.5 py-2 rounded-xl" style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)" }}>
                  <Zap className="w-3 h-3 text-[#C05800]" />
                  <span className="text-[11px] text-[var(--text-muted)]">All Pro features powered by</span>
                  <span className="text-[11px] font-semibold text-[var(--text-secondary)]">Claude Sonnet</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(192,88,0,0.12)", color: "#C05800", border: "1px solid rgba(192,88,0,0.2)" }}>by Anthropic</span>
                </div>
              </div>

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Razorpay checkout modal */}
      <AnimatePresence>
        {checkout && (
          <CheckoutModal
            plan={checkout}
            onClose={() => { setCheckout(null); close(); }}
            onSuccess={() => { setCheckout(null); close(); }}
          />
        )}
      </AnimatePresence>
    </UpsellContext.Provider>
  );
}
