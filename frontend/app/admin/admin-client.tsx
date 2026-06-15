"use client";

import { useState } from "react";
import {
  Users, BarChart2, CreditCard, TrendingUp, Search, Plus,
  MessageCircle, Trash2, Send, CheckCircle2, Clock,
} from "lucide-react";
import { toast } from "sonner";
import type { FaqQuestion } from "./page";

type UserRow = {
  id: string;
  email: string;
  full_name: string;
  career_stage: string;
  created_at: string;
  is_pro: boolean;
  credits: { type: string; remaining: number }[];
};

type Stats = {
  totalUsers: number;
  proUsers: number;
  totalAnalyses: number;
  last7Days: number;
};

const CREDIT_TYPES = ["ats_deep", "resume", "interview_voice"] as const;

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Verified badge (blue checkmark) ──────────────────────────────────────────
function VerifiedBadge() {
  return (
    <svg className="w-3.5 h-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#1d9bf0" />
      <path d="M8 12l3 3 5-5" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ── Community / FAQ section ───────────────────────────────────────────────────
function CommunitySection({
  initialQuestions,
  onDelete,
  onAnswer,
}: {
  initialQuestions: FaqQuestion[];
  onDelete: (id: string) => Promise<{ error?: string }>;
  onAnswer: (id: string, answer: string) => Promise<{ error?: string }>;
}) {
  const [questions, setQuestions] = useState(initialQuestions);
  const [drafts, setDrafts]       = useState<Record<string, string>>({});
  const [saving, setSaving]       = useState<string | null>(null);
  const [deleting, setDeleting]   = useState<string | null>(null);

  const unanswered = questions.filter((q) => !q.answer);
  const answered   = questions.filter((q) => q.answer);

  async function handleAnswer(id: string) {
    const text = (drafts[id] ?? "").trim();
    if (!text) return;
    setSaving(id);
    const res = await onAnswer(id, text);
    setSaving(null);
    if (res.error) { toast.error(res.error); return; }
    setQuestions((prev) =>
      prev.map((q) => q.id === id ? { ...q, answer: text, answered_at: new Date().toISOString() } : q)
    );
    setDrafts((d) => { const n = { ...d }; delete n[id]; return n; });
    toast.success("Answer posted!");
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    const res = await onDelete(id);
    setDeleting(null);
    if (res.error) { toast.error(res.error); return; }
    setQuestions((prev) => prev.filter((q) => q.id !== id));
    toast.success("Question deleted");
  }

  if (questions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-[var(--border-subtle)]">
        <MessageCircle className="w-8 h-8 text-[var(--text-muted)] mb-3" />
        <p className="text-[14px] text-[var(--text-secondary)]">No community questions yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Unanswered */}
      {unanswered.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Needs answer ({unanswered.length})
          </h3>
          {unanswered.map((q) => (
            <div
              key={q.id}
              className="rounded-2xl p-5 space-y-3"
              style={{ background: "var(--bg-surface)", border: "1px solid rgba(192,88,0,0.2)" }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: "rgba(192,88,0,0.08)", border: "1px solid rgba(192,88,0,0.15)" }}
                >
                  <Clock className="w-3 h-3 text-[#C05800]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--text-primary)] leading-snug">{q.question}</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">{timeAgo(q.created_at)}</p>
                </div>
                <button
                  onClick={() => handleDelete(q.id)}
                  disabled={deleting === q.id}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 flex-shrink-0"
                  title="Delete question"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Answer input */}
              <div className="space-y-2 pt-1">
                {/* Preview of how it will look */}
                {(drafts[q.id] ?? "").trim() && (
                  <div className="px-3 py-2.5 rounded-xl" style={{ background: "rgba(122,184,64,0.06)", border: "1px solid rgba(122,184,64,0.12)" }}>
                    <div className="flex items-center gap-2 mb-1.5">
                      <img src="/icon.png" alt="JobSynk" className="w-5 h-5 rounded-full flex-shrink-0" />
                      <span className="text-[12px] font-semibold text-[var(--text-primary)]">JobSynk</span>
                      <VerifiedBadge />
                    </div>
                    <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">
                      {drafts[q.id]}
                    </p>
                  </div>
                )}
                <textarea
                  value={drafts[q.id] ?? ""}
                  onChange={(e) => setDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                  placeholder="Write your answer as JobSynk…"
                  rows={3}
                  className="w-full px-3 py-2.5 rounded-xl text-[13px] text-[var(--text-primary)] bg-[var(--bg-elevated)] border border-[var(--border-default)] focus:border-[rgba(192,88,0,0.5)] focus:outline-none resize-none placeholder:text-[var(--text-muted)]"
                />
                <button
                  onClick={() => handleAnswer(q.id)}
                  disabled={!(drafts[q.id] ?? "").trim() || saving === q.id}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold text-white disabled:opacity-40 transition-opacity"
                  style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}
                >
                  {saving === q.id ? "Posting…" : <><Send className="w-3 h-3" /> Post as JobSynk</>}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Answered */}
      {answered.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
            Answered ({answered.length})
          </h3>
          {answered.map((q) => (
            <div
              key={q.id}
              className="rounded-2xl p-5 space-y-3"
              style={{ background: "var(--bg-surface)", border: "1px solid rgba(122,184,64,0.15)" }}
            >
              <div className="flex items-start gap-3">
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: "rgba(122,184,64,0.1)", border: "1px solid rgba(122,184,64,0.2)" }}
                >
                  <CheckCircle2 className="w-3 h-3 text-[#7ab840]" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--text-primary)] leading-snug">{q.question}</p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1">{timeAgo(q.created_at)}</p>
                </div>
                <button
                  onClick={() => handleDelete(q.id)}
                  disabled={deleting === q.id}
                  className="w-7 h-7 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-40 flex-shrink-0"
                  title="Delete question"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="px-3 py-2.5 rounded-xl" style={{ background: "rgba(122,184,64,0.06)", border: "1px solid rgba(122,184,64,0.12)" }}>
                <div className="flex items-center gap-2 mb-1.5">
                  <img src="/icon.png" alt="JobSynk" className="w-5 h-5 rounded-full flex-shrink-0" />
                  <span className="text-[12px] font-semibold text-[var(--text-primary)]">JobSynk</span>
                  <VerifiedBadge />
                  {q.answered_at && (
                    <span className="text-[10px] text-[var(--text-muted)]">· {timeAgo(q.answered_at)}</span>
                  )}
                </div>
                <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed whitespace-pre-wrap">{q.answer}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main admin client ─────────────────────────────────────────────────────────
export function AdminClient({
  users,
  stats,
  faqQuestions,
  onAddCredits,
  onDeleteFaq,
  onAnswerFaq,
}: {
  users: UserRow[];
  stats: Stats;
  faqQuestions: FaqQuestion[];
  onAddCredits: (userId: string, creditType: string, amount: number) => Promise<{ error?: string }>;
  onDeleteFaq: (id: string) => Promise<{ error?: string }>;
  onAnswerFaq: (id: string, answer: string) => Promise<{ error?: string }>;
}) {
  const [tab, setTab]         = useState<"users" | "community">("users");
  const [query, setQuery]     = useState("");
  const [adding, setAdding]   = useState<string | null>(null);
  const [creditType, setCreditType] = useState<string>("ats_deep");
  const [creditAmt, setCreditAmt]   = useState(1);

  const filtered = users.filter(
    (u) =>
      u.email?.toLowerCase().includes(query.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(query.toLowerCase())
  );

  async function addCredits(userId: string) {
    setAdding(userId);
    try {
      const result = await onAddCredits(userId, creditType, creditAmt);
      if (result?.error) throw new Error(result.error);
      toast.success(`Added ${creditAmt}× ${creditType} credit(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add credits");
    } finally {
      setAdding(null);
    }
  }

  const statCards = [
    { label: "Total users",     value: stats.totalUsers,    icon: Users,     rgb: "192,88,0"   },
    { label: "Pro subscribers", value: stats.proUsers,      icon: CreditCard, rgb: "122,184,64" },
    { label: "Total analyses",  value: stats.totalAnalyses, icon: BarChart2,  rgb: "212,170,48" },
    { label: "New (7 days)",    value: stats.last7Days,     icon: TrendingUp, rgb: "113,54,0"   },
  ];

  const unansweredCount = faqQuestions.filter((q) => !q.answer).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[22px] font-bold text-[var(--text-primary)] mb-1">Admin Portal</h1>
        <p className="text-[13px] text-[var(--text-secondary)]">User management & community</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(({ label, value, icon: Icon, rgb }) => (
          <div
            key={label}
            className="p-5 rounded-2xl text-center"
            style={{
              background: `rgba(${rgb},0.08)`,
              border: `1px solid rgba(${rgb},0.22)`,
            }}
          >
            <Icon className="w-5 h-5 mx-auto mb-2" style={{ color: `rgb(${rgb})` }} />
            <div className="text-[24px] font-bold" style={{ color: `rgb(${rgb})` }}>{value}</div>
            <div className="text-[11px] text-[var(--text-muted)] mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Tab nav */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: "var(--bg-surface)", border: "1px solid var(--border-default)" }}>
        {(["users", "community"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="relative flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-all"
            style={
              tab === t
                ? { background: "linear-gradient(135deg,#C05800,#713600)", color: "white" }
                : { color: "var(--text-secondary)" }
            }
          >
            {t === "users" ? <Users className="w-3.5 h-3.5" /> : <MessageCircle className="w-3.5 h-3.5" />}
            {t === "users" ? "Users" : "Community"}
            {t === "community" && unansweredCount > 0 && (
              <span className="ml-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                {unansweredCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Users tab ── */}
      {tab === "users" && (
        <div className="space-y-6">
          {/* Credit add controls */}
          <div className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-3">
            <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">
              Add credits
            </h2>
            <div className="flex items-center gap-3 flex-wrap">
              <select
                value={creditType}
                onChange={(e) => setCreditType(e.target.value)}
                className="px-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none"
              >
                {CREDIT_TYPES.map((t) => (
                  <option key={t} value={t} style={{ background: "var(--bg-elevated)" }}>
                    {t}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={1}
                max={50}
                value={creditAmt}
                onChange={(e) => setCreditAmt(Number(e.target.value))}
                className="w-20 px-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none"
              />
              <p className="text-[12px] text-[var(--text-muted)]">
                Select a user below then click <strong>+</strong> to add credits
              </p>
            </div>
          </div>

          {/* User table */}
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <h2 className="text-[13px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider flex-1">
                Users ({filtered.length})
              </h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by email or name…"
                  className="pl-9 pr-4 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none w-64"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--border-default)]">
                    {["User", "Stage", "Plan", "Credits", "Joined", ""].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div className="text-[13px] font-medium text-[var(--text-primary)]">
                          {u.full_name || "—"}
                        </div>
                        <div className="text-[11px] text-[var(--text-muted)]">{u.email}</div>
                      </td>
                      <td className="px-4 py-3 text-[12px] text-[var(--text-secondary)] capitalize">
                        {u.career_stage || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                            u.is_pro
                              ? "text-amber-400 bg-amber-400/10 border-amber-400/20"
                              : "text-[var(--text-muted)] bg-[var(--bg-elevated)] border-[var(--border-default)]"
                          }`}
                        >
                          {u.is_pro ? "Pro" : "Free"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {u.credits.length > 0 ? (
                          <div className="space-y-0.5">
                            {u.credits.map((c, i) => (
                              <div key={i} className="text-[11px] text-[var(--text-muted)]">
                                {c.type}: <span className="text-[var(--text-secondary)]">{c.remaining}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-[11px] text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-[11px] text-[var(--text-muted)]">
                        {new Date(u.created_at).toLocaleDateString("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "2-digit",
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => addCredits(u.id)}
                          disabled={adding === u.id}
                          title={`Add ${creditAmt}× ${creditType}`}
                          className="w-7 h-7 rounded-lg bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/20 transition-colors disabled:opacity-40"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-[13px] text-[var(--text-muted)]">
                        No users match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Community tab ── */}
      {tab === "community" && (
        <CommunitySection
          initialQuestions={faqQuestions}
          onDelete={onDeleteFaq}
          onAnswer={onAnswerFaq}
        />
      )}
    </div>
  );
}
