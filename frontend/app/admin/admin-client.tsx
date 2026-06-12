"use client";

import { useState } from "react";
import { Users, BarChart2, CreditCard, TrendingUp, Search, Plus } from "lucide-react";
import { toast } from "sonner";
import { createClient as createServiceClient } from "@supabase/supabase-js";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://dzdziagugdcbkictslrt.supabase.co";

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

export function AdminClient({
  users,
  stats,
  serviceKey,
}: {
  users: UserRow[];
  stats: Stats;
  serviceKey: string;
}) {
  const [query, setQuery] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [creditType, setCreditType] = useState<string>("ats_deep");
  const [creditAmt, setCreditAmt] = useState(1);

  const filtered = users.filter(
    (u) =>
      u.email?.toLowerCase().includes(query.toLowerCase()) ||
      u.full_name?.toLowerCase().includes(query.toLowerCase())
  );

  async function addCredits(userId: string) {
    setAdding(userId);
    try {
      const svc = createServiceClient(SUPABASE_URL, serviceKey);
      const { error } = await svc.from("user_credits").insert({
        user_id: userId,
        credit_type: creditType,
        credits_total: creditAmt,
        credits_used: 0,
      });
      if (error) throw error;
      toast.success(`Added ${creditAmt}× ${creditType} credit(s)`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add credits");
    } finally {
      setAdding(null);
    }
  }

  const statCards = [
    { label: "Total users",     value: stats.totalUsers,   icon: Users,     rgb: "192,88,0"  },
    { label: "Pro subscribers", value: stats.proUsers,     icon: CreditCard, rgb: "122,184,64" },
    { label: "Total analyses",  value: stats.totalAnalyses, icon: BarChart2,  rgb: "212,170,48" },
    { label: "New (7 days)",    value: stats.last7Days,    icon: TrendingUp, rgb: "113,54,0"  },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[22px] font-bold text-[var(--text-primary)] mb-1">Dashboard</h1>
        <p className="text-[13px] text-[var(--text-secondary)]">User management & platform stats</p>
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
  );
}
