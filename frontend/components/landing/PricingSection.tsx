"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Zap, Crown, Sparkles, X,
  Brain, Shield, LogIn,
} from "lucide-react";
import MessageSquare from "lucide-react/dist/esm/icons/message-square.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { CheckoutModal } from "@/components/billing/CheckoutModal";
import { cn } from "@/lib/utils";

// ── Plan data ─────────────────────────────────────────────────────────────────
const FREE_FEATURES = [
  "3 ATS analyses per day (JobSynk AI Engine)",
  "2 lifetime resume builder credits",
  "Voice interview practice (browser audio)",
  "Job application tracker",
  "Career insights & salary data",
  "Mentor discovery (browse)",
];

const PRO_FEATURES = [
  { label: "20 ATS analyses/month",           highlight: false },
  { label: "8 AI resume generations",          highlight: false },
  { label: "5 AI cover letters/month",         highlight: false },
  { label: "Ask Claude chat assistant",        highlight: true  },
  { label: "PDF report exports",               highlight: false },
  { label: "Claude Sonnet for everything",     highlight: true  },
  { label: "Priority processing",              highlight: false },
];

const INDIVIDUAL = [
  { id: "ats_deep",        label: "ATS Analysis · 5-pack",  price: "₹99",  per: "5 analyses",              icon: Brain },
  { id: "resume_pack",     label: "Resume Builder · 3-pack", price: "₹149", per: "3 AI resumes",            icon: Sparkles },
  { id: "interview_voice", label: "Interview · ElevenLabs",  price: "₹149", per: "1 premium voice session", icon: Zap },
];

