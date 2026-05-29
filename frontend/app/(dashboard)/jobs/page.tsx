"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  jobApplicationsApi,
  type JobApplication,
  type AppStatus,
} from "@/lib/api/job-applications";
import {
  Plus, Search, BarChart2, Briefcase, ExternalLink,
  Pencil, Trash2, ChevronDown, TrendingUp, CheckCircle2,
  XCircle, Clock, MessageSquare, DollarSign, MapPin, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import Link from "next/link";

// ─── Status config ────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<AppStatus, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  saved:        { label: "Saved",        color: "text-[var(--text-muted)]",  bg: "bg-[var(--bg-overlay)] border-[var(--border-subtle)]",    icon: Clock },
  applied:      { label: "Applied",      color: "text-blue-400",              bg: "bg-blue-400/10 border-blue-400/20",                        icon: Briefcase },
  screening:    { label: "Screening",    color: "text-purple-400",            bg: "bg-purple-400/10 border-purple-400/20",                    icon: MessageSquare },
  interviewing: { label: "Interviewing", color: "text-amber-400",             bg: "bg-amber-400/10 border-amber-400/20",                      icon: TrendingUp },
  offer:        { label: "Offer",        color: "text-emerald-400",           bg: "bg-emerald-400/10 border-emerald-400/20",                  icon: CheckCircle2 },
  rejected:     { label: "Rejected",     color: "text-red-400",               bg: "bg-red-400/10 border-red-400/20",                          icon: XCircle },
  withdrawn:    { label: "Withdrawn",    color: "text-[var(--text-muted)]",  bg: "bg-[var(--bg-overlay)] border-[var(--border-subtle)]",     icon: X },
};

const STATUSES = Object.keys(STATUS_CONFIG) as AppStatus[];
const PRIORITY_COLORS = { low: "text-[var(--text-muted)]", medium: "text-amber-400", high: "text-red-400" };

