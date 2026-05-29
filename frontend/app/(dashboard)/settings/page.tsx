"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi, type UserSettings } from "@/lib/api/settings";
import { resumeApi } from "@/lib/api/resume";
import {
  Bell, User, Brain, Shield, Briefcase, DollarSign,
  Save, Trash2, ChevronRight, Check, AlertTriangle, Plus, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Section = "profile" | "notifications" | "career" | "scoring" | "privacy";

const sections: { id: Section; label: string; icon: typeof Bell; desc: string }[] = [
  { id: "profile",       label: "Profile",        icon: User,        desc: "Your personal info and career stage" },
  { id: "notifications", label: "Notifications",  icon: Bell,        desc: "Control what alerts you receive" },
  { id: "career",        label: "Career Prefs",   icon: Briefcase,   desc: "Target roles, salary, work preferences" },
  { id: "scoring",       label: "AI Scoring",     icon: Brain,       desc: "Customize how your resume is scored" },
  { id: "privacy",       label: "Privacy",        icon: Shield,      desc: "Data and visibility controls" },
];

const CAREER_STAGES = ["student", "entry", "mid", "senior", "executive"];
const JOB_TYPES = ["full-time", "part-time", "contract", "internship", "freelance"];
const WORK_MODES = ["remote", "hybrid", "onsite"];

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        "relative w-10 h-5.5 rounded-full transition-colors duration-200 flex-shrink-0",
        checked ? "bg-[var(--accent-primary)]" : "bg-[var(--bg-overlay)] border border-[var(--border-default)]"
      )}
      style={{ height: "22px", width: "40px" }}
    >
      <span
        className={cn(
          "absolute top-0.5 w-[18px] h-[18px] rounded-full bg-white shadow transition-transform duration-200",
          checked ? "translate-x-[19px]" : "translate-x-0.5"
        )}
      />
    </button>
  );
}