export default function PricingSection() {
  const ref      = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  const router   = useRouter();
  const [billing, setBilling]   = useState<"monthly" | "yearly">("monthly");
  const [checkout, setCheckout] = useState<string | null>(null);
  const [showSignInPrompt, setShowSignInPrompt] = useState(false);

  const planSub = billing === "monthly" ? "per month" : "per year · ₹208/mo · save ₹1,089";
  const planId  = billing === "monthly" ? "pro_monthly" : "pro_yearly";

  // ── Yearly price animation state ──────────────────────────────────────────
  const [shownPrice, setShownPrice]     = useState(299);
  const [strikeVisible, setStrikeVisible] = useState(false);
  const rafRef = useRef<number | null>(null);

  const formatPrice = (n: number) =>
    "₹" + n.toLocaleString("en-IN");

  const cancelRaf = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  useEffect(() => {
    cancelRaf();
    if (billing === "monthly") {
      setShownPrice(299);
      setStrikeVisible(false);
      return;
    }

    // Show original full-year price first, then animate down
    const ORIGINAL = 3588; // 299 × 12
    const TARGET   = 2499;

    setShownPrice(ORIGINAL);
    setStrikeVisible(false);

    const t1 = setTimeout(() => setStrikeVisible(true), 80);

    const t2 = setTimeout(() => {
      const duration  = 900;
      const startTime = performance.now();

      const tick = (now: number) => {
        const progress = Math.min((now - startTime) / duration, 1);
        const eased    = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        setShownPrice(Math.round(ORIGINAL + (TARGET - ORIGINAL) * eased));
        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          setStrikeVisible(false);
        }
      };
      rafRef.current = requestAnimationFrame(tick);
    }, 650);

    return () => { clearTimeout(t1); clearTimeout(t2); cancelRaf(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billing]);

  async function handleBuy(productId: string) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setShowSignInPrompt(true);
      return;
    }
    setCheckout(productId);
  }

  return (
    <section ref={ref} className="section relative overflow-hidden">
      {/* Glow */}
      <div className="absolute top-1/2 left-1/2 w-[900px] h-[500px] -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        style={{ background: "radial-gradient(ellipse,rgba(192,88,0,0.06) 0%,transparent 70%)", filter: "blur(60px)" }} />

      <div className="container-lg relative">
        {/* Heading */}
        <div className="text-center mb-12">
          <motion.div className="chip mb-4 inline-flex"
            initial={{ opacity: 0, y: 10 }} animate={isInView ? { opacity: 1, y: 0 } : {}}>
            <Crown size={12} /> Simple pricing
          </motion.div>
          <motion.h2 className="text-4xl sm:text-5xl font-bold text-primary mb-4"
            initial={{ opacity: 0, y: 20 }} animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.16,1,0.3,1] }}>
            Start free.{" "}
            <span style={{ background: "linear-gradient(135deg,#C05800,#d4aa30)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              Upgrade when ready.
            </span>
          </motion.h2>
          <motion.p className="text-secondary text-lg max-w-xl mx-auto mb-6"
            initial={{ opacity: 0 }} animate={isInView ? { opacity: 1 } : {}} transition={{ delay: 0.2 }}>
            All AI features on Pro are powered by <strong>Claude Sonnet</strong> by Anthropic — the same model that makes top enterprise products.
          </motion.p>

          {/* Billing toggle */}
          <motion.div className="inline-flex items-center gap-1 p-1 rounded-xl"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}
            initial={{ opacity: 0 }} animate={isInView ? { opacity: 1 } : {}} transition={{ delay: 0.25 }}>
            {(["monthly", "yearly"] as const).map((b) => (
              <button key={b} onClick={() => setBilling(b)}
                className={cn(
                  "px-4 py-2 rounded-lg text-[13px] font-medium transition-all duration-200",
                  billing === b
                    ? "text-white shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]",
                )}
                style={billing === b ? { background: "linear-gradient(135deg,#C05800,#713600)" } : {}}>
                {b === "monthly" ? "Monthly" : (
                  <span className="flex items-center gap-1.5">
                    Yearly
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "rgba(122,184,64,0.15)", color: "#7ab840" }}>
                      30% OFF
                    </span>
                  </span>
                )}
              </button>
            ))}
          </motion.div>
        </div>

        {/* Plan cards — pt-4 gives the Pro badge room above the card */}
        <div className="grid lg:grid-cols-3 gap-6 items-start mb-16 pt-4">

          {/* Free */}
          <motion.div className="p-6 rounded-3xl h-full"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            initial={{ opacity: 0, y: 24 }} animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.15, duration: 0.6, ease: [0.16,1,0.3,1] }}>
            <div className="mb-5">
              <div className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Free</div>
              <div className="text-[40px] font-bold text-[var(--text-primary)] leading-none">₹0</div>
              <div className="text-[13px] text-[var(--text-muted)] mt-1">no card needed · limits apply</div>
            </div>
            <div className="space-y-2.5 mb-6">
              {FREE_FEATURES.map((f) => (
                <div key={f} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-[#7ab840] flex-shrink-0 mt-0.5" />
                  <span className="text-[13px] text-[var(--text-secondary)]">{f}</span>
                </div>
              ))}
            </div>
            <Link href="/signup">
              <button className="w-full py-2.5 rounded-xl text-[13px] font-semibold transition-all hover:bg-[var(--bg-elevated)]"
                style={{ border: "1px solid var(--border-default)", color: "var(--text-secondary)" }}>
                Get started free
              </button>
            </Link>
          </motion.div>

          {/* Pro — highlighted */}
          <motion.div className="relative pt-10 pb-6 px-6 rounded-3xl"
            style={{
              background:  "linear-gradient(135deg,rgba(192,88,0,0.10),rgba(113,54,0,0.06))",
              border:      "1px solid rgba(192,88,0,0.35)",
              boxShadow:   "0 0 60px rgba(192,88,0,0.12), 0 16px 48px rgba(0,0,0,0.3)",
            }}
            initial={{ opacity: 0, y: 24 }} animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.22, duration: 0.6, ease: [0.16,1,0.3,1] }}>
            {/* Most popular badge — sits above the card, needs overflow visible */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 rounded-full text-[11px] font-bold text-white whitespace-nowrap"
              style={{ background: "linear-gradient(135deg,#C05800,#713600)", zIndex: 10 }}>
              MOST POPULAR
            </div>
            <div className="absolute inset-0 rounded-3xl pointer-events-none" style={{ background: "radial-gradient(circle at 20% 20%,rgba(192,88,0,0.12),transparent 60%)" }} />

            <div className="mb-5 relative">
              <div className="text-[12px] font-semibold text-[#C05800] uppercase tracking-wider mb-2">Pro</div>

              {/* Price with animated strikethrough */}
              <div className="relative inline-block">
                <motion.div
                  className="text-[40px] font-bold leading-none"
                  animate={{ color: strikeVisible ? "var(--text-muted)" : "var(--text-primary)" }}
                  transition={{ duration: 0.25 }}
                >
                  {formatPrice(shownPrice)}
                </motion.div>

                {/* Strikethrough line */}
                <motion.div
                  className="absolute left-0 top-1/2 h-[3px] rounded-full pointer-events-none"
                  style={{ background: "linear-gradient(90deg,#C05800,#d4aa30)", translateY: "-50%" }}
                  initial={{ width: "0%" }}
                  animate={{ width: strikeVisible ? "100%" : "0%" }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                />
              </div>

              <AnimatePresence mode="wait">
                <motion.div
                  key={planSub}
                  className="text-[12px] text-[var(--text-muted)] mt-1"
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {planSub}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Claude branding */}
            <div className="flex items-center gap-1.5 mb-4 px-3 py-2 rounded-xl relative"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(192,88,0,0.15)" }}>
              <Zap className="w-3 h-3 text-[#C05800]" />
              <span className="text-[11px] text-[var(--text-muted)]">All features powered by</span>
              <span className="text-[11px] font-bold text-[var(--text-secondary)]">Claude Sonnet</span>
              <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: "rgba(192,88,0,0.12)", color: "#C05800", border: "1px solid rgba(192,88,0,0.2)" }}>
                Anthropic
              </span>
            </div>

            <div className="space-y-2.5 mb-6 relative">
              {PRO_FEATURES.map((f) => (
                <div key={f.label} className="flex items-start gap-2.5">
                  <CheckCircle2 className={cn("w-4 h-4 flex-shrink-0 mt-0.5", f.highlight ? "text-[#C05800]" : "text-[#7ab840]")} />
                  <span className={cn("text-[13px]", f.highlight ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-secondary)]")}>
                    {f.label}
                  </span>
                </div>
              ))}
            </div>

            <motion.button
              onClick={() => handleBuy(planId)}
              whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.98 }}
              className="w-full py-3 rounded-xl text-[14px] font-bold text-white transition-all relative"
              style={{ background: "linear-gradient(135deg,#C05800,#713600)", boxShadow: "0 4px 20px rgba(192,88,0,0.35)" }}>
              Subscribe {billing === "yearly" ? "· Save ₹1,089" : "· ₹299/month"}
            </motion.button>
            <p className="text-center text-[11px] text-[var(--text-muted)] mt-2">Cancel anytime · Razorpay secure checkout</p>
          </motion.div>

          {/* Individual */}
          <motion.div className="p-6 rounded-3xl"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            initial={{ opacity: 0, y: 24 }} animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.3, duration: 0.6, ease: [0.16,1,0.3,1] }}>
            <div className="mb-5">
              <div className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Pay per use</div>
              <div className="text-[18px] font-bold text-[var(--text-primary)]">Only what you need</div>
              <div className="text-[13px] text-[var(--text-muted)] mt-1">No subscription required</div>
            </div>
            <div className="space-y-2 mb-6">
              {INDIVIDUAL.map(({ id, label, price, per, icon: Icon }) => (
                <motion.button
                  key={id}
                  onClick={() => handleBuy(id)}
                  whileHover={{ x: 3 }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl text-left transition-all hover:bg-[var(--bg-elevated)] group"
                  style={{ border: "1px solid var(--border-subtle)" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: "rgba(192,88,0,0.08)", border: "1px solid rgba(192,88,0,0.12)" }}>
                    <Icon className="w-3.5 h-3.5 text-[#C05800]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-semibold text-[var(--text-primary)] truncate">{label}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">{per}</div>
                  </div>
                  <div className="text-[14px] font-bold text-[#C05800]">{price}</div>
                </motion.button>
              ))}
            </div>
            <div className="p-3 rounded-xl text-[11px] text-center text-[var(--text-muted)]"
              style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
              <Shield className="w-3.5 h-3.5 inline-block mr-1 text-[#7ab840]" />
              Secure via Razorpay · UPI, cards, wallets · 2% fee
            </div>
          </motion.div>
        </div>

      </div>

      {/* Sign-in required prompt */}
      <AnimatePresence>
        {showSignInPrompt && (
          <motion.div
            className="fixed inset-0 z-[9500] flex items-center justify-center p-4"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          >
            <motion.div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowSignInPrompt(false)} />
            <motion.div
              className="relative z-10 w-full max-w-sm p-6 rounded-3xl text-center"
              style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
            >
              <button
                onClick={() => setShowSignInPrompt(false)}
                className="absolute top-4 right-4 w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/10 transition-colors"
              >
                <X className="w-4 h-4 text-[var(--text-muted)]" />
              </button>
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: "rgba(192,88,0,0.12)", border: "1px solid rgba(192,88,0,0.2)" }}>
                <LogIn className="w-5 h-5 text-[#C05800]" />
              </div>
              <h3 className="text-[17px] font-bold text-[var(--text-primary)] mb-1">Sign in to purchase</h3>
              <p className="text-[13px] text-[var(--text-secondary)] mb-6">
                Create a free account or sign in to continue with your purchase.
              </p>
              <div className="flex flex-col gap-2">
                <Link href="/login">
                  <button className="w-full py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all"
                    style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}>
                    Sign in
                  </button>
                </Link>
                <Link href="/signup">
                  <button className="w-full py-2.5 rounded-xl text-[13px] font-medium border transition-all hover:bg-[var(--bg-elevated)]"
                    style={{ borderColor: "var(--border-default)", color: "var(--text-secondary)" }}>
                    Create free account
                  </button>
                </Link>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Checkout modal */}
      <AnimatePresence>
        {checkout && (
          <CheckoutModal
            plan={checkout}
            onClose={() => setCheckout(null)}
            onSuccess={() => { setCheckout(null); window.location.reload(); }}
          />
        )}
      </AnimatePresence>
    </section>
  );
}