// ─── Add/Edit Modal ───────────────────────────────────────────────────────────
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
    salary_min: undefined, salary_max: undefined,
    ...initial,
  });

  function field(key: keyof JobApplication, value: any) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
            {initial?.id ? "Edit Application" : "Track New Job"}
          </h3>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-secondary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {[
            { label: "Job Title *", key: "job_title" as const, placeholder: "e.g. Senior Software Engineer" },
            { label: "Company *", key: "company" as const, placeholder: "e.g. Google" },
            { label: "Job URL", key: "job_url" as const, placeholder: "https://..." },
            { label: "Location", key: "location" as const, placeholder: "e.g. San Francisco, CA" },
          ].map(({ label, key, placeholder }) => (
            <div key={key}>
              <label className="block text-[12px] text-[var(--text-muted)] mb-1.5 font-medium">{label}</label>
              <input
                value={(form[key] as string) || ""}
                onChange={(e) => field(key, e.target.value)}
                placeholder={placeholder}
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
              />
            </div>
          ))}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] text-[var(--text-muted)] mb-1.5 font-medium">Status</label>
              <select
                value={form.status}
                onChange={(e) => field("status", e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none"
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[12px] text-[var(--text-muted)] mb-1.5 font-medium">Priority</label>
              <select
                value={form.priority}
                onChange={(e) => field("priority", e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] text-[var(--text-muted)] mb-1.5 font-medium">Work Mode</label>
              <select
                value={form.work_mode}
                onChange={(e) => field("work_mode", e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none"
              >
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">Onsite</option>
              </select>
            </div>
            <div>
              <label className="block text-[12px] text-[var(--text-muted)] mb-1.5 font-medium">Job Type</label>
              <select
                value={form.job_type}
                onChange={(e) => field("job_type", e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none"
              >
                {["full-time","part-time","contract","internship","freelance"].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[12px] text-[var(--text-muted)] mb-1.5 font-medium">Min Salary ($)</label>
              <input
                type="number"
                value={form.salary_min || ""}
                onChange={(e) => field("salary_min", parseInt(e.target.value) || undefined)}
                placeholder="80000"
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
            <div>
              <label className="block text-[12px] text-[var(--text-muted)] mb-1.5 font-medium">Max Salary ($)</label>
              <input
                type="number"
                value={form.salary_max || ""}
                onChange={(e) => field("salary_max", parseInt(e.target.value) || undefined)}
                placeholder="120000"
                className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          <div>
            <label className="block text-[12px] text-[var(--text-muted)] mb-1.5 font-medium">Notes</label>
            <textarea
              value={form.notes || ""}
              onChange={(e) => field("notes", e.target.value)}
              placeholder="Any notes about this application…"
              rows={3}
              className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] resize-none"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border-default)] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
            Cancel
          </button>
          <button
            onClick={() => { if (!form.job_title || !form.company) { toast.error("Job title and company are required"); return; } onSave(form); }}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
          >
            {initial?.id ? "Save Changes" : "Add Application"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Application Card ─────────────────────────────────────────────────────────
function AppCard({ app, onEdit, onDelete, onStatusChange }: {
  app: JobApplication;
  onEdit: () => void;
  onDelete: () => void;
  onStatusChange: (status: AppStatus) => void;
}) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);
  const sc = STATUS_CONFIG[app.status];
  const StatusIcon = sc.icon;

  return (
    <motion.div
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
        </div>

        {/* Actions */}
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

      {/* Status pill + changer */}
      <div className="mt-3 flex items-center justify-between">
        <div className="relative">
          <button
            onClick={() => setShowStatusMenu(!showStatusMenu)}
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
                    <Icon className="w-3.5 h-3.5" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <span className="text-[10px] text-[var(--text-muted)]">
          {new Date(app.created_at).toLocaleDateString()}
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
  const qc = useQueryClient();

  const { data: apps = [], isLoading } = useQuery({
    queryKey: ["job-applications"],
    queryFn: () => jobApplicationsApi.list(),
  });

  const { data: stats } = useQuery({
    queryKey: ["job-application-stats"],
    queryFn: jobApplicationsApi.stats,
  });

  const createMutation = useMutation({
    mutationFn: jobApplicationsApi.create,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["job-applications", "job-application-stats"] }); setShowModal(false); toast.success("Application added"); },
    onError: () => toast.error("Failed to add application"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: Partial<JobApplication> & { id: string }) => jobApplicationsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["job-applications", "job-application-stats"] }); setEditApp(null); toast.success("Updated"); },
    onError: () => toast.error("Update failed"),
  });

  const deleteMutation = useMutation({
    mutationFn: jobApplicationsApi.delete,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["job-applications", "job-application-stats"] }); toast.success("Removed"); },
  });

  const filtered = apps.filter((a) => {
    const matchSearch = !search ||
      a.job_title.toLowerCase().includes(search.toLowerCase()) ||
      a.company.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === "all" || a.status === filterStatus;
    return matchSearch && matchStatus;
  });

  const statCards = [
    { label: "Total",        value: stats?.total || 0,         color: "text-[var(--text-primary)]" },
    { label: "Applied",      value: (stats?.by_status?.applied || 0) + (stats?.by_status?.screening || 0) + (stats?.by_status?.interviewing || 0), color: "text-blue-400" },
    { label: "Interviews",   value: stats?.by_status?.interviewing || 0, color: "text-amber-400" },
    { label: "Offers",       value: stats?.offers || 0,        color: "text-emerald-400" },
    { label: "Response Rate",value: `${stats?.response_rate || 0}%`, color: "text-purple-400" },
    { label: "Avg ATS",      value: stats?.avg_ats_score ? `${stats.avg_ats_score}` : "—", color: "text-[var(--accent-primary)]" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Job Tracker</h1>
          <p className="text-[14px] text-[var(--text-secondary)] mt-1">Track every application from saved to offer.</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
        >
          <Plus className="w-4 h-4" /> Add Job
        </button>
      </motion.div>

      {/* Stats */}
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {statCards.map(({ label, value, color }) => (
          <div key={label} className="p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-center">
            <div className={cn("text-xl font-bold", color)}>{value}</div>
            <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{label}</div>
          </div>
        ))}
      </motion.div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
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
            className={cn("px-3 py-2 rounded-xl border text-[12px] transition-colors", filterStatus === "all" ? "bg-[var(--accent-muted)] border-[var(--accent-primary)]/30 text-[var(--accent-hover)]" : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-muted)]")}
          >
            All ({apps.length})
          </button>
          {STATUSES.filter((s) => (stats?.by_status?.[s] || 0) > 0).map((s) => {
            const cfg = STATUS_CONFIG[s];
            return (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={cn("px-3 py-2 rounded-xl border text-[12px] transition-colors", filterStatus === s ? cn(cfg.bg, cfg.color) : "bg-[var(--bg-surface)] border-[var(--border-subtle)] text-[var(--text-muted)]")}
              >
                {cfg.label} ({stats?.by_status?.[s] || 0})
              </button>
            );
          })}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-[var(--bg-surface)] animate-pulse border border-[var(--border-subtle)]" />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map((app) => (
            <AppCard
              key={app.id}
              app={app}
              onEdit={() => setEditApp(app)}
              onDelete={() => deleteMutation.mutate(app.id)}
              onStatusChange={(status) => updateMutation.mutate({ id: app.id, status })}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-[var(--border-subtle)]">
          <Briefcase className="w-10 h-10 text-[var(--text-muted)] mb-3" />
          <p className="text-[14px] text-[var(--text-secondary)] mb-1">
            {apps.length === 0 ? "No applications yet" : "No results match your filter"}
          </p>
          <p className="text-[12px] text-[var(--text-muted)] text-center max-w-xs mb-4">
            {apps.length === 0
              ? "Start tracking jobs you've found or applied to. You can also add from an ATS analysis."
              : "Try clearing filters or searching differently."}
          </p>
          {apps.length === 0 && (
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
          )}
        </div>
      )}

      {/* Modals */}
      {showModal && (
        <ApplicationModal
          onClose={() => setShowModal(false)}
          onSave={(data) => createMutation.mutate(data)}
        />
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
