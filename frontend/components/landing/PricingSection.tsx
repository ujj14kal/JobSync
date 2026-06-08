"use client";

import { useRef, useState } from "react";
import { motion, useInView, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Zap, Crown, Sparkles, X,
  Brain, Shield, TrendingUp, MessageSquare,
} from "lucide-react";
import Link from "next/link";
import { CheckoutModal } from "@/components/billing/CheckoutModal";
import { cn } from "@/lib/utils";

// ── Plan data ─────────────────────────────────────────────────────────────────
const FREE_FEATURES = [
  "3 ATS analyses per day (JobSynk AI Engine)",
  "2 lifetime resume builder credits",
  "1 free text interview practice",
  "Job application tracker",
  "Career insights & salary data",
  "Mentor discovery (browse)",
];

const PRO_FEATURES = [
  { label: "15 ATS analyses/month",           highlight: false },
  { label: "5 AI resume generations",          highlight: false },
  { label: "3 AI cover letters/month",         highlight: false },
  { label: "2 text AI interviews/month",       highlight: false },
  { label: "1 voice interview (ElevenLabs)",   highlight: true  },
  { label: "Ask Claude chat assistant",        highlight: true  },
  { label: "PDF report exports",               highlight: false },
  { label: "Claude Sonnet for everything",     highlight: true  },
  { label: "Priority processing",              highlight: false },
];

const INDIVIDUAL = [
  { id: "ats_deep",        label: "ATS Deep Analysis",         price: "₹59",  per: "per analysis",     icon: Brain },
  { id: "resume_pack",     label: "Resume Pack",               price: "₹299", per: "10 generations",   icon: Sparkles },
  { id: "cover_letter",    label: "Cover Letter",              price: "₹99",  per: "per letter",       icon: TrendingUp },
  { id: "interview_text",  label: "AI Interview (Text)",       price: "₹149", per: "per session",      icon: MessageSquare },
  { id: "interview_voice", label: "AI Interview (Voice)",      price: "₹349", per: "ElevenLabs + Sonnet", icon: Zap },
];

export default function PricingSection() {
  const ref      = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-60px" });
  const [billing, setBilling]   = useState<"monthly" | "yearly">("monthly");
  const [checkout, setCheckout] = useState<string | null>(null);

  const planPrice = billing === "monthly" ? "₹299" : "₹2,499";
  const planSub   = billing === "monthly" ? "per month" : "per year · ₹208/mo · save ₹1,089";
  const planId    = billing === "monthly" ? "pro_monthly" : "pro_yearly";

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

        {/* Plan cards */}
        <div className="grid lg:grid-cols-3 gap-6 items-start mb-16">

          {/* Free */}
          <motion.div className="p-6 rounded-3xl h-full"
            style={{ background: "var(--bg-surface)", border: "1px solid var(--border-subtle)" }}
            initial={{ opacity: 0, y: 24 }} animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.15, duration: 0.6, ease: [0.16,1,0.3,1] }}>
            <div className="mb-5">
              <div className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Free</div>
              <div className="text-[40px] font-bold text-[var(--text-primary)] leading-none">₹0</div>
              <div className="text-[13px] text-[var(--text-muted)] mt-1">forever · no card needed</div>
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
          <motion.div className="relative p-6 rounded-3xl overflow-hidden"
            style={{
              background:  "linear-gradient(135deg,rgba(192,88,0,0.10),rgba(113,54,0,0.06))",
              border:      "1px solid rgba(192,88,0,0.35)",
              boxShadow:   "0 0 60px rgba(192,88,0,0.12), 0 16px 48px rgba(0,0,0,0.3)",
            }}
            initial={{ opacity: 0, y: 24 }} animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.22, duration: 0.6, ease: [0.16,1,0.3,1] }}>
            {/* Most popular badge */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 px-3 py-1 rounded-full text-[11px] font-bold text-white"
              style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}>
              MOST POPULAR
            </div>
            <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(circle at 20% 20%,rgba(192,88,0,0.12),transparent 60%)" }} />

            <div className="mb-5 relative">
              <div className="text-[12px] font-semibold text-[#C05800] uppercase tracking-wider mb-2">Pro</div>
              <AnimatePresence mode="wait">
                <motion.div key={billing}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}>
                  <div className="text-[40px] font-bold text-[var(--text-primary)] leading-none">{planPrice}</div>
                  <div className="text-[12px] text-[var(--text-muted)] mt-1">{planSub}</div>
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
              onClick={() => setCheckout(planId)}
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
                  onClick={() => setCheckout(id)}
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

        {/* Cost transparency */}
        <motion.div className="max-w-2xl mx-auto p-6 rounded-3xl text-center"
          style={{ background: "rgba(255,255,255,0.015)", border: "1px solid rgba(255,255,255,0.05)" }}
          initial={{ opacity: 0 }} animate={isInView ? { opacity: 1 } : {}} transition={{ delay: 0.45 }}>
          <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-2">Why we charge</div>
          <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
            Free features are powered by the <strong>JobSynk AI Engine</strong> — our proprietary model
            trained on thousands of resumes and job descriptions. Pro features use{" "}
            <strong>Claude Sonnet by Anthropic</strong> — a frontier LLM that delivers deeper, more
            personalised feedback. It costs us real money per token (~₹4–6 per analysis). Pro pricing
            ensures we can keep the lights on while giving you the best possible quality. We never sell
            your data.
          </p>
        </motion.div>
      </div>

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
