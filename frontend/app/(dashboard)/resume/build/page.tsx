"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { resumeBuilderApi } from "@/lib/api/resume-builder";
import { useUpsell } from "@/components/billing/UpsellModal";
import {
  Sparkles, Loader2, Copy, Check, ChevronDown, ChevronUp,
  Plus, Trash2, ExternalLink, FileText, Wand2, ArrowLeft, Lock,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

// ── Types ────────────────────────────────────────────────────────────────────

interface ExperienceEntry {
  title: string; company: string; location: string;
  start_date: string; end_date: string; raw_bullets: string[];
}
interface EducationEntry {
  degree: string; institution: string; location: string;
  start_date: string; end_date: string; gpa: string;
}
interface ProjectEntry {
  name: string; tech_stack: string; description: string; url: string;
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Field({ label, value, onChange, placeholder = "", multiline = false }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; multiline?: boolean;
}) {
  const cls = "w-full px-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors";
  return (
    <div>
      <label className="block text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">{label}</label>
      {multiline
        ? <textarea rows={3} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls + " resize-none"} />
        : <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} className={cls} />
      }
    </div>
  );
}

// Claude "A" logo mark
function ClaudeMark({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 41 41" fill="currentColor" className={className} aria-hidden>
      <path d="M23.5688 6L31.9999 35H27.8181L25.6817 27.7273H16.3635L14.2272 35H10.0454L18.4999 6H23.5688ZM21.0226 11.1591L17.477 24.4545H24.568L21.0226 11.1591Z"/>
    </svg>
  );
}

// ── Usage meter strip ─────────────────────────────────────────────────────────

function UsageMeter({
  used, limit, isPro, model,
}: {
  used: number; limit: number; isPro: boolean; model: "jobsynk-ai" | "claude-sonnet";
}) {
  const pct = Math.min((used / limit) * 100, 100);
  const atLimit = used >= limit;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* AI model badge */}
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
        style={isPro
          ? { background: "rgba(192,88,0,0.12)", border: "1px solid rgba(192,88,0,0.28)", color: "#C05800" }
          : { background: "rgba(122,184,64,0.10)", border: "1px solid rgba(122,184,64,0.28)", color: "#7ab840" }
        }
      >
        {isPro
          ? <><ClaudeMark size={11} /> Claude Sonnet · Pro</>
          : <><Zap className="w-3 h-3" /> JobSynk AI Engine · Free</>
        }
      </span>

      {/* Usage count + bar */}
      <div className="flex items-center gap-2">
        <span className={`text-[12px] ${atLimit ? "text-red-400" : "text-[var(--text-muted)]"}`}>
          {used} / {limit} {isPro ? "" : "free "}generation{limit !== 1 ? "s" : ""} used
        </span>
        <div className="h-1.5 w-24 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${pct}%`,
              background: atLimit ? "#ef4444" : isPro ? "#C05800" : "#7ab840",
            }}
          />
        </div>
      </div>

      {/* Upgrade nudge for free users with remaining uses */}
      {!isPro && !atLimit && (
        <span className="text-[11px] text-[var(--text-muted)]">
          · Upgrade to Pro for Claude Sonnet + {5} generations/month
        </span>
      )}
    </div>
  );
}

// ── Locked overlay (shown when free limit is hit) ─────────────────────────────

