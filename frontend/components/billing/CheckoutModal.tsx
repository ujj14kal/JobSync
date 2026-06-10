"use client";

/**
 * CheckoutModal — opens Razorpay checkout for subscriptions OR individual products.
 *
 * For subscriptions (plan = "pro_monthly" | "pro_yearly"):
 *   → createSubscription → Razorpay → verifySubscription
 *
 * For individual products (plan = product_id like "resume_pack"):
 *   → createOrder → Razorpay → verifyPayment
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { billingApi } from "@/lib/api/billing";
import { toast } from "sonner";

// Razorpay script loader
function loadRazorpay(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(false);
    if ((window as any).Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload  = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

// ── Brand theme applied to the Razorpay popup ────────────────────────────────
// Razorpay exposes two theme options on their hosted checkout:
//   theme.color          → buttons, links, focus rings, header accent
//   theme.backdrop_color → the semi-transparent overlay behind their modal
//
// Their modal card (white, with payment fields) cannot be further customised
// on the standard checkout — it's rendered inside a sandboxed iframe.
// Everything else (our pre-checkout card, loading states, etc.) is fully ours.
const RZP_THEME = {
  color:          "#C05800",           // caramel — primary brand
  backdrop_color: "rgba(10,8,6,0.82)", // matches our --bg-base dark overlay
} as const;

// Absolute logo URL — Razorpay requires HTTPS, relative paths don't work
const rzpLogo = () =>
  typeof window !== "undefined"
    ? `${window.location.origin}/logo.png`
    : "https://jobsynk.in/logo.png";

interface CheckoutModalProps {
  plan:      string;   // "pro_monthly" | "pro_yearly" | product_id
  onClose:   () => void;
  onSuccess: () => void;
}

const PLAN_LABELS: Record<string, { label: string; amount: string; desc: string }> = {
  pro_monthly:     { label: "Pro Monthly",           amount: "₹299/month",  desc: "Cancel anytime" },
  pro_yearly:      { label: "Pro Yearly",            amount: "₹2,499/year", desc: "Save ₹1,089 · 30% off" },
  resume_pack:     { label: "Resume Builder Pack",   amount: "₹299",        desc: "10 AI resume generations" },
  interview_text:  { label: "AI Interview (Text)",   amount: "₹149",        desc: "1 full text interview session" },
  interview_voice: { label: "AI Interview (Voice)",  amount: "₹149",        desc: "1 voice interview — ElevenLabs + Sonnet" },
  ats_deep:        { label: "ATS Deep Analysis",     amount: "₹59",         desc: "1 Claude Sonnet ATS analysis" },
};

type Stage = "loading" | "ready" | "processing" | "success" | "error";

export function CheckoutModal({ plan, onClose, onSuccess }: CheckoutModalProps) {
  const [stage, setStage] = useState<Stage>("loading");
  const [error, setError] = useState("");
  const info = PLAN_LABELS[plan] ?? { label: plan, amount: "", desc: "" };
  const isSubscription = plan === "pro_monthly" || plan === "pro_yearly";

  useEffect(() => {
    let cancelled = false;
    loadRazorpay().then((loaded) => {
      if (!cancelled) setStage(loaded ? "ready" : "error");
      if (!loaded)   setError("Could not load payment gateway. Check your internet connection.");
    });
    return () => { cancelled = true; };
  }, []);

  async function handlePay() {
    setStage("processing");
    try {
      const rzpLoaded = await loadRazorpay();
      if (!rzpLoaded) throw new Error("Payment gateway failed to load.");

      if (isSubscription) {
        // ── Subscription flow ────────────────────────────────────────────────
        const { subscription_id, razorpay_key_id } = await billingApi.createSubscription(
          plan as "pro_monthly" | "pro_yearly"
        );

        await new Promise<void>((resolve, reject) => {
          const rzp = new (window as any).Razorpay({
            key:             razorpay_key_id,
            subscription_id: subscription_id,
            name:            "JobSynk",
            description:     `${info.label} — ${info.desc}`,
            image:           rzpLogo(),
            theme:           RZP_THEME,
            handler: async (response: any) => {
              try {
                await billingApi.verifySubscription({
                  razorpay_payment_id:     response.razorpay_payment_id,
                  razorpay_subscription_id: response.razorpay_subscription_id,
                  razorpay_signature:      response.razorpay_signature,
                  plan,
                });
                resolve();
              } catch (e: any) {
                reject(new Error(e?.response?.data?.detail || "Verification failed."));
              }
            },
            modal: { ondismiss: () => reject(new Error("cancelled")) },
          });
          rzp.open();
        });
      } else {
        // ── Individual purchase flow ─────────────────────────────────────────
        const { order_id, amount, razorpay_key_id } = await billingApi.createOrder(plan);

        await new Promise<void>((resolve, reject) => {
          const rzp = new (window as any).Razorpay({
            key:         razorpay_key_id,
            order_id:    order_id,
            amount:      amount,
            currency:    "INR",
            name:        "JobSynk",
            description: `${info.label}`,
            image:       rzpLogo(),
            theme:       RZP_THEME,
            handler: async (response: any) => {
              try {
                await billingApi.verifyPayment({
                  razorpay_order_id:   response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature:  response.razorpay_signature,
                  product_id:          plan,
                });
                resolve();
              } catch (e: any) {
                reject(new Error(e?.response?.data?.detail || "Verification failed."));
              }
            },
            modal: { ondismiss: () => reject(new Error("cancelled")) },
          });
          rzp.open();
        });
      }

      setStage("success");
      toast.success(isSubscription ? "Welcome to Pro! 🎉" : `${info.label} added to your account!`);
      setTimeout(onSuccess, 1200);
    } catch (e: any) {
      if (e.message === "cancelled") {
        setStage("ready");
        return;
      }
      setError(e.message || "Payment failed.");
      setStage("error");
    }
  }

  return (
    <motion.div
      className="fixed inset-0 z-[9500] flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative z-10 w-full max-w-sm p-6 rounded-3xl text-center"
        style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: "spring", stiffness: 300, damping: 28 }}
      >
        {stage === "loading" && (
          <>
            <Loader2 className="w-8 h-8 text-[#C05800] animate-spin mx-auto mb-3" />
            <p className="text-[14px] text-[var(--text-secondary)]">Loading payment gateway…</p>
          </>
        )}

        {stage === "ready" && (
          <>
            <img src="/logo.png" alt="JobSynk" className="w-12 h-12 object-contain mx-auto mb-4" />
            <div className="text-[18px] font-bold text-[var(--text-primary)] mb-1">{info.label}</div>
            <div className="text-[24px] font-bold text-[#C05800] mb-0.5">{info.amount}</div>
            <div className="text-[12px] text-[var(--text-muted)] mb-6">{info.desc}</div>
            <div className="text-[11px] text-[var(--text-muted)] mb-5 p-3 rounded-xl" style={{ background: "var(--bg-elevated)" }}>
              Secure payment via Razorpay · UPI, cards, wallets accepted · 2% transaction fee
            </div>
            <button
              onClick={handlePay}
              className="btn-primary w-full justify-center py-3 text-[14px] font-semibold"
            >
              Pay {info.amount}
            </button>
            <button onClick={onClose} className="mt-3 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
              Cancel
            </button>
          </>
        )}

        {stage === "processing" && (
          <>
            <Loader2 className="w-8 h-8 text-[#C05800] animate-spin mx-auto mb-3" />
            <p className="text-[14px] font-medium text-[var(--text-primary)]">Processing payment…</p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1">Do not close this window.</p>
          </>
        )}

        {stage === "success" && (
          <>
            <CheckCircle2 className="w-12 h-12 text-[#7ab840] mx-auto mb-3" />
            <p className="text-[16px] font-bold text-[var(--text-primary)]">Payment successful!</p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1">Your account has been updated.</p>
          </>
        )}

        {stage === "error" && (
          <>
            <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
            <p className="text-[14px] font-medium text-[var(--text-primary)] mb-1">Something went wrong</p>
            <p className="text-[12px] text-[var(--text-muted)] mb-4">{error}</p>
            <button onClick={() => setStage("ready")} className="btn-primary !px-5 !py-2 !text-[13px]">
              Try again
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