function TagInput({
  values,
  onChange,
  placeholder,
}: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [input, setInput] = useState("");
  function add() {
    const trimmed = input.trim();
    if (trimmed && !values.includes(trimmed)) {
      onChange([...values, trimmed]);
    }
    setInput("");
  }
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {values.map((v) => (
          <span
            key={v}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--accent-muted)] border border-[var(--accent-primary)]/20 text-[12px] text-[var(--accent-hover)]"
          >
            {v}
            <button onClick={() => onChange(values.filter((x) => x !== v))}>
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="flex-1 px-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
        />
        <button
          onClick={add}
          className="px-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState<Section>("profile");
  const [profileForm, setProfileForm] = useState({ full_name: "", career_stage: "mid", target_role: "", target_company: "", industry: "" });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const qc = useQueryClient();

  const { data: settings, isLoading } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.get,
  });

  const { data: profile } = useQuery({
    queryKey: ["profile"],
    queryFn: settingsApi.getProfile,
  });

  const { data: resumes } = useQuery({
    queryKey: ["resumes"],
    queryFn: resumeApi.list,
  });

  useEffect(() => {
    if (profile) {
      setProfileForm({
        full_name: profile.full_name || "",
        career_stage: profile.career_stage || "mid",
        target_role: profile.target_role || "",
        target_company: profile.target_company || "",
        industry: profile.industry || "",
      });
    }
  }, [profile]);

  const updateSettings = useMutation({
    mutationFn: settingsApi.update,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); toast.success("Saved"); },
    onError: () => toast.error("Failed to save"),
  });

  const updateProfile = useMutation({
    mutationFn: settingsApi.updateProfile,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["profile"] }); toast.success("Profile updated"); },
    onError: () => toast.error("Failed to update profile"),
  });

  const deleteAccount = useMutation({
    mutationFn: settingsApi.deleteAccount,
    onSuccess: () => { window.location.href = "/"; },
  });

  function set<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    updateSettings.mutate({ [key]: value } as Partial<UserSettings>);
  }

  if (isLoading || !settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-transparent border-t-[var(--accent-primary)] animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Settings</h1>
        <p className="text-[14px] text-[var(--text-secondary)] mt-1">Manage your account and preferences</p>
      </motion.div>

      <div className="flex gap-6">
        {/* Sidebar nav */}
        <motion.div
          initial={{ opacity: 0, x: -12 }}
          animate={{ opacity: 1, x: 0 }}
          className="w-52 flex-shrink-0 space-y-1"
        >
          {sections.map((s) => (
            <button
              key={s.id}
              onClick={() => setActiveSection(s.id)}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all text-left",
                activeSection === s.id
                  ? "bg-[var(--accent-muted)] text-[var(--accent-hover)]"
                  : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              )}
            >
              <s.icon className={cn("w-4 h-4 flex-shrink-0", activeSection === s.id && "text-[var(--accent-primary)]")} />
              {s.label}
            </button>
          ))}

          <div className="pt-4 mt-4 border-t border-[var(--border-subtle)]">
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium text-red-400 hover:bg-red-400/10 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete Account
            </button>
          </div>
        </motion.div>

        {/* Content */}
        <motion.div
          key={activeSection}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex-1 space-y-5"
        >
          {/* ── PROFILE ─────────────────────────────────────────────── */}
          {activeSection === "profile" && (
            <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-5">
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Profile</h2>

              {[
                { label: "Full Name", key: "full_name" as const, placeholder: "Your full name" },
                { label: "Target Role", key: "target_role" as const, placeholder: "e.g. Senior Software Engineer" },
                { label: "Target Company", key: "target_company" as const, placeholder: "e.g. Google, Stripe" },
                { label: "Industry", key: "industry" as const, placeholder: "e.g. FinTech, Healthcare" },
              ].map(({ label, key, placeholder }) => (
                <div key={key}>
                  <label className="block text-[12px] text-[var(--text-muted)] mb-1.5 font-medium">{label}</label>
                  <input
                    value={profileForm[key]}
                    onChange={(e) => setProfileForm((p) => ({ ...p, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                  />
                </div>
              ))}

              <div>
                <label className="block text-[12px] text-[var(--text-muted)] mb-1.5 font-medium">Career Stage</label>
                <div className="flex gap-2 flex-wrap">
                  {CAREER_STAGES.map((s) => (
                    <button
                      key={s}
                      onClick={() => setProfileForm((p) => ({ ...p, career_stage: s }))}
                      className={cn(
                        "px-3 py-1.5 rounded-lg text-[12px] border capitalize transition-colors",
                        profileForm.career_stage === s
                          ? "bg-[var(--accent-muted)] border-[var(--accent-primary)]/30 text-[var(--accent-hover)]"
                          : "bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                      )}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-[12px] text-[var(--text-muted)] mb-1.5 font-medium">Default Resume</label>
                <select
                  value={settings.default_resume_id || ""}
                  onChange={(e) => set("default_resume_id", e.target.value as any)}
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                >
                  <option value="">— Select a resume —</option>
                  {resumes?.map((r: any) => (
                    <option key={r.id} value={r.id}>{r.file_name}</option>
                  ))}
                </select>
              </div>

              <button
                onClick={() => updateProfile.mutate(profileForm)}
                disabled={updateProfile.isPending}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors disabled:opacity-60"
              >
                <Save className="w-4 h-4" />
                {updateProfile.isPending ? "Saving…" : "Save Profile"}
              </button>
            </div>
          )}

          {/* ── NOTIFICATIONS ──────────────────────────────────────── */}
          {activeSection === "notifications" && (
            <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-5">
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Notifications</h2>
              {[
                { key: "email_notifications" as const, label: "Email notifications", desc: "Receive emails about your account activity" },
                { key: "analysis_notifications" as const, label: "Analysis complete", desc: "Notify when ATS analysis finishes" },
                { key: "mentor_notifications" as const, label: "Mentor recommendations", desc: "Get notified when new mentors match your profile" },
                { key: "weekly_digest" as const, label: "Weekly digest", desc: "Summary of your activity and job market trends" },
                { key: "marketing_emails" as const, label: "Product updates", desc: "News about new features and improvements" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-[var(--text-primary)]">{label}</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{desc}</p>
                  </div>
                  <Toggle checked={settings[key] as boolean} onChange={(v) => set(key, v as any)} />
                </div>
              ))}
            </div>
          )}

          {/* ── CAREER PREFS ──────────────────────────────────────── */}
          {activeSection === "career" && (
            <div className="space-y-5">
              <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-5">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Job Preferences</h2>

                <div>
                  <label className="block text-[12px] text-[var(--text-muted)] mb-2 font-medium">Job Types</label>
                  <div className="flex gap-2 flex-wrap">
                    {JOB_TYPES.map((t) => {
                      const active = settings.preferred_job_types.includes(t);
                      return (
                        <button
                          key={t}
                          onClick={() => set("preferred_job_types", active ? settings.preferred_job_types.filter((x) => x !== t) : [...settings.preferred_job_types, t])}
                          className={cn("px-3 py-1.5 rounded-lg text-[12px] border capitalize transition-colors", active ? "bg-[var(--accent-muted)] border-[var(--accent-primary)]/30 text-[var(--accent-hover)]" : "bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]")}
                        >
                          {t}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] text-[var(--text-muted)] mb-2 font-medium">Work Mode</label>
                  <div className="flex gap-2">
                    {WORK_MODES.map((m) => {
                      const active = settings.preferred_work_modes.includes(m);
                      return (
                        <button
                          key={m}
                          onClick={() => set("preferred_work_modes", active ? settings.preferred_work_modes.filter((x) => x !== m) : [...settings.preferred_work_modes, m])}
                          className={cn("px-3 py-1.5 rounded-lg text-[12px] border capitalize transition-colors", active ? "bg-[var(--accent-muted)] border-[var(--accent-primary)]/30 text-[var(--accent-hover)]" : "bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]")}
                        >
                          {m}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] text-[var(--text-muted)] mb-2 font-medium">Target Roles</label>
                  <TagInput values={settings.target_roles} onChange={(v) => set("target_roles", v)} placeholder="Add a target role…" />
                </div>

                <div>
                  <label className="block text-[12px] text-[var(--text-muted)] mb-2 font-medium">Target Companies</label>
                  <TagInput values={settings.target_companies} onChange={(v) => set("target_companies", v)} placeholder="Add a company…" />
                </div>

                <div>
                  <label className="block text-[12px] text-[var(--text-muted)] mb-2 font-medium">Preferred Locations</label>
                  <TagInput values={settings.preferred_locations} onChange={(v) => set("preferred_locations", v)} placeholder="Add a location (e.g. San Francisco, Remote)…" />
                </div>
              </div>

              <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-4">
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  Salary Expectations
                </h2>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Minimum ($)", key: "salary_expectation_min" as const },
                    { label: "Maximum ($)", key: "salary_expectation_max" as const },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label className="block text-[12px] text-[var(--text-muted)] mb-1.5">{label}</label>
                      <input
                        type="number"
                        defaultValue={settings[key] || ""}
                        onBlur={(e) => set(key, parseInt(e.target.value) || undefined as any)}
                        placeholder="e.g. 80000"
                        className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── AI SCORING ────────────────────────────────────────── */}
          {activeSection === "scoring" && (
            <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-6">
              <div>
                <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">AI Scoring Weights</h2>
                <p className="text-[12px] text-[var(--text-muted)] mt-1">
                  Adjust how much each dimension contributes to your overall ATS score. Must total 100%.
                </p>
              </div>

              {(Object.entries(settings.scoring_weights) as [string, number][]).map(([key, value]) => {
                const labels: Record<string, { label: string; desc: string }> = {
                  ats:       { label: "ATS Compatibility",    desc: "Format, sections, contact info" },
                  technical: { label: "Technical Fit",         desc: "Skill overlap with job requirements" },
                  semantic:  { label: "Semantic Match",        desc: "Meaning-based alignment via AI" },
                  recruiter: { label: "Recruiter Impression",  desc: "Action verbs, metrics, clarity" },
                  projects:  { label: "Project Relevance",     desc: "How well your projects match the role" },
                };
                const meta = labels[key] || { label: key, desc: "" };
                return (
                  <div key={key}>
                    <div className="flex justify-between mb-1.5">
                      <div>
                        <span className="text-[13px] font-medium text-[var(--text-primary)]">{meta.label}</span>
                        <span className="text-[11px] text-[var(--text-muted)] ml-2">{meta.desc}</span>
                      </div>
                      <span className="text-[13px] font-semibold text-[var(--accent-primary)]">
                        {Math.round(value * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={50}
                      step={5}
                      value={Math.round(value * 100)}
                      onChange={(e) => {
                        const newVal = parseInt(e.target.value) / 100;
                        const newWeights = { ...settings.scoring_weights, [key]: newVal };
                        set("scoring_weights", newWeights);
                      }}
                      className="w-full accent-[var(--accent-primary)]"
                    />
                  </div>
                );
              })}

              <div className={cn(
                "flex items-center gap-2 p-3 rounded-xl text-[12px]",
                Math.abs(Object.values(settings.scoring_weights).reduce((a, b) => a + b, 0) - 1.0) < 0.01
                  ? "bg-emerald-400/10 text-emerald-400"
                  : "bg-amber-400/10 text-amber-400"
              )}>
                {Math.abs(Object.values(settings.scoring_weights).reduce((a, b) => a + b, 0) - 1.0) < 0.01
                  ? <><Check className="w-3.5 h-3.5" /> Weights sum to 100% — perfect</>
                  : <><AlertTriangle className="w-3.5 h-3.5" /> Weights must sum to 100% (current: {Math.round(Object.values(settings.scoring_weights).reduce((a, b) => a + b, 0) * 100)}%)</>
                }
              </div>
            </div>
          )}

          {/* ── PRIVACY ───────────────────────────────────────────── */}
          {activeSection === "privacy" && (
            <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-5">
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Privacy & Data</h2>
              {[
                { key: "profile_public" as const, label: "Public profile", desc: "Allow mentors to see your profile for better matching" },
                { key: "share_analytics" as const, label: "Share analytics", desc: "Help improve JobSync with anonymous usage data" },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <p className="text-[13px] font-medium text-[var(--text-primary)]">{label}</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{desc}</p>
                  </div>
                  <Toggle checked={settings[key] as boolean} onChange={(v) => set(key, v as any)} />
                </div>
              ))}

              <div className="pt-4 border-t border-[var(--border-subtle)]">
                <h3 className="text-[13px] font-semibold text-[var(--text-primary)] mb-1">Your Data</h3>
                <p className="text-[12px] text-[var(--text-muted)] mb-3">
                  Your resumes are stored securely with private signed URLs. Raw text is stored to power ATS analysis.
                </p>
                <div className="flex gap-2">
                  <a
                    href="mailto:ujj.kalra10@gmail.com?subject=Data Export Request"
                    className="px-4 py-2 rounded-xl border border-[var(--border-default)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                  >
                    Request data export
                  </a>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </div>

      {/* Delete account modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[var(--bg-surface)] border border-red-400/20 rounded-2xl p-6 max-w-md w-full"
          >
            <div className="w-12 h-12 rounded-full bg-red-400/10 flex items-center justify-center mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400" />
            </div>
            <h3 className="text-[16px] font-semibold text-[var(--text-primary)] mb-2">Delete Account?</h3>
            <p className="text-[13px] text-[var(--text-secondary)] mb-6">
              This will permanently delete your account, all resumes, analyses, and job applications. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 px-4 py-2.5 rounded-xl border border-[var(--border-default)] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
                Cancel
              </button>
              <button
                onClick={() => deleteAccount.mutate()}
                disabled={deleteAccount.isPending}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-[13px] font-medium transition-colors disabled:opacity-60"
              >
                {deleteAccount.isPending ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
