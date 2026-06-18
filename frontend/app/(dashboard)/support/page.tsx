"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle, CreditCard, Brain, User, Lightbulb,
  MessageSquare, Send, CheckCircle2, ChevronRight,
} from "lucide-react";

const TOPICS = [
  {
    id: "analysis_quality",
    label: "Analysis Results",
    icon: Brain,
    desc: "Questions about your ATS scores, feedback quality, or unexpected results",
    color: "#C05800",
  },
  {
    id: "technical_issue",
    label: "Technical Issue",
    icon: AlertCircle,
    desc: "Something isn't loading, errors on screen, features not working",
    color: "#d97020",
  },
  {
    id: "billing",
    label: "Billing & Payments",
    icon: CreditCard,
    desc: "Subscription charges, refund requests, or payment failures",
    color: "#7ab840",
  },
  {
    id: "account",
    label: "Account & Privacy",
    icon: User,
    desc: "Login issues, data deletion, privacy concerns, or account access",
    color: "#d4aa30",
  },
  {
    id: "feature_request",
    label: "Feature Request",
    icon: Lightbulb,
    desc: "A suggestion or idea for something new you'd like to see",
    color: "#e89848",
  },
  {
    id: "other",
    label: "Other",
    icon: MessageSquare,
    desc: "Anything that doesn't fit the categories above",
    color: "#94a3b8",
  },
];

type Step = "topic" | "form" | "submitted";

