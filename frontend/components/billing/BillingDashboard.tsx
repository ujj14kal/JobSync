"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Crown, Zap, Brain, Sparkles, Shield,
  CheckCircle2, ArrowRight, Calendar, RefreshCw,
} from "lucide-react";
import { billingApi } from "@/lib/api/billing";
import { CheckoutModal } from "./CheckoutModal";
import { cn } from "@/lib/utils";

// ── Individual SKUs ───────────────────────────────────────────────────────────
const SKUS = [
  { id: "ats_deep",        creditType: "ats_deep",        label: "ATS Analysis · 5-pack", price: "₹99",  per: "5 analyses",              icon: Brain },
  { id: "resume_pack",     creditType: "resume",          label: "Resume Builder · 3-pack",price: "₹149", per: "3 AI generations",       icon: Sparkles },
  { id: "interview_voice", creditType: "interview_voice", label: "Interview · ElevenLabs", price: "₹149", per: "1 premium voice session", icon: Zap },
] as const;

const PRO_FEATURES = [
  "15 Claude Sonnet ATS analyses/month",
  "8 AI resume generations (Sonnet)",
  "8 AI interview sessions (Sonnet)",
  "5 AI cover letters/month",
  "Ask Claude chat (~100–120 msgs/month)",
  "Priority processing",
];

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
}

export default function BillingDashboard() {
  const qc = useQueryClient();
  const [checkout, setCheckout] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-plan"],
    queryFn: billingApi.getMyPlan,
  });

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-7 h-7 rounded-full border-2 border-transparent border-t-[var(--accent-primary)] animate-spin" />
      </div>
    );
  }

  const sub    = data.subscription ?? {};
  const isPro  = sub.plan === "pro";
  const isYearly = sub.billing_cycle === "yearly";
  const periodEnd = sub.current_period_end ? fmt(sub.current_period_end) : null;
  const hasPendingUpgrade = data.has_pending_upgrade;
  const upgradeScheduledFor = data.upgrade_scheduled_for ? fmt(data.upgrade_scheduled_for) : null;

  // Build a map of remaining credits per type
  const creditsMap: Record<string, number> = {};
  for (const c of data.credits ?? []) {
    creditsMap[c.credit_type] = (creditsMap[c.credit_type] ?? 0) + (c.credits_total - c.credits_used);
  }

  function afterPurchase() {
    setCheckout(null);
    qc.invalidateQueries({ queryKey: ["my-plan"] });
  }

  return (
    <div className="space-y-6">

      {/* ── Current Plan ──────────────────────────────────────────────────── */}
      <div className="p-6 rounded-2xl border"
        style={{
          background: isPro
            ? "linear-gradient(135deg,rgba(192,88,0,0.10),rgba(113,54,0,0.06))"
            : "var(--bg-surface)",
          borderColor: isPro ? "rgba(192,88,0,0.35)" : "var(--border-default)",
        }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {isPro
                ? <Crown className="w-4 h-4 text-[#C05800]" />
                : <Shield className="w-4 h-4 text-[var(--text-muted)]" />}
              <span className="text-[12px] font-semibold uppercase tracking-wider"
                style={{ color: isPro ? "#C05800" : "var(--text-muted)" }}>
                {isPro ? `Pro ${isYearly ? "Yearly" : "Monthly"}` : "Free Plan"}
              </span>
            </div>
            <div className="text-[22px] font-bold text-[var(--text-primary)]">
              {isPro ? (isYearly ? "₹2,499/year" : "₹299/month") : "₹0"}
            </div>
            {isPro && periodEnd && (
              <div className="flex items-center gap-1.5 mt-1 text-[12px] text-[var(--text-muted)]">
                <Calendar className="w-3.5 h-3.5" />
                {sub.status === "cancelled"
                  ? `Access until ${periodEnd}`
                  : `Renews ${periodEnd}`}
              </div>
            )}
            {hasPendingUpgrade && upgradeScheduledFor && (
              <div className="mt-2 flex items-center gap-1.5 text-[12px] text-[#7ab840]">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Yearly plan scheduled from {upgradeScheduledFor}
              </div>
            )}
          </div>

          {/* Upgrade / renew CTA */}
          {!isPro && (
            <motion.button
              onClick={() => setCheckout("pro_monthly")}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold text-white flex-shrink-0"
              style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}>
              <Crown className="w-3.5 h-3.5" /> Upgrade to Pro
            </motion.button>
          )}
          {isPro && !isYearly && !hasPendingUpgrade && (
            <motion.button
              onClick={() => setCheckout("pro_yearly_upgrade")}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[13px] font-semibold flex-shrink-0"
              style={{
                background: "rgba(192,88,0,0.10)",
                border: "1px solid rgba(192,88,0,0.25)",
                color: "#C05800",
              }}>
              <Sparkles className="w-3.5 h-3.5" /> Switch to Yearly · Save ₹1,089
            </motion.button>
          )}
        </div>

        {/* Pro feature list for free users */}
        {!isPro && (
          <div className="mt-5 pt-4 border-t border-[var(--border-subtle)]">
            <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Pro includes</div>
            <div className="grid grid-cols-2 gap-1.5">
              {PRO_FEATURES.map((f) => (
                <div key={f} className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-[#7ab840] flex-shrink-0" />
                  <span className="text-[11px] text-[var(--text-secondary)]">{f}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <motion.button
                onClick={() => setCheckout("pro_monthly")}
                whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                className="py-2.5 rounded-xl text-[13px] font-semibold text-white"
                style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}>
                Monthly · ₹299
              </motion.button>
              <motion.button
                onClick={() => setCheckout("pro_yearly")}
                whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
                className="py-2.5 rounded-xl text-[13px] font-semibold"
                style={{ border: "1px solid rgba(192,88,0,0.35)", color: "#C05800", background: "rgba(192,88,0,0.06)" }}>
                Yearly · ₹2,499 <span className="text-[10px]">30% off</span>
              </motion.button>
            </div>
          </div>
        )}
      </div>

      {/* ── Individual Pay-per-use ─────────────────────────────────────────── */}
      <div>
        <div className="text-[13px] font-semibold text-[var(--text-secondary)] mb-3">Pay-per-use</div>
        <div className="grid sm:grid-cols-2 gap-3">
          {SKUS.map(({ id, creditType, label, price, per, icon: Icon }) => {
            const remaining = creditsMap[creditType] ?? 0;
            const hasCredits = remaining > 0;

            return (
              <div key={id}
                className="flex items-center gap-3 p-4 rounded-2xl"
                style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "rgba(192,88,0,0.08)", border: "1px solid rgba(192,88,0,0.12)" }}>
                  <Icon className="w-4 h-4 text-[#C05800]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{label}</div>
                  <div className="text-[11px] text-[var(--text-muted)]">{per}</div>
                  {hasCredits && (
                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-[#7ab840]">
                      <CheckCircle2 className="w-3 h-3" />
                      {remaining} credit{remaining !== 1 ? "s" : ""} remaining
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <span className="text-[14px] font-bold text-[#C05800]">{price}</span>
                  {hasCredits ? (
                    <button
                      onClick={() => setCheckout(id)}
                      className="text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors flex items-center gap-0.5">
                      <RefreshCw className="w-2.5 h-2.5" /> Top up
                    </button>
                  ) : (
                    <motion.button
                      onClick={() => setCheckout(id)}
                      whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-semibold text-white"
                      style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}>
                      Buy <ArrowRight className="w-3 h-3" />
                    </motion.button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Checkout modal ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {checkout && (
          <CheckoutModal
            plan={checkout}
            onClose={() => setCheckout(null)}
            onSuccess={afterPurchase}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
