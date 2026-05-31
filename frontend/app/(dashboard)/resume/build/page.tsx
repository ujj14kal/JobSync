"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient } from "@/lib/api/client";
import {
  Sparkles, Loader2, Copy, Check, ChevronDown, ChevronUp,
  Plus, Trash2, ExternalLink, FileText, Wand2, ArrowLeft,
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ResumeBuilderPage() {
  const [mode, setMode]     = useState<"scratch" | "enhance">("enhance");
  const [loading, setLoading] = useState(false);
  const [latex, setLatex]   = useState("");
  const [copied, setCopied] = useState(false);
  const [targetJob, setTargetJob] = useState("");

  // Contact
  const [name,      setName]      = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [location,  setLocation]  = useState("");
  const [linkedin,  setLinkedin]  = useState("");
  const [github,    setGithub]    = useState("");

  // Education
  const [education, setEducation] = useState<EducationEntry[]>([
    { degree: "", institution: "", location: "", start_date: "", end_date: "", gpa: "" }
  ]);

  // Experience
  const [experience, setExperience] = useState<ExperienceEntry[]>([
    { title: "", company: "", location: "", start_date: "", end_date: "Present", raw_bullets: [""] }
  ]);

  // Projects
  const [projects, setProjects] = useState<ProjectEntry[]>([
    { name: "", tech_stack: "", description: "", url: "" }
  ]);

  // Skills / other
  const [skillsRaw,   setSkillsRaw]   = useState("");
  const [activities,  setActivities]  = useState("");
  const [awards,      setAwards]      = useState("");

  // Sections collapse
  const [open, setOpen] = useState<Record<string, boolean>>({
    contact: true, education: true, experience: true, projects: true, other: false
  });
  const toggle = (k: string) => setOpen(p => ({ ...p, [k]: !p[k] }));

  async function generate() {
    setLoading(true);
    setLatex("");
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
      toast.success("Resume generated! Copy the LaTeX and paste into Overleaf.");
    } catch (e) {
      toast.error("Generation failed. Try again.");
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

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-1">
          <Link href="/resume" className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">AI Resume Builder</h1>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-[var(--accent-muted)] border-[var(--accent-primary)]/30 text-[var(--accent-hover)]">
            <Wand2 className="w-2.5 h-2.5" /> Jake's Resume template
          </span>
        </div>
        <p className="text-[14px] text-[var(--text-secondary)]">
          AI polishes your content → outputs Jake's Resume LaTeX → paste into Overleaf → download PDF.
        </p>
      </motion.div>

      {/* How it works */}
      <div className="flex items-stretch gap-3 text-center">
        {[
          { step: "1", label: "Fill form or use your uploaded resume" },
          { step: "2", label: "AI rewrites with action verbs & metrics" },
          { step: "3", label: "Copy LaTeX → paste into Overleaf" },
          { step: "4", label: "Download PDF in Jake's style" },
        ].map(s => (
          <div key={s.step} className="flex-1 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
            <div className="w-6 h-6 rounded-full bg-[var(--accent-muted)] text-[var(--accent-primary)] text-[11px] font-bold flex items-center justify-center mx-auto mb-1.5">{s.step}</div>
            <p className="text-[11px] text-[var(--text-muted)]">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ── Left: Input ── */}
        <div className="space-y-4">

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
                AI will read your uploaded resume, rewrite all bullet points with stronger action verbs and metrics, and output Jake's Resume LaTeX.
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
                          <Field label="Project Name" value={p.name} onChange={v => setProjects(pr => pr.map((x, j) => j === i ? { ...x, name: v } : x))} placeholder="JobSync" />
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

          <button
            onClick={generate}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white font-medium text-[14px] transition-colors disabled:opacity-50"
          >
            {loading
              ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating with AI…</>
              : <><Sparkles className="w-4 h-4" /> Generate Jake's Resume</>
            }
          </button>
        </div>

        {/* ── Right: Output ── */}
        <div>
          <AnimatePresence mode="wait">
            {!latex && !loading && (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-[var(--border-subtle)] text-center px-8"
              >
                <Wand2 className="w-10 h-10 text-[var(--text-muted)] mb-3" />
                <p className="text-[14px] font-medium text-[var(--text-secondary)] mb-1">LaTeX output appears here</p>
                <p className="text-[12px] text-[var(--text-muted)]">Fill the form and click Generate. Then copy the LaTeX into a new Overleaf project.</p>
              </motion.div>
            )}

            {loading && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="h-full flex flex-col items-center justify-center py-20 gap-4">
                <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-primary)]" />
                <div className="text-center">
                  <div className="text-[14px] font-medium text-[var(--text-primary)]">AI is writing your resume…</div>
                  <div className="text-[12px] text-[var(--text-muted)] mt-1">Adding action verbs, metrics, and ATS keywords</div>
                </div>
              </motion.div>
            )}

            {latex && !loading && (
              <motion.div key="output" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="space-y-3">
                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={copyLatex}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
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
                    The template is Jake's Resume — identical to the Overleaf Jake's Resume template.
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
                  <pre className="p-4 text-[11px] font-mono text-[#e6edf3] overflow-auto max-h-[560px] leading-relaxed whitespace-pre-wrap break-all">
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