export default function SupportPage() {
  const [step, setStep]       = useState<Step>("topic");
  const [topic, setTopic]     = useState<typeof TOPICS[0] | null>(null);
  const [message, setMessage] = useState("");
  const [email, setEmail]     = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) { setError("Please describe your issue."); return; }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: topic?.label, message, email }),
      });
      if (!res.ok) throw new Error("failed");
      setStep("submitted");
    } catch {
      setError("Something went wrong. Please try again or email hello@jobsynk.in directly.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <AnimatePresence mode="wait">

        {/* ── Step 1: Pick a topic ── */}
        {step === "topic" && (
          <motion.div key="topic"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>

            <div className="mb-8">
              <h1 className="text-2xl font-bold text-white mb-1.5">How can we help?</h1>
              <p className="text-[13px]" style={{ color: "rgba(148,163,184,0.7)" }}>
                Pick a topic and we&apos;ll get back to you within 3–5 business days.
              </p>
            </div>

            <div className="grid gap-3">
              {TOPICS.map((t) => {
                const Icon = t.icon;
                return (
                  <motion.button
                    key={t.id}
                    whileHover={{ x: 4 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => { setTopic(t); setStep("form"); }}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all group"
                    style={{
                      background: "rgba(255,255,255,0.03)",
                      border: "1px solid rgba(255,255,255,0.07)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.05)";
                      e.currentTarget.style.borderColor = `${t.color}30`;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "rgba(255,255,255,0.03)";
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                    }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: `${t.color}12`, border: `1px solid ${t.color}22` }}>
                      <Icon size={18} style={{ color: t.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-white mb-0.5">{t.label}</p>
                      <p className="text-[11px] truncate" style={{ color: "rgba(148,163,184,0.6)" }}>{t.desc}</p>
                    </div>
                    <ChevronRight size={15} style={{ color: "rgba(100,116,139,0.4)" }}
                      className="flex-shrink-0 group-hover:translate-x-0.5 transition-transform" />
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ── Step 2: Form ── */}
        {step === "form" && topic && (
          <motion.div key="form"
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}>

            <button onClick={() => setStep("topic")}
              className="inline-flex items-center gap-1.5 text-[12px] mb-8 transition-colors hover:text-white"
              style={{ color: "rgba(100,116,139,0.7)" }}>
              ← Change topic
            </button>

            <div className="mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-4"
                style={{ background: `${topic.color}12`, border: `1px solid ${topic.color}25` }}>
                <topic.icon size={12} style={{ color: topic.color }} />
                <span className="text-[11px] font-semibold" style={{ color: topic.color }}>{topic.label}</span>
              </div>
              <h1 className="text-2xl font-bold text-white mb-1">Tell us more</h1>
              <p className="text-[13px]" style={{ color: "rgba(148,163,184,0.6)" }}>
                The more detail you share, the faster we can help.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "rgba(148,163,184,0.8)" }}>
                  Your email <span style={{ color: "rgba(100,116,139,0.5)" }}>(optional — for follow-up)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-4 py-2.5 rounded-xl text-[13px] focus:outline-none transition-colors placeholder:text-[rgba(100,116,139,0.4)]"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(226,232,240,0.9)",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(192,88,0,0.4)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
                />
              </div>

              <div>
                <label className="block text-[12px] font-medium mb-1.5" style={{ color: "rgba(148,163,184,0.8)" }}>
                  Describe your issue <span style={{ color: "#C05800" }}>*</span>
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={
                    topic.id === "technical_issue"
                      ? "What happened? What did you expect? Any error messages?"
                      : topic.id === "billing"
                      ? "Include your transaction ID or the date of the charge if relevant."
                      : "Please share as much detail as you can..."
                  }
                  rows={6}
                  maxLength={2000}
                  required
                  className="w-full px-4 py-3 rounded-xl text-[13px] resize-none focus:outline-none transition-colors placeholder:text-[rgba(100,116,139,0.4)]"
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    color: "rgba(226,232,240,0.9)",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "rgba(192,88,0,0.4)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)")}
                />
                <p className="text-[10px] mt-1 text-right" style={{ color: "rgba(100,116,139,0.5)" }}>
                  {message.length}/2000
                </p>
              </div>

              {error && (
                <p className="text-[12px] px-3 py-2 rounded-lg"
                  style={{ color: "#f87171", background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.2)" }}>
                  {error}
                </p>
              )}

              <motion.button
                type="submit"
                disabled={loading || !message.trim()}
                whileHover={message.trim() ? { scale: 1.01 } : {}}
                whileTap={message.trim() ? { scale: 0.99 } : {}}
                className="w-full py-3 rounded-xl text-[14px] font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-40"
                style={{ background: "linear-gradient(135deg,#C05800,#713600)", boxShadow: "0 4px 20px rgba(192,88,0,0.25)" }}
              >
                {loading ? (
                  <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                ) : (
                  <><Send size={14} /> Send Request</>
                )}
              </motion.button>

              <p className="text-center text-[11px]" style={{ color: "rgba(100,116,139,0.5)" }}>
                We typically respond within 3–5 business days.
              </p>
            </form>
          </motion.div>
        )}

        {/* ── Step 3: Submitted ── */}
        {step === "submitted" && (
          <motion.div key="submitted"
            initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center text-center py-16">

            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 14 }}
              className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
              style={{ background: "rgba(122,184,64,0.12)", border: "1px solid rgba(122,184,64,0.3)" }}
            >
              <CheckCircle2 size={40} style={{ color: "#7ab840" }} />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
              <h2 className="text-2xl font-bold text-white mb-2">Request received</h2>
              <p className="text-[14px] mb-1" style={{ color: "rgba(148,163,184,0.7)" }}>
                We&apos;ve received your support request for <strong className="text-white">{topic?.label}</strong>.
              </p>
              <p className="text-[13px] mb-8" style={{ color: "rgba(100,116,139,0.7)" }}>
                Please allow <strong className="text-white">3–5 business days</strong> to analyse your request.
                We&apos;ll get back to you soon.
                {email && <> Responses will be sent to <strong className="text-white">{email}</strong>.</>}
              </p>

              <button
                onClick={() => { setStep("topic"); setTopic(null); setMessage(""); setEmail(""); }}
                className="px-6 py-2.5 rounded-xl text-[13px] font-medium transition-colors hover:text-white"
                style={{ color: "rgba(148,163,184,0.6)", border: "1px solid rgba(255,255,255,0.07)" }}>
                Submit another request
              </button>
            </motion.div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