function LockedOverlay({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      className="p-6 rounded-2xl text-center space-y-4"
      style={{ background: "rgba(192,88,0,0.06)", border: "1px solid rgba(192,88,0,0.22)" }}
    >
      <div className="w-12 h-12 rounded-2xl flex items-center justify-center mx-auto"
        style={{ background: "linear-gradient(135deg,rgba(192,88,0,0.18),rgba(113,54,0,0.12))", border: "1px solid rgba(192,88,0,0.3)" }}>
        <Lock className="w-5 h-5 text-[#C05800]" />
      </div>
      <div>
        <p className="text-[15px] font-bold text-[var(--text-primary)] mb-1">Free limit reached</p>
        <p className="text-[13px] text-[var(--text-secondary)]">
          You&apos;ve used your 2 free resume generations this month.<br/>
          Upgrade to Pro to unlock <span className="font-semibold text-[#C05800]">Claude Sonnet</span> with 5 generations/month.
        </p>
      </div>
      <button
        onClick={onUpgrade}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-[13px] font-semibold transition-all"
        style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}
      >
        <ClaudeMark size={14} /> Upgrade to Pro · ₹299/month
      </button>
      <p className="text-[11px] text-[var(--text-muted)]">Resets on the 1st of each month</p>
    </motion.div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ResumeBuilderPage() {
  const [mode, setMode]       = useState<"scratch" | "enhance">("enhance");
  const [loading, setLoading] = useState(false);
  const [latex, setLatex]     = useState("");
  const [modelUsed, setModelUsed] = useState<"jobsynk-ai" | "claude-sonnet" | null>(null);
  const [copied, setCopied]   = useState(false);
  const [targetJob, setTargetJob] = useState("");
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { showUpsell } = useUpsell();
  const queryClient = useQueryClient();

  // Fetch quota from /resume-builder/status
  const { data: rbStatus, refetch: refetchStatus } = useQuery({
    queryKey: ["resume-builder-status"],
    queryFn: resumeBuilderApi.getStatus,
    staleTime: 30_000,
    retry: false,
    enabled: mounted, // only fetch after mount to prevent hydration issues
  });

  const isPro         = rbStatus?.plan === "pro";
  const usesUsed      = rbStatus?.uses_used ?? 0;
  const usesLimit     = rbStatus?.uses_limit ?? 2;
  const locked        = rbStatus?.locked ?? false;
  const requiresPro   = rbStatus?.requires_pro ?? false;
  const currentModel  = rbStatus?.model ?? "jobsynk-ai";

  // Contact
  const [name,      setName]      = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [location,  setLocation]  = useState("");
  const [linkedin,  setLinkedin]  = useState("");
  const [github,    setGithub]    = useState("");

  const [education, setEducation] = useState<EducationEntry[]>([
    { degree: "", institution: "", location: "", start_date: "", end_date: "", gpa: "" }
  ]);
  const [experience, setExperience] = useState<ExperienceEntry[]>([
    { title: "", company: "", location: "", start_date: "", end_date: "Present", raw_bullets: [""] }
  ]);
  const [projects, setProjects] = useState<ProjectEntry[]>([
    { name: "", tech_stack: "", description: "", url: "" }
  ]);
  const [skillsRaw,  setSkillsRaw]  = useState("");
  const [activities, setActivities] = useState("");
  const [awards,     setAwards]     = useState("");

  const [open, setOpen] = useState<Record<string, boolean>>({
    contact: true, education: true, experience: true, projects: true, other: false
  });
  const toggle = (k: string) => setOpen(p => ({ ...p, [k]: !p[k] }));

  const handleUpgrade = useCallback(() => {
    showUpsell({ feature: "AI Resume Builder", onProceed: () => {}, strict: true });
  }, [showUpsell]);

  async function generate() {
    // If free and at limit → upsell
    if (requiresPro) {
      handleUpgrade();
      return;
    }
    // If pro and at limit → friendly message
    if (locked) {
      toast.error(`Monthly limit reached (${usesLimit} generations). Resets on the 1st.`);
      return;
    }

    setLoading(true);
    setLatex("");
    setModelUsed(null);

    try {
      const body =
        mode === "enhance"
          ? { use_active_resume: true, target_job: targetJob, contact: { name: "", email: "", phone: "", location: "", linkedin: "", github: "" } }
          : {
              use_active_resume: false,
              target_job: targetJob,
              contact: { name, email, phone, location, linkedin, github },
              education,
              experience,
              projects,
              skills_raw: skillsRaw,
              activities,
              awards,
            };

      const { data } = await apiClient.post("/resume-builder/generate", body);
      setLatex(data.latex);
      setModelUsed(data.model_used ?? "jobsynk-ai");

      // Refresh the status so the meter updates
      queryClient.invalidateQueries({ queryKey: ["resume-builder-status"] });

      const aiLabel = data.model_used === "claude-sonnet" ? "Claude Sonnet" : "JobSynk AI Engine";
      toast.success(`Resume generated by ${aiLabel}! Copy the LaTeX and paste into Overleaf.`);
    } catch (e: any) {
      const detail = e?.response?.data?.detail ?? "";
      if (e?.response?.status === 402) {
        // Backend says free limit reached
        queryClient.invalidateQueries({ queryKey: ["resume-builder-status"] });
        handleUpgrade();
      } else if (e?.response?.status === 429) {
        toast.error(detail || "Monthly limit reached. Resets on the 1st.");
      } else {
        toast.error("Generation failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function copyLatex() {
    await navigator.clipboard.writeText(latex);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
    toast.success("LaTeX copied! Paste into a new Overleaf project.");
  }

  function SectionHeader({ id, title }: { id: string; title: string }) {
    return (
      <button
        onClick={() => toggle(id)}
        className="w-full flex items-center justify-between py-2 text-[13px] font-semibold text-[var(--text-primary)] border-b border-[var(--border-subtle)] mb-4"
      >
        {title}
        {open[id] ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
      </button>
    );
  }

  // Decide button content
  const buttonContent = () => {
    if (loading) return <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>;
    if (!mounted || !rbStatus) return <><Sparkles className="w-4 h-4" /> Generate Resume</>;
    if (requiresPro) return <><Lock className="w-4 h-4" /> Upgrade to Pro for More Generations</>;
    if (locked) return <><Sparkles className="w-4 h-4" /> Monthly Limit Reached</>;
    if (isPro) return <><ClaudeMark size={15} /> Generate with Claude Sonnet</>;
    return <><Zap className="w-4 h-4" /> Generate with JobSynk AI Engine ({usesLimit - usesUsed} free left)</>;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <Link href="/resume" className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">AI Resume Builder</h1>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-[var(--accent-muted)] border-[var(--accent-primary)]/30 text-[var(--accent-hover)]">
            <Wand2 className="w-2.5 h-2.5" /> Jake&apos;s Resume template
          </span>
        </div>
        <p className="text-[14px] text-[var(--text-secondary)]">
          AI polishes your content → outputs Jake&apos;s Resume LaTeX → paste into Overleaf → download PDF.
        </p>

        {/* Usage meter — deferred until mounted + status loaded */}
        {mounted && rbStatus && (
          <div className="mt-3">
            <UsageMeter
              used={usesUsed}
              limit={usesLimit}
              isPro={isPro}
              model={currentModel}
            />
          </div>
        )}
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] xl:grid-cols-[480px_1fr] gap-6 items-start">
        {/* ── Left: Input ── */}
        <div className="space-y-4">

          {/* Show locked overlay instead of form when free limit is hit */}
          {mounted && requiresPro ? (
            <>
              <LockedOverlay onUpgrade={handleUpgrade} />
              {/* Still show the form below (read-only feel) so they see what they'd fill */}
            </>
          ) : null}

          {/* Mode toggle */}
          <div className="flex rounded-xl overflow-hidden border border-[var(--border-default)]">
            <button onClick={() => setMode("enhance")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-[13px] font-medium transition-colors ${mode === "enhance" ? "bg-[var(--accent-primary)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
              <FileText className="w-3.5 h-3.5" /> Enhance My Resume
            </button>
            <button onClick={() => setMode("scratch")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-[13px] font-medium transition-colors ${mode === "scratch" ? "bg-[var(--accent-primary)] text-white" : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"}`}>
              <Plus className="w-3.5 h-3.5" /> From Scratch
            </button>
          </div>

          {mode === "enhance" && (
            <div className="p-4 rounded-xl border border-emerald-400/30 bg-emerald-400/5">
              <p className="text-[12px] text-emerald-400 font-medium mb-1">Using your active resume</p>
              <p className="text-[11px] text-[var(--text-muted)]">
                AI will read your uploaded resume, rewrite all bullet points with stronger action verbs and metrics, and output Jake&apos;s Resume LaTeX.
              </p>
            </div>
          )}

          {/* Target job */}
          <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-2">
            <label className="block text-[12px] font-medium text-[var(--text-secondary)]">
              Target Job Description <span className="text-[var(--text-muted)] font-normal">(optional — tailors keywords)</span>
            </label>
            <textarea
              rows={4}
              value={targetJob}
              onChange={e => setTargetJob(e.target.value)}
              placeholder="Paste the job description here to tailor your resume to this specific role…"
              className="w-full px-3 py-2 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] resize-none transition-colors"
            />
          </div>

          {/* From scratch form */}
          {mode === "scratch" && (
            <div className="p-4 rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-5">

              {/* Contact */}
              <div>
                <SectionHeader id="contact" title="Contact Information" />
                {open.contact && (
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="Full Name" value={name} onChange={setName} placeholder="Ujjwal Kalra" />
                    <Field label="Email" value={email} onChange={setEmail} placeholder="you@email.com" />
                    <Field label="Phone" value={phone} onChange={setPhone} placeholder="+91 98765 43210" />
                    <Field label="Location" value={location} onChange={setLocation} placeholder="Gurgaon, India" />
                    <Field label="LinkedIn URL" value={linkedin} onChange={setLinkedin} placeholder="linkedin.com/in/you" />
                    <Field label="GitHub URL" value={github} onChange={setGithub} placeholder="github.com/you" />
                  </div>
                )}
              </div>

              {/* Education */}
              <div>
                <SectionHeader id="education" title="Education" />
                {open.education && (
                  <div className="space-y-4">
                    {education.map((e, i) => (
                      <div key={i} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2 relative">
                        {education.length > 1 && (
                          <button onClick={() => setEducation(ed => ed.filter((_, j) => j !== i))}
                            className="absolute top-2 right-2 p-1 text-[var(--text-muted)] hover:text-[var(--error)]">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="Degree" value={e.degree} onChange={v => setEducation(ed => ed.map((x, j) => j === i ? { ...x, degree: v } : x))} placeholder="B.Tech CSE" />
                          <Field label="Institution" value={e.institution} onChange={v => setEducation(ed => ed.map((x, j) => j === i ? { ...x, institution: v } : x))} placeholder="Manipal University" />
                          <Field label="Start Date" value={e.start_date} onChange={v => setEducation(ed => ed.map((x, j) => j === i ? { ...x, start_date: v } : x))} placeholder="Aug 2022" />
                          <Field label="End Date" value={e.end_date} onChange={v => setEducation(ed => ed.map((x, j) => j === i ? { ...x, end_date: v } : x))} placeholder="May 2026" />
                          <Field label="GPA / %" value={e.gpa} onChange={v => setEducation(ed => ed.map((x, j) => j === i ? { ...x, gpa: v } : x))} placeholder="9.13 / 10" />
                          <Field label="Location" value={e.location} onChange={v => setEducation(ed => ed.map((x, j) => j === i ? { ...x, location: v } : x))} placeholder="Jaipur, India" />
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setEducation(e => [...e, { degree: "", institution: "", location: "", start_date: "", end_date: "", gpa: "" }])}
                      className="flex items-center gap-1.5 text-[12px] text-[var(--accent-primary)] hover:text-[var(--accent-hover)]">
                      <Plus className="w-3.5 h-3.5" /> Add Education
                    </button>
                  </div>
                )}
              </div>

              {/* Experience */}
              <div>
                <SectionHeader id="experience" title="Work Experience" />
                {open.experience && (
                  <div className="space-y-4">
                    {experience.map((e, i) => (
                      <div key={i} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2 relative">
                        {experience.length > 1 && (
                          <button onClick={() => setExperience(ex => ex.filter((_, j) => j !== i))}
                            className="absolute top-2 right-2 p-1 text-[var(--text-muted)] hover:text-[var(--error)]">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="Job Title" value={e.title} onChange={v => setExperience(ex => ex.map((x, j) => j === i ? { ...x, title: v } : x))} placeholder="Full Stack Developer" />
                          <Field label="Company" value={e.company} onChange={v => setExperience(ex => ex.map((x, j) => j === i ? { ...x, company: v } : x))} placeholder="KisanSetu" />
                          <Field label="Start Date" value={e.start_date} onChange={v => setExperience(ex => ex.map((x, j) => j === i ? { ...x, start_date: v } : x))} placeholder="July 2025" />
                          <Field label="End Date" value={e.end_date} onChange={v => setExperience(ex => ex.map((x, j) => j === i ? { ...x, end_date: v } : x))} placeholder="Present" />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-[var(--text-muted)] uppercase tracking-wider mb-1">Key Points (AI will polish these)</label>
                          {e.raw_bullets.map((b, bi) => (
                            <div key={bi} className="flex gap-2 mb-1.5">
                              <input
                                value={b}
                                onChange={v => setExperience(ex => ex.map((x, j) => j !== i ? x : { ...x, raw_bullets: x.raw_bullets.map((r, ri) => ri === bi ? v.target.value : r) }))}
                                placeholder="Describe what you built or achieved…"
                                className="flex-1 px-3 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[12px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)]"
                              />
                              {e.raw_bullets.length > 1 && (
                                <button onClick={() => setExperience(ex => ex.map((x, j) => j !== i ? x : { ...x, raw_bullets: x.raw_bullets.filter((_, ri) => ri !== bi) }))}>
                                  <Trash2 className="w-3.5 h-3.5 text-[var(--text-muted)] hover:text-[var(--error)]" />
                                </button>
                              )}
                            </div>
                          ))}
                          <button onClick={() => setExperience(ex => ex.map((x, j) => j !== i ? x : { ...x, raw_bullets: [...x.raw_bullets, ""] }))}
                            className="flex items-center gap-1 text-[11px] text-[var(--accent-primary)] mt-1">
                            <Plus className="w-3 h-3" /> Add point
                          </button>
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setExperience(e => [...e, { title: "", company: "", location: "", start_date: "", end_date: "Present", raw_bullets: [""] }])}
                      className="flex items-center gap-1.5 text-[12px] text-[var(--accent-primary)]">
                      <Plus className="w-3.5 h-3.5" /> Add Experience
                    </button>
                  </div>
                )}
              </div>

              {/* Projects */}
              <div>
                <SectionHeader id="projects" title="Projects" />
                {open.projects && (
                  <div className="space-y-3">
                    {projects.map((p, i) => (
                      <div key={i} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2 relative">
                        {projects.length > 1 && (
                          <button onClick={() => setProjects(pr => pr.filter((_, j) => j !== i))}
                            className="absolute top-2 right-2 p-1 text-[var(--text-muted)] hover:text-[var(--error)]">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="Project Name" value={p.name} onChange={v => setProjects(pr => pr.map((x, j) => j === i ? { ...x, name: v } : x))} placeholder="JobSynk" />
                          <Field label="Tech Stack" value={p.tech_stack} onChange={v => setProjects(pr => pr.map((x, j) => j === i ? { ...x, tech_stack: v } : x))} placeholder="Next.js, FastAPI, Supabase" />
                          <Field label="URL (optional)" value={p.url} onChange={v => setProjects(pr => pr.map((x, j) => j === i ? { ...x, url: v } : x))} placeholder="https://..." />
                        </div>
                        <Field label="Description" value={p.description} onChange={v => setProjects(pr => pr.map((x, j) => j === i ? { ...x, description: v } : x))} placeholder="What it does and your role…" multiline />
                      </div>
                    ))}
                    <button onClick={() => setProjects(p => [...p, { name: "", tech_stack: "", description: "", url: "" }])}
                      className="flex items-center gap-1.5 text-[12px] text-[var(--accent-primary)]">
                      <Plus className="w-3.5 h-3.5" /> Add Project
                    </button>
                  </div>
                )}
              </div>

              {/* Other */}
              <div>
                <SectionHeader id="other" title="Skills, Activities & Awards" />
                {open.other && (
                  <div className="space-y-3">
                    <Field label="Skills (comma-separated)" value={skillsRaw} onChange={setSkillsRaw}
                      placeholder="Python, React, Node.js, PostgreSQL, Docker, AWS…" multiline />
                    <Field label="Activities" value={activities} onChange={setActivities}
                      placeholder="Joint Head of Logistics — IEEE Student Branch, 2025-26…" multiline />
                    <Field label="Awards & Achievements" value={awards} onChange={setAwards}
                      placeholder="Dean's List — Manipal University, 2025…" multiline />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Generate button */}
          <button
            onClick={generate}
            disabled={loading || (mounted && !!rbStatus && locked && !requiresPro)}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-medium text-[14px] transition-all disabled:opacity-50"
            style={{ background: requiresPro && mounted
              ? "linear-gradient(135deg,rgba(192,88,0,0.5),rgba(113,54,0,0.4))"
              : "linear-gradient(135deg,#C05800,#713600)"
            }}
          >
            {buttonContent()}
          </button>
        </div>

        {/* ── Right: Output ── */}
        <div className="lg:sticky lg:top-6">
          <AnimatePresence mode="wait">
            {!latex && !loading && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-subtle)] text-center px-8"
                style={{ minHeight: "calc(100vh - 180px)" }}
              >
                <div className="mb-6 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                  style={{ background: "rgba(192,88,0,0.08)", border: "1px solid rgba(192,88,0,0.15)" }}>
                  <Wand2 className="w-7 h-7 text-[#C05800]" />
                </div>
                <p className="text-[16px] font-semibold text-[var(--text-secondary)] mb-2">LaTeX output appears here</p>
                <p className="text-[13px] text-[var(--text-muted)] max-w-xs leading-relaxed mb-6">Fill the form on the left and click Generate. The AI will write your resume and output it as LaTeX.</p>
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  {[
                    { n: "1", t: "Fill form or use your uploaded resume" },
                    { n: "2", t: "AI rewrites with action verbs & metrics" },
                    { n: "3", t: "Copy LaTeX → paste into Overleaf" },
                    { n: "4", t: "Download PDF in Jake's style" },
                  ].map(s => (
                    <div key={s.n} className="flex items-center gap-3 text-left px-4 py-2.5 rounded-xl"
                      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
                      <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0"
                        style={{ background: "rgba(192,88,0,0.15)", color: "#C05800" }}>{s.n}</span>
                      <span className="text-[12px] text-[var(--text-secondary)]">{s.t}</span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {loading && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center gap-4 rounded-2xl"
                style={{ minHeight: "calc(100vh - 180px)" }}>
                <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-primary)]" />
                <div className="text-center">
                  <div className="text-[14px] font-medium text-[var(--text-primary)]">
                    {isPro ? "Claude Sonnet is writing your resume…" : "JobSynk AI Engine is writing your resume…"}
                  </div>
                  <div className="text-[12px] text-[var(--text-muted)] mt-1">Adding action verbs, metrics, and ATS keywords</div>
                </div>
              </motion.div>
            )}

            {latex && !loading && (
              <motion.div key="output" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="space-y-3">
                {/* Model attribution */}
                {modelUsed && (
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                    {modelUsed === "claude-sonnet"
                      ? <><ClaudeMark size={11} className="text-[#C05800]" /> Generated by Claude Sonnet</>
                      : <><Zap className="w-3 h-3 text-[#7ab840]" /> Generated by JobSynk AI Engine</>
                    }
                    {modelUsed === "jobsynk-ai" && !isPro && (
                      <span>· <button onClick={handleUpgrade} className="text-[#C05800] hover:underline">Upgrade to Pro for Claude Sonnet</button></span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyLatex}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-[13px] font-medium transition-colors"
                    style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}
                  >
                    {copied ? <><Check className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy LaTeX</>}
                  </button>
                  <a
                    href="https://www.overleaf.com/project"
                    target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border-default)] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> Open Overleaf
                  </a>
                </div>

                {/* Instructions */}
                <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    <span className="font-semibold text-[var(--text-secondary)]">How to use:</span>{" "}
                    1. Copy LaTeX → 2. Open Overleaf → New Project → Blank → 3. Paste and replace all content → 4. Click Recompile → 5. Download PDF.
                  </p>
                </div>

                {/* LaTeX code */}
                <div className="relative rounded-2xl border border-[var(--border-default)] bg-[#0d1117] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border-subtle)]">
                    <span className="text-[11px] font-mono text-[var(--text-muted)]">resume.tex</span>
                    <button onClick={copyLatex} className="text-[11px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] flex items-center gap-1">
                      {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copied ? "Copied" : "Copy"}
                    </button>
                  </div>
                  <pre className="p-4 text-[11px] font-mono text-[#e6edf3] overflow-auto leading-relaxed whitespace-pre-wrap break-all" style={{ maxHeight: "calc(100vh - 300px)" }}>
                    {latex}
                  </pre>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
