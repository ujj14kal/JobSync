"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageCircle, Send, CheckCircle2, Clock, ChevronDown,
  ChevronUp, Mail, Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

function VerifiedBadge() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#1d9bf0" />
      <path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ADMIN_EMAIL = "hello@jobsynk.in";
const SUPPORT_EMAIL = "hello@jobsynk.in";

interface FaqQuestion {
  id: string;
  user_id: string;
  question: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
}

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ── Single question card ──────────────────────────────────────────────────────
function QuestionCard({ q }: { q: FaqQuestion }) {
  const [expanded, setExpanded] = useState(!!q.answer);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden"
      style={{
        background: "var(--bg-surface)",
        border: q.answer
          ? "1px solid rgba(122,184,64,0.2)"
          : "1px solid var(--border-default)",
      }}
    >
      {/* Question row */}
      <button
        onClick={() => q.answer && setExpanded(!expanded)}
        className="w-full text-left flex items-start gap-3 p-5"
        style={{ cursor: q.answer ? "pointer" : "default" }}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
          style={{
            background: q.answer ? "rgba(122,184,64,0.1)" : "rgba(192,88,0,0.08)",
            border: q.answer ? "1px solid rgba(122,184,64,0.2)" : "1px solid rgba(192,88,0,0.15)",
          }}
        >
          {q.answer
            ? <CheckCircle2 className="w-3.5 h-3.5 text-[#7ab840]" />
            : <Clock className="w-3.5 h-3.5 text-[#C05800]" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-medium text-[var(--text-primary)] leading-snug">
            {q.question}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[11px] text-[var(--text-muted)]">{timeAgo(q.created_at)}</span>
            {q.answer
              ? <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(122,184,64,0.1)", color: "#7ab840", border: "1px solid rgba(122,184,64,0.2)" }}>Answered</span>
              : <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(192,88,0,0.08)", color: "#C05800", border: "1px solid rgba(192,88,0,0.15)" }}>Awaiting response</span>}
          </div>
        </div>
        {q.answer && (expanded
          ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0 mt-1" />
          : <ChevronDown className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0 mt-1" />)}
      </button>

      {/* Answer */}
      <AnimatePresence>
        {expanded && q.answer && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mx-5 mb-5 p-4 rounded-xl" style={{ background: "rgba(122,184,64,0.06)", border: "1px solid rgba(122,184,64,0.12)" }}>
              <div className="flex items-center gap-2 mb-2.5">
                <img src="/icon.png" alt="JobSynk" className="w-6 h-6 rounded-full flex-shrink-0" />
                <span className="text-[13px] font-semibold text-[var(--text-primary)]">JobSynk</span>
                <VerifiedBadge />
                {q.answered_at && (
                  <span className="text-[10px] text-[var(--text-muted)]">· {timeAgo(q.answered_at)}</span>
                )}
              </div>
              <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                {q.answer}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function FaqPage() {
  const [questions, setQuestions] = useState<FaqQuestion[]>([]);
  const [loading, setLoading]     = useState(true);
  const [userId, setUserId]       = useState<string | null>(null);
  const [newQ, setNewQ]           = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
    });

    supabase
      .from("faq_questions")
      .select("*")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setQuestions((data as FaqQuestion[]) ?? []);
        setLoading(false);
      });
  }, []);

  async function handleSubmitQuestion() {
    if (!newQ.trim() || newQ.trim().length < 10) {
      toast.error("Question must be at least 10 characters.");
      return;
    }
    if (!userId) { toast.error("Sign in to post a question."); return; }
    setSubmitting(true);
    const supabase = createClient();
    const { data, error } = await supabase
      .from("faq_questions")
      .insert({ user_id: userId, question: newQ.trim() })
      .select()
      .single();
    setSubmitting(false);
    if (error) { toast.error("Failed to post question. Try again."); return; }
    setQuestions((prev) => [data as FaqQuestion, ...prev]);
    setNewQ("");
    toast.success("Question posted! We'll answer it soon.");
  }

  const answered   = questions.filter((q) => q.answer);
  const unanswered = questions.filter((q) => !q.answer);

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-16">

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <MessageCircle className="w-5 h-5 text-[#C05800]" />
          <h1 className="text-[22px] font-bold text-[var(--text-primary)]">Community FAQ</h1>
        </div>
        <p className="text-[13px] text-[var(--text-secondary)]">
          Questions asked by the community, answered by the JobSynk team.
        </p>
      </div>

      {/* ── Ask a question ── */}
      <div className="p-5 rounded-2xl" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
        <div className="flex items-center gap-1.5 mb-3">
          <Sparkles className="w-3.5 h-3.5 text-[#C05800]" />
          <span className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Ask a question</span>
        </div>
        <textarea
          value={newQ}
          onChange={(e) => setNewQ(e.target.value)}
          placeholder="What would you like to know about JobSynk? (min 10 characters)"
          rows={3}
          maxLength={1000}
          className="w-full px-3 py-2.5 rounded-xl text-[13px] text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border-default)] focus:border-[rgba(192,88,0,0.5)] focus:outline-none resize-none placeholder:text-[var(--text-muted)]"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-[11px] text-[var(--text-muted)]">{newQ.length}/1000</span>
          <button
            onClick={handleSubmitQuestion}
            disabled={submitting || newQ.trim().length < 10 || !userId}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold text-white disabled:opacity-40 transition-opacity"
            style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}
          >
            {submitting ? "Posting…" : <><Send className="w-3 h-3" /> Post question</>}
          </button>
        </div>
        {!userId && (
          <p className="text-[11px] text-[var(--text-muted)] mt-2">Sign in to post a question.</p>
        )}
      </div>

      {/* ── Questions list ── */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : questions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-[var(--border-subtle)]">
          <MessageCircle className="w-8 h-8 text-[var(--text-muted)] mb-3" />
          <p className="text-[14px] text-[var(--text-secondary)]">No questions yet</p>
          <p className="text-[12px] text-[var(--text-muted)] mt-1">Be the first to ask!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Unanswered first so admin sees what needs attention; users see them too */}
          {[...unanswered, ...answered].map((q) => (
            <QuestionCard key={q.id} q={q} />
          ))}
        </div>
      )}

      {/* ── Contact support footer ── */}
      <div className="rounded-2xl p-6 text-center" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
        <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">Did this answer your question?</p>
        <p className="text-[13px] text-[var(--text-secondary)] mb-4">
          Can't find what you're looking for? Reach out directly.
        </p>
        <a
          href="/support"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}
        >
          <Mail className="w-4 h-4" /> Contact support
        </a>
      </div>
    </div>
  );
}
