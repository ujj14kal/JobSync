"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  jobApplicationsApi,
  type JobApplication,
  type AppStatus,
  type StatusHistoryEntry,
} from "@/lib/api/job-applications";
import {
  Plus, Search, BarChart2, Briefcase, ExternalLink,
  Pencil, Trash2, ChevronDown, TrendingUp, CheckCircle2,
  XCircle, Clock, MessageSquare, DollarSign, MapPin, X,
  ChevronRight, Bell, LayoutGrid, List as ListIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<AppStatus, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  saved:        { label: "Saved",        color: "text-[var(--text-muted)]",  bg: "bg-[var(--bg-overlay)] border-[var(--border-subtle)]",   icon: Clock },
  applied:      { label: "Applied",      color: "text-[#C05800]",            bg: "bg-[#C05800]/10 border-[#C05800]/20",                    icon: Briefcase },
  screening:    { label: "Screening",    color: "text-[#d4aa30]",            bg: "bg-[#d4aa30]/10 border-[#d4aa30]/20",                    icon: MessageSquare },
  interviewing: { label: "Interviewing", color: "text-amber-400",            bg: "bg-amber-400/10 border-amber-400/20",                    icon: TrendingUp },
  offer:        { label: "Offer",        color: "text-emerald-400",          bg: "bg-emerald-400/10 border-emerald-400/20",                icon: CheckCircle2 },
  rejected:     { label: "Rejected",     color: "text-red-400",              bg: "bg-red-400/10 border-red-400/20",                        icon: XCircle },
  withdrawn:    { label: "Withdrawn",    color: "text-[var(--text-muted)]",  bg: "bg-[var(--bg-overlay)] border-[var(--border-subtle)]",   icon: X },
};

const STATUSES = Object.keys(STATUS_CONFIG) as AppStatus[];
const PRIORITY_COLORS = { low: "text-[var(--text-muted)]", medium: "text-[#d4aa30]", high: "text-red-400" };

// ─── Helpers ──────────────────────────────────────────────────────────────────
function daysInStatus(app: JobApplication): number {
  const history = app.status_history;
  const ref = history?.length ? history[history.length - 1].timestamp : app.created_at;
  return Math.floor((Date.now() - new Date(ref).getTime()) / 86_400_000);
}

// ─── Status Timeline ──────────────────────────────────────────────────────────
function StatusTimeline({ history }: { history?: StatusHistoryEntry[] }) {
  if (!history?.length || history.length <= 1) return null;
  return (
    <div className="flex items-start gap-1 mt-2.5 overflow-x-auto pb-0.5" style={{ scrollbarWidth: "none" }}>
      {history.map((entry, i) => {
        const cfg = STATUS_CONFIG[entry.status as AppStatus];
        if (!cfg) return null;
        const Icon = cfg.icon;
        const isLast = i === history.length - 1;
        return (
          <React.Fragment key={i}>
            <div className={cn("flex flex-col items-center shrink-0 transition-opacity", isLast ? "opacity-100" : "opacity-40")}>
              <div className={cn("flex items-center gap-1 text-[9px] font-medium whitespace-nowrap", cfg.color)}>
                <Icon className="w-2.5 h-2.5" />
                {cfg.label}
              </div>
              <span className="text-[8px] text-[var(--text-muted)] mt-0.5">
                {new Date(entry.timestamp).toLocaleDateString("en", { month: "short", day: "numeric" })}
              </span>
            </div>
            {!isLast && <ChevronRight className="w-2.5 h-2.5 text-[var(--text-muted)] shrink-0 mt-1" />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── Follow-up Badge ──────────────────────────────────────────────────────────
function FollowUpBadge({ date }: { date?: string }) {
  if (!date) return null;
  const daysUntil = Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
  const isOverdue = daysUntil < 0;
  const isUrgent = daysUntil >= 0 && daysUntil <= 2;
  return (
    <span className={cn(
      "flex items-center gap-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full border whitespace-nowrap",
      isOverdue ? "text-red-400 bg-red-400/10 border-red-400/20" :
      isUrgent  ? "text-amber-400 bg-amber-400/10 border-amber-400/20" :
      "text-[var(--text-muted)] bg-[var(--bg-overlay)] border-[var(--border-subtle)]"
    )}>
      <Bell className="w-2.5 h-2.5" />
      {isOverdue
        ? `${Math.abs(daysUntil)}d overdue`
        : daysUntil === 0 ? "Follow up today"
        : `Follow up in ${daysUntil}d`}
    </span>
  );
}

// ─── Add / Edit Modal ─────────────────────────────────────────────────────────
function ApplicationModal({
  initial,
  onClose,
  onSave,
}: {
  initial?: Partial<JobApplication>;
  onClose: () => void;
  onSave: (data: Partial<JobApplication>) => void;
}) {
  const [form, setForm] = useState<Partial<JobApplication>>({
    job_title: "", company: "", job_url: "", status: "saved",
    location: "", job_type: "full-time", work_mode: "remote",
    priority: "medium", notes: "",
    salary_min: undefined, salary_max: undefined, follow_up_date: undefined,
    ...initial,
  });

  function field(key: keyof JobApplication, value: unknown) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const inputCls = "w-full px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors";
  const selectCls = "w-full px-3 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]";
  const labelCls = "block text-[12px] text-[var(--text-muted)] mb-1.5 font-medium";

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
            {initial?.id ? "Edit Application" : "Track New Job"}
          </h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {([
            { label: "Job Title *", key: "job_title" as const, placeholder: "e.g. Senior Software Engineer" },
            { label: "Company *",   key: "company"   as const, placeholder: "e.g. Google" },
            { label: "Job URL",     key: "job_url"   as const, placeholder: "https://…" },
            { label: "Location",    key: "location"  as const, placeholder: "e.g. San Francisco, CA" },
          ] as const).map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className={labelCls}>{label}</label>
              <input
                value={(form[key] as string) || ""}
                onChange={(e) => field(key, e.target.value)}
                placeholder={placeholder}
                className={inputCls}
              />
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={(e) => field("status", e.target.value)} className={selectCls}>
                {STATUSES.map((s) => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select value={form.priority} onChange={(e) => field("priority", e.target.value)} className={selectCls}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Work Mode</label>
              <select value={form.work_mode} onChange={(e) => field("work_mode", e.target.value)} className={selectCls}>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Job Type</label>
              <select value={form.job_type} onChange={(e) => field("job_type", e.target.value)} className={selectCls}>
                {["full-time","part-time","contract","internship","freelance"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Min Salary ($)</label>
              <input type="number" value={form.salary_min || ""} onChange={(e) => field("salary_min", parseInt(e.target.value) || undefined)} placeholder="80000" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Max Salary ($)</label>
              <input type="number" value={form.salary_max || ""} onChange={(e) => field("salary_max", parseInt(e.target.value) || undefined)} placeholder="120000" className={inputCls} />
            </div>
          </div>

          <div>
            <label className={labelCls}>Follow-up Date</label>
            <input
              type="date"
              value={form.follow_up_date ? form.follow_up_date.split("T")[0] : ""}
              onChange={(e) => field("follow_up_date", e.target.value || undefined)}
              className={inputCls}
            />
          </div>

          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={form.notes || ""}
              onChange={(e) => field("notes", e.target.value)}
              placeholder="Any notes about this application…"
              rows={3}
              className={`${inputCls} resize-none`}
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border-default)] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
            Cancel
          </button>
          <button
            onClick={() => {
              if (!form.job_title || !form.company) { toast.error("Job title and company are required"); return; }
              onSave(form);
            }}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
          >
            {initial?.id ? "Save Changes" : "Add Application"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Kanban card (compact) ────────────────────────────────────────────────────
function KanbanCard({ app, onStatusChange, onEdit, onDelete }: {
  app: JobApplication;
  onStatusChange: (s: AppStatus) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [showMove, setShowMove] = useState(false);
  const days = daysInStatus(app);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-default)] group transition-all relative"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-semibold text-[var(--text-primary)] line-clamp-2">{app.job_title}</div>
          <div className="text-[11px] text-[var(--text-secondary)] mt-0.5 truncate">{app.company}</div>
        </div>
        <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
          <button onClick={onEdit} className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            <Pencil className="w-3 h-3" />
          </button>
          <button onClick={onDelete} className="p-1 rounded text-[var(--text-muted)] hover:text-red-400">
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 mt-2 flex-wrap">
        {app.ats_score && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[var(--accent-muted)] text-[var(--accent-primary)] border border-[var(--accent-primary)]/20">
            ATS {app.ats_score}
          </span>
        )}
        <span className={cn("text-[9px] font-medium capitalize", PRIORITY_COLORS[app.priority])}>{app.priority}</span>
        {days > 0 && <span className="text-[9px] text-[var(--text-muted)]">{days}d here</span>}
      </div>

      {app.follow_up_date && (
        <div className="mt-1.5">
          <FollowUpBadge date={app.follow_up_date} />
        </div>
      )}

      <div className="relative mt-2">
        <button
          onClick={() => setShowMove((v) => !v)}
          className="text-[9px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] flex items-center gap-0.5 transition-colors"
        >
          Move to <ChevronDown className="w-2.5 h-2.5" />
        </button>
        {showMove && (
          <div className="absolute top-full left-0 mt-1 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-xl z-20 py-1 min-w-[140px]">
            {STATUSES.filter((s) => s !== app.status).map((s) => {
              const cfg = STATUS_CONFIG[s];
              const Icon = cfg.icon;
              return (
                <button
                  key={s}
                  onClick={() => { onStatusChange(s); setShowMove(false); }}
                  className={cn("w-full flex items-center gap-2 px-3 py-1.5 text-[11px] hover:bg-[var(--bg-overlay)] transition-colors", cfg.color)}
                >
                  <Icon className="w-3 h-3" />{cfg.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Kanban board ─────────────────────────────────────────────────────────────
const KANBAN_COLS: AppStatus[] = ["saved", "applied", "screening", "interviewing", "offer", "rejected"];

function KanbanBoard({ apps, onStatusChange, onEdit, onDelete }: {
  apps: JobApplication[];
  onStatusChange: (id: string, s: AppStatus) => void;
  onEdit: (app: JobApplication) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4" style={{ scrollbarWidth: "thin" }}>
      {KANBAN_COLS.map((status) => {
        const cfg = STATUS_CONFIG[status];
        const col = apps.filter((a) => a.status === status);
        return (
          <div key={status} className="flex-shrink-0 w-[200px]">
            <div className={cn("flex items-center justify-between px-3 py-2 rounded-xl mb-2 border text-[11px] font-semibold", cfg.bg, cfg.color)}>
              <span>{cfg.label}</span>
              <span className="text-[10px] font-bold opacity-70">{col.length}</span>
            </div>
            <div className="space-y-2 min-h-[100px]">
              <AnimatePresence>
                {col.map((app) => (
                  <KanbanCard
                    key={app.id}
                    app={app}
                    onStatusChange={(s) => onStatusChange(app.id, s)}
                    onEdit={() => onEdit(app)}
                    onDelete={() => onDelete(app.id)}
                  />
                ))}
              </AnimatePresence>
              {col.length === 0 && (
                <div className="border border-dashed border-[var(--border-subtle)] rounded-xl h-14 flex items-center justify-center">
                  <span className="text-[10px] text-[var(--text-muted)]">Empty</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── List card (enhanced) ─────────────────────────────────────────────────────
function AppCard({ app, onEdit, onDelete, onStatusChange }: {
  app: JobApplication;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (s: AppStatus) => void;
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const sc = STATUS_CONFIG[app.status];
  const StatusIcon = sc.icon;
  const days = daysInStatus(app);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-default)] transition-all"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[14px] font-semibold text-[var(--text-primary)] truncate">{app.job_title}</span>
            <span className={cn("text-[10px] font-medium capitalize", PRIORITY_COLORS[app.priority])}>
              {app.priority} priority
            </span>
            {app.ats_score && (
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-muted)] text-[var(--accent-hover)] border border-[var(--accent-primary)]/20">
                ATS {app.ats_score}
              </span>
            )}
            {days > 0 && (
              <span className="text-[10px] text-[var(--text-muted)]">{days}d in {sc.label.toLowerCase()}</span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1 text-[12px] text-[var(--text-secondary)]">
            <span className="font-medium">{app.company}</span>
            {app.location && (
              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{app.location}</span>
            )}
            <span className="capitalize">{app.work_mode}</span>
          </div>

          {(app.salary_min || app.salary_max) && (
            <div className="flex items-center gap-1 mt-1 text-[11px] text-emerald-400">
              <DollarSign className="w-3 h-3" />
              {app.salary_min && `$${app.salary_min.toLocaleString()}`}
              {app.salary_min && app.salary_max && " – "}
              {app.salary_max && `$${app.salary_max.toLocaleString()}`}
            </div>
          )}

          {app.notes && (
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5 line-clamp-1">{app.notes}</p>
          )}

          {/* Status history trail */}
          <StatusTimeline history={app.status_history} />
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {app.job_url && (
            <a href={app.job_url} target="_blank" rel="noopener noreferrer"
              className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <button onClick={onEdit}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDelete}
            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-400 hover:bg-red-400/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <button
              onClick={() => setShowStatusMenu((v) => !v)}
              className={cn("flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors", sc.bg, sc.color)}
            >
              <StatusIcon className="w-3 h-3" />
              {sc.label}
              <ChevronDown className="w-3 h-3" />
            </button>
            {showStatusMenu && (
              <div className="absolute top-full left-0 mt-1 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-xl shadow-xl z-10 py-1 min-w-[140px]">
                {STATUSES.map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  const Icon = cfg.icon;
                  return (
                    <button
                      key={s}
                      onClick={() => { onStatusChange(s); setShowStatusMenu(false); }}
                      className={cn("w-full flex items-center gap-2 px-3 py-2 text-[12px] hover:bg-[var(--bg-overlay)] transition-colors", cfg.color)}
                    >
                      <Icon className="w-3.5 h-3.5" />{cfg.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <FollowUpBadge date={app.follow_up_date} />
        </div>
        <span className="text-[10px] text-[var(--text-muted)]">
          Added {new Date(app.created_at).toLocaleDateString()}
        </span>
      </div>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function JobTrackerPage() {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<AppStatus | "all">("all");
  const [showModal, setShowModal] = useState(false);
  const [editApp, setEditApp] = useState<JobApplication | null>(null);
  const [viewMode, setViewMode] = useState<"list" | "board">("list");
  const qc = useQueryClient();

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["job-applications"],
    queryFn: () => jobApplicationsApi.list(),
    staleTime: 4 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const { data: stats } = useQuery({
    queryKey: ["job-application-stats"],
    queryFn: jobApplicationsApi.stats,
    staleTime: 4 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: jobApplicationsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-applications"] });
      qc.invalidateQueries({ queryKey: ["job-application-stats"] });
      setShowModal(false);
      toast.success("Application added");
    },
    onError: () => toast.error("Failed to add application"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<JobApplication> & { id: string }) =>
      jobApplicationsApi.update(id, data),
    onMutate: async ({ id, status, ...rest }) => {
      await qc.cancelQueries({ queryKey: ["job-applications"] });
      const previous = qc.getQueryData<JobApplication[]>(["job-applications"]);
      qc.setQueryData<JobApplication[]>(["job-applications"], (old) =>
        old?.map((app) => app.id === id ? { ...app, ...(status ? { status } : {}), ...rest } : app) ?? []
      );
      return { previous };
    },
    onError: (_, __, ctx) => {
      if (ctx?.previous) qc.setQueryData(["job-applications"], ctx.previous);
      toast.error("Update failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-applications"] });
      qc.invalidateQueries({ queryKey: ["job-application-stats"] });
      setEditApp(null);
      toast.success("Updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: jobApplicationsApi.delete,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["job-applications"] });
      const previous = qc.getQueryData<JobApplication[]>(["job-applications"]);
      qc.setQueryData<JobApplication[]>(["job-applications"], (old) => old?.filter((a) => a.id !== id) ?? []);
      return { previous };
    },
    onError: (_, __, ctx) => {
      if (ctx?.previous) qc.setQueryData(["job-applications"], ctx.previous);
      toast.error("Failed to delete");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["job-applications"] });
      qc.invalidateQueries({ queryKey: ["job-application-stats"] });
      toast.success("Removed");
    },
  });

  const filtered = apps.filter((a) => {
    const matchSearch = !search ||
      a.job_title.toLowerCase().includes(search.toLowerCase()) ||
      a.company.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || a.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const statCards = [
    { label: "Total",         value: stats?.total ?? 0,                                                                                              color: "text-[var(--text-primary)]",    rgb: "255,255,255" },
    { label: "Active",        value: (stats?.by_status?.applied ?? 0) + (stats?.by_status?.screening ?? 0) + (stats?.by_status?.interviewing ?? 0), color: "text-[#C05800]",                rgb: "192,88,0" },
    { label: "Interviews",    value: stats?.by_status?.interviewing ?? 0,                                                                            color: "text-amber-400",                rgb: "251,191,36" },
    { label: "Offers",        value: stats?.offers ?? 0,                                                                                             color: "text-emerald-400",              rgb: "52,211,153" },
    { label: "Response Rate", value: `${stats?.response_rate ?? 0}%`,                                                                               color: "text-[#d4aa30]",                rgb: "212,170,48" },
    { label: "Avg ATS",       value: stats?.avg_ats_score ? `${Math.round(stats.avg_ats_score)}` : "—",                                             color: "text-[var(--accent-primary)]",  rgb: "192,88,0" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Job Tracker</h1>
          <p className="text-[14px] text-[var(--text-secondary)] mt-1">Track every application — saved to offer, with full history.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Job
        </button>
      </motion.div>

      {/* Stat cards */}
      <motion.div
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="grid grid-cols-3 md:grid-cols-6 gap-3"
      >
        {statCards.map(({ label, value, color, rgb }) => (
          <div
            key={label}
            className="p-4 rounded-2xl border border-[var(--border-subtle)] text-center relative overflow-hidden transition-all hover:border-[var(--border-default)] hover:scale-[1.02]"
            style={{ background: `linear-gradient(135deg,rgba(${rgb},0.06) 0%,rgba(${rgb},0.02) 100%)` }}
          >
            <div className={cn("text-2xl font-bold", color)}>{value}</div>
            <div className="text-[10px] text-[var(--text-muted)] mt-1 font-medium">{label}</div>
            <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: `linear-gradient(90deg,transparent,rgba(${rgb},0.4),transparent)` }} />
          </div>
        ))}
      </motion.div>

      {/* Filters + view toggle */}
      <div className="flex gap-3 flex-wrap items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search jobs…"
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
          />
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterStatus("all")}
            className={cn("px-3 py-2 rounded-xl border text-[12px] transition-colors", filterStatus === "all" ? "bg-[var(--accent-muted)] border-[var(--accent-primary)]/30 text-[var(--accent-hover)]" : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]")}
          >
            All ({apps.length})
          </button>
          {STATUSES.filter((s) => (stats?.by_status?.[s] ?? 0) > 0).map((s) => {
            const cfg = STATUS_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={cn("px-3 py-2 rounded-xl border text-[12px] transition-colors", filterStatus === s ? cn(cfg.bg, cfg.color) : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]")}
              >
                {cfg.label} ({stats?.by_status?.[s] ?? 0})
              </button>
            );
          })}
        </div>

        {/* List / Board toggle */}
        <div className="flex rounded-xl overflow-hidden border border-[var(--border-default)] bg-[var(--bg-surface)] shrink-0 ml-auto">
          <button
            onClick={() => setViewMode("list")}
            title="List view"
            className={cn("p-2.5 transition-colors", viewMode === "list" ? "bg-[var(--accent-muted)] text-[var(--accent-hover)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]")}
          >
            <ListIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => setViewMode("board")}
            title="Board view"
            className={cn("p-2.5 transition-colors", viewMode === "board" ? "bg-[var(--accent-muted)] text-[var(--accent-hover)]" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]")}
          >
            <LayoutGrid className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-[var(--bg-surface)] animate-pulse border border-[var(--border-subtle)]" />
          ))}
        </div>
      ) : apps.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-[var(--border-subtle)]">
          <Briefcase className="w-10 h-10 text-[var(--text-muted)] mb-3" />
          <p className="text-[14px] text-[var(--text-secondary)] mb-1">No applications yet</p>
          <p className="text-[12px] text-[var(--text-muted)] text-center max-w-xs mb-4">
            Start tracking jobs you&apos;ve found or applied to. Every status change is recorded automatically.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Add manually
            </button>
            <Link href="/analysis" className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[var(--border-default)] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
              <BarChart2 className="w-4 h-4" /> Run ATS Analysis
            </Link>
          </div>
        </div>
      ) : viewMode === "board" ? (
        <KanbanBoard
          apps={filtered}
          onStatusChange={(id, s) => updateMutation.mutate({ id, status: s })}
          onEdit={(app) => setEditApp(app)}
          onDelete={(id) => deleteMutation.mutate(id)}
        />
      ) : filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              onEdit={() => setEditApp(app)}
              onDelete={() => deleteMutation.mutate(app.id)}
              onStatusChange={(s) => updateMutation.mutate({ id: app.id, status: s })}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-16 rounded-2xl border border-dashed border-[var(--border-subtle)]">
          <p className="text-[14px] text-[var(--text-secondary)] mb-1">No results match your filter</p>
          <p className="text-[12px] text-[var(--text-muted)]">Try clearing filters or searching differently.</p>
        </div>
      )}

      {showModal && (
        <ApplicationModal onClose={() => setShowModal(false)} onSave={(data) => createMutation.mutate(data)} />
      )}
      {editApp && (
        <ApplicationModal
          initial={editApp}
          onClose={() => setEditApp(null)}
          onSave={(data) => updateMutation.mutate({ id: editApp.id, ...data })}
        />
      )}
    </div>
  );
}
