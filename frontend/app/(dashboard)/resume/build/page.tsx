"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { resumeBuilderApi } from "@/lib/api/resume-builder";
import { CheckoutModal } from "@/components/billing/CheckoutModal";
import {
  Sparkles, Loader2, Copy, Check, ChevronDown, ChevronUp,
  Plus, Trash2, ExternalLink, FileText, Wand2, ArrowLeft, Lock,
  Zap, Award, Shield,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

// ── Template definitions ──────────────────────────────────────────────────────

type AtsRating = "preferred" | "friendly" | "mixed" | "not-preferred";

interface TemplateInfo {
  id: string;
  name: string;
  ats: AtsRating;
  recommended?: boolean;
  description: string;
  tag?: string;
}

const TEMPLATES: TemplateInfo[] = [
  {
    id: "jake",
    name: "Jake's Resume",
    ats: "preferred",
    recommended: true,
    description: "Clean single-column. Industry standard for FAANG.",
  },
  {
    id: "ats-max",
    name: "ATS Max",
    ats: "preferred",
    description: "Skills placed first — max keyword density for ATS parsers.",
    tag: "Best ATS Score",
  },
  {
    id: "elegant",
    name: "Elegant",
    ats: "preferred",
    description: "Accent-blue headers with clean typography. Polished look.",
    tag: "New",
  },
  {
    id: "minimal",
    name: "Minimal",
    ats: "preferred",
    description: "Ultra-clean, no frills. Works everywhere.",
  },
  {
    id: "compact",
    name: "Compact",
    ats: "friendly",
    description: "Tighter spacing — fits more content on one page.",
  },
  {
    id: "modern",
    name: "Modern",
    ats: "mixed",
    description: "Dark header, accent color. Visually striking.",
  },
  {
    id: "two-column",
    name: "Two-Column",
    ats: "not-preferred",
    description: "Sidebar layout. Great for print, risky for ATS.",
  },
];

const ATS_CONFIG: Record<AtsRating, { label: string; color: string; bg: string; dot: string }> = {
  "preferred":     { label: "ATS Preferred",     color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200",   dot: "bg-emerald-500" },
  "friendly":      { label: "ATS Friendly",       color: "text-green-600",   bg: "bg-green-50 border-green-200",       dot: "bg-green-500" },
  "mixed":         { label: "ATS Mixed",           color: "text-amber-600",   bg: "bg-amber-50 border-amber-200",       dot: "bg-amber-500" },
  "not-preferred": { label: "Not ATS Preferred",   color: "text-red-600",     bg: "bg-red-50 border-red-200",           dot: "bg-red-500" },
};

// ── Mini template thumbnails ──────────────────────────────────────────────────

function ThumbJakes() {
  return (
    <div className="w-full h-full bg-white rounded p-[6px] overflow-hidden" style={{ fontFamily: "serif" }}>
      <div className="text-center mb-[3px]">
        <div className="text-[5px] font-bold tracking-widest uppercase text-gray-900">John Doe</div>
        <div className="text-[3px] text-gray-500 mt-[1px]">email | phone | linkedin | github</div>
      </div>
      <div className="border-b border-gray-400 mb-[3px]" />
      {[
        { section: "Education", rows: [["University of Technology", "2022–2026"], ["B.Tech Computer Science", "9.1 GPA"]] },
        { section: "Experience", rows: [["Software Engineer", "2024–Present"], ["Tech Corp, New Delhi", ""]] },
        { section: "Projects", rows: [["JobSync AI Platform", "Next.js, FastAPI"]] },
        { section: "Skills", rows: [["Python, React, FastAPI, PostgreSQL, Docker, AWS", ""]] },
      ].map(({ section, rows }) => (
        <div key={section} className="mb-[3px]">
          <div className="text-[3.5px] font-bold uppercase tracking-wider text-gray-900 border-b border-gray-400 pb-[1px] mb-[1.5px]">{section}</div>
          {rows.map((row, i) => (
            <div key={i} className="flex justify-between text-[3px] text-gray-600 leading-[1.4]">
              <span className="font-medium">{row[0]}</span>
              {row[1] && <span className="text-gray-400">{row[1]}</span>}
            </div>
          ))}
          {section === "Experience" && (
            <div className="mt-[1px] space-y-[1px]">
              {["• Built scalable REST APIs serving 50k users", "• Reduced latency by 40% via caching"].map((b, i) => (
                <div key={i} className="text-[2.8px] text-gray-500">{b}</div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ThumbAtsMax() {
  return (
    <div className="w-full h-full bg-white rounded p-[6px] overflow-hidden" style={{ fontFamily: "serif" }}>
      <div className="text-center mb-[3px]">
        <div className="text-[5px] font-bold tracking-widest uppercase text-gray-900">John Doe</div>
        <div className="text-[3px] text-gray-500 mt-[1px]">email | phone | linkedin | github</div>
      </div>
      <div className="border-b border-gray-400 mb-[3px]" />
      {[
        { section: "Education", rows: [["B.Tech CSE — University", "2022–2026"]] },
        { section: "Technical Skills", rows: [["Languages: Python, TypeScript, Go, Java", ""], ["Frameworks: React, FastAPI, Next.js", ""], ["Cloud: AWS, GCP, Docker, K8s", ""]] },
        { section: "Experience", rows: [["Software Engineer — Tech Corp", "2024–Present"]] },
        { section: "Projects", rows: [["JobSync AI", "Next.js, FastAPI"]] },
      ].map(({ section, rows }) => (
        <div key={section} className="mb-[2.5px]">
          <div className="text-[3.5px] font-bold uppercase tracking-wider text-gray-900 border-b border-gray-400 pb-[1px] mb-[1px]">{section}</div>
          {rows.map((row, i) => (
            <div key={i} className="flex justify-between text-[2.8px] text-gray-600 leading-[1.4]">
              <span>{row[0]}</span>
              {row[1] && <span className="text-gray-400">{row[1]}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ThumbElegant() {
  return (
    <div className="w-full h-full bg-white rounded p-[6px] overflow-hidden" style={{ fontFamily: "sans-serif" }}>
      <div className="text-center mb-[4px]">
        <div className="text-[6px] font-bold text-[#1a4b9b]">John Doe</div>
        <div className="text-[2.8px] text-gray-500 mt-[1px]">email · phone · location · linkedin</div>
      </div>
      {[
        { label: "Education", items: ["University of Technology", "B.Tech CSE · GPA 9.1 · 2022–2026"] },
        { label: "Experience", items: ["Software Engineer — Tech Corp", "• Built scalable APIs", "• Led 4-person team"] },
        { label: "Projects", items: ["JobSync AI — Next.js, FastAPI", "• AI-powered career platform"] },
        { label: "Technical Skills", items: ["Python · React · FastAPI · PostgreSQL · AWS"] },
      ].map(({ label, items }) => (
        <div key={label} className="mb-[3px]">
          <div className="text-[3.5px] font-bold text-[#1a4b9b] mb-[0.5px]">{label}</div>
          <div className="border-b mb-[1.5px]" style={{ borderColor: "#1a4b9b", opacity: 0.5 }} />
          {items.map((it, i) => (
            <div key={i} className="text-[2.8px] text-gray-600 leading-[1.5]">{it}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ThumbMinimal() {
  return (
    <div className="w-full h-full bg-white rounded p-[6px] overflow-hidden" style={{ fontFamily: "sans-serif" }}>
      <div className="mb-[3px]">
        <div className="text-[6px] font-bold text-gray-900">JOHN DOE</div>
        <div className="text-[3px] text-gray-500">email · phone · linkedin · github</div>
      </div>
      <div className="border-t-2 border-gray-900 mb-[3px]" />
      {[
        { label: "EXPERIENCE", items: ["Software Engineer — Tech Corp", "2024–Present", "• Built scalable systems", "• Led 4-person team"] },
        { label: "EDUCATION", items: ["B.Tech CSE — University", "2022–2026, GPA 9.1"] },
        { label: "SKILLS", items: ["Python · React · FastAPI · PostgreSQL · AWS"] },
      ].map(({ label, items }) => (
        <div key={label} className="mb-[3px]">
          <div className="text-[3.5px] font-bold uppercase tracking-widest text-gray-900 mb-[1px]">{label}</div>
          {items.map((it, i) => (
            <div key={i} className="text-[3px] text-gray-600 leading-[1.5]">{it}</div>
          ))}
        </div>
      ))}
    </div>
  );
}

function ThumbCompact() {
  return (
    <div className="w-full h-full bg-white rounded p-[5px] overflow-hidden" style={{ fontFamily: "serif" }}>
      <div className="text-center mb-[2px]">
        <div className="text-[5px] font-bold tracking-widest uppercase text-gray-900">John Doe</div>
        <div className="text-[2.8px] text-gray-500">email | phone | linkedin</div>
      </div>
      <div className="border-b border-gray-400 mb-[2px]" />
      {["Education", "Experience", "Projects", "Activities", "Skills"].map(section => (
        <div key={section} className="mb-[2px]">
          <div className="text-[3px] font-bold uppercase tracking-wider text-gray-900 border-b border-gray-400 pb-[1px] mb-[1px]">{section}</div>
          <div className="text-[2.8px] text-gray-600 leading-[1.4]">
            {section === "Skills" ? "Python, React, FastAPI, PostgreSQL, Docker, AWS, GCP" : "Content • Content • Content • Content"}
          </div>
          {section !== "Skills" && section !== "Education" && (
            <div className="text-[2.5px] text-gray-400">• Point · • Point · • Point</div>
          )}
        </div>
      ))}
    </div>
  );
}

function ThumbModern() {
  return (
    <div className="w-full h-full bg-white rounded overflow-hidden" style={{ fontFamily: "sans-serif" }}>
      <div className="px-[6px] py-[4px] mb-[3px]" style={{ background: "#16243a" }}>
        <div className="text-[5.5px] font-bold text-white">John Doe</div>
        <div className="text-[2.8px] mt-[1px]" style={{ color: "rgba(255,255,255,0.6)" }}>email | phone | linkedin | github</div>
      </div>
      <div className="px-[6px]">
        {[
          { label: "Experience", items: ["Software Engineer", "Tech Corp · 2024–Present", "• Built scalable APIs", "• Led team of 4 engineers"] },
          { label: "Projects", items: ["JobSync AI — Next.js, FastAPI", "• AI-powered career platform"] },
          { label: "Skills", items: ["Python · React · FastAPI · PostgreSQL"] },
        ].map(({ label, items }) => (
          <div key={label} className="mb-[3px]">
            <div className="text-[3.5px] font-bold uppercase tracking-wider mb-[1px]" style={{ color: "#4e8cdc" }}>{label}</div>
            <div className="border-b mb-[1.5px]" style={{ borderColor: "#4e8cdc", opacity: 0.5 }} />
            {items.map((it, i) => (
              <div key={i} className="text-[3px] text-gray-600 leading-[1.5]">{it}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function ThumbTwoColumn() {
  return (
    <div className="w-full h-full bg-white rounded overflow-hidden flex flex-col" style={{ fontFamily: "sans-serif" }}>
      <div className="border-b border-gray-300 px-[5px] py-[3px] text-center">
        <div className="text-[5px] font-bold text-gray-900">John Doe</div>
      </div>
      <div className="flex flex-1 overflow-hidden">
        <div className="w-[38%] px-[4px] py-[3px]" style={{ background: "#f0f3f8", borderRight: "1px solid #dde3ec" }}>
          {[
            { label: "Contact", items: ["email@mail.com", "+91 98765", "New Delhi"] },
            { label: "Skills", items: ["Python", "React", "FastAPI", "PostgreSQL"] },
            { label: "Education", items: ["B.Tech CSE", "University 2026", "GPA 9.1"] },
          ].map(({ label, items }) => (
            <div key={label} className="mb-[3px]">
              <div className="text-[3px] font-bold uppercase mb-[1px]" style={{ color: "#1e50a0" }}>{label}</div>
              <div className="border-b mb-[1px]" style={{ borderColor: "#1e50a0", opacity: 0.4 }} />
              {items.map((it, i) => <div key={i} className="text-[2.8px] text-gray-600 leading-[1.5]">{it}</div>)}
            </div>
          ))}
        </div>
        <div className="flex-1 px-[4px] py-[3px]">
          {[
            { label: "Experience", items: ["Software Engineer", "Tech Corp · 2024–Present", "• Built scalable APIs", "• Reduced latency 40%"] },
            { label: "Projects", items: ["JobSync AI — Next.js", "• AI career platform"] },
          ].map(({ label, items }) => (
            <div key={label} className="mb-[3px]">
              <div className="text-[3px] font-bold uppercase mb-[1px]" style={{ color: "#1e50a0" }}>{label}</div>
              <div className="border-b mb-[1.5px]" style={{ borderColor: "#1e50a0", opacity: 0.4 }} />
              {items.map((it, i) => <div key={i} className="text-[2.8px] text-gray-600 leading-[1.5]">{it}</div>)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const TEMPLATE_THUMBNAILS: Record<string, React.ReactNode> = {
  jake:          <ThumbJakes />,
  "ats-max":     <ThumbAtsMax />,
  elegant:       <ThumbElegant />,
  minimal:       <ThumbMinimal />,
  compact:       <ThumbCompact />,
  modern:        <ThumbModern />,
  "two-column":  <ThumbTwoColumn />,
};

// ── Template Card ─────────────────────────────────────────────────────────────

function TemplateCard({ tmpl, selected, onClick }: { tmpl: TemplateInfo; selected: boolean; onClick: () => void }) {
  const ats = ATS_CONFIG[tmpl.ats];
  return (
    <button
      onClick={onClick}
      className="relative flex flex-col items-stretch text-left transition-all rounded-xl overflow-hidden focus:outline-none w-full"
      style={{
        border: selected
          ? "2px solid var(--accent-primary)"
          : "2px solid var(--border-default)",
        background: selected ? "var(--bg-elevated)" : "var(--bg-surface)",
        boxShadow: selected ? "0 0 0 3px rgba(192,88,0,0.12)" : "none",
      }}
    >
      {tmpl.recommended && (
        <div className="absolute top-1.5 left-1.5 z-10 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-white"
          style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}>
          ★ Recommended
        </div>
      )}
      {tmpl.tag && !tmpl.recommended && (
        <div className="absolute top-1.5 left-1.5 z-10 px-1.5 py-0.5 rounded-full text-[9px] font-semibold"
          style={{ background: "rgba(26,75,155,0.12)", color: "#1a4b9b", border: "1px solid rgba(26,75,155,0.25)" }}>
          {tmpl.tag}
        </div>
      )}
      {selected && (
        <div className="absolute top-1.5 right-1.5 z-10 w-4 h-4 rounded-full flex items-center justify-center"
          style={{ background: "var(--accent-primary)" }}>
          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
      <div className="w-full overflow-hidden" style={{ height: 110, background: "#f8f9fa", borderBottom: "1px solid var(--border-subtle)" }}>
        {TEMPLATE_THUMBNAILS[tmpl.id]}
      </div>
      <div className="p-2 space-y-1">
        <div className="text-[11px] font-semibold text-[var(--text-primary)]">{tmpl.name}</div>
        <div className={`inline-flex items-center gap-1 px-1 py-0.5 rounded-full text-[8px] font-medium border ${ats.bg} ${ats.color}`}>
          <span className={`w-1 h-1 rounded-full ${ats.dot}`} />
          {ats.label}
        </div>
        <div className="text-[9px] text-[var(--text-muted)] leading-snug">{tmpl.description}</div>
      </div>
    </button>
  );
}

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
interface CertificationEntry {
  name: string; issuer: string; date: string; url: string;
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

function ClaudeMark({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 41 41" fill="currentColor" className={className} aria-hidden>
      <path d="M23.5688 6L31.9999 35H27.8181L25.6817 27.7273H16.3635L14.2272 35H10.0454L18.4999 6H23.5688ZM21.0226 11.1591L17.477 24.4545H24.568L21.0226 11.1591Z"/>
    </svg>
  );
}

function UsageMeter({ used, limit, isPro, model }: {
  used: number; limit: number; isPro: boolean; model: "jobsynk-ai" | "claude-sonnet";
}) {
  const pct = Math.min((used / limit) * 100, 100);
  const atLimit = used >= limit;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
        style={isPro
          ? { background: "rgba(192,88,0,0.12)", border: "1px solid rgba(192,88,0,0.28)", color: "#C05800" }
          : { background: "rgba(122,184,64,0.10)", border: "1px solid rgba(122,184,64,0.28)", color: "#7ab840" }
        }>
        {isPro ? <><ClaudeMark size={11} /> Claude Sonnet · Pro</> : <><Zap className="w-3 h-3" /> JobSynk AI Engine · Free</>}
      </span>
      <div className="flex items-center gap-2">
        <span className={`text-[12px] ${atLimit ? "text-red-400" : "text-[var(--text-muted)]"}`}>
          {used} / {limit} {isPro ? "" : "free "}generation{limit !== 1 ? "s" : ""} used
        </span>
        <div className="h-1.5 w-24 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, background: atLimit ? "#ef4444" : isPro ? "#C05800" : "#7ab840" }} />
        </div>
      </div>
      {!isPro && !atLimit && (
        <span className="text-[11px] text-[var(--text-muted)]">
          · Upgrade to Pro for Claude Sonnet + 5 generations/month
        </span>
      )}
    </div>
  );
}

function LockedOverlay({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}
      className="p-6 rounded-2xl text-center space-y-4"
      style={{ background: "rgba(192,88,0,0.06)", border: "1px solid rgba(192,88,0,0.22)" }}>
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
      <button onClick={onUpgrade}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-[13px] font-semibold transition-all"
        style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}>
        <ClaudeMark size={14} /> Upgrade to Pro · ₹299/month
      </button>
      <p className="text-[11px] text-[var(--text-muted)]">Resets on the 1st of each month</p>
    </motion.div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ResumeBuilderPage() {
  const [mode, setMode]             = useState<"scratch" | "enhance">("enhance");
  const [selectedTemplate, setSelectedTemplate] = useState("jake");
  const [loading, setLoading]       = useState(false);
  const [latex, setLatex]           = useState("");
  const [modelUsed, setModelUsed]   = useState<"jobsynk-ai" | "claude-sonnet" | null>(null);
  const [copied, setCopied]         = useState(false);
  const [targetJob, setTargetJob]   = useState("");
  const [mounted, setMounted]       = useState(false);
  useEffect(() => setMounted(true), []);

  const [showBuyPack, setShowBuyPack] = useState(false);
  const queryClient = useQueryClient();

  const { data: rbStatus, refetch: refetchStatus } = useQuery({
    queryKey: ["resume-builder-status"],
    queryFn: resumeBuilderApi.getStatus,
    staleTime: 30_000,
    retry: false,
    enabled: mounted,
  });

  const isPro        = rbStatus?.plan === "pro";
  const usesUsed     = rbStatus?.uses_used ?? 0;
  const usesLimit    = rbStatus?.uses_limit ?? 2;
  const locked       = rbStatus?.locked ?? false;
  const requiresPro  = rbStatus?.requires_pro ?? false;
  const currentModel = rbStatus?.model ?? "jobsynk-ai";

  // Contact
  const [name,      setName]      = useState("");
  const [email,     setEmail]     = useState("");
  const [phone,     setPhone]     = useState("");
  const [location,  setLocation]  = useState("");
  const [linkedin,  setLinkedin]  = useState("");
  const [github,    setGithub]    = useState("");
  const [portfolio, setPortfolio] = useState("");

  const [education, setEducation] = useState<EducationEntry[]>([
    { degree: "", institution: "", location: "", start_date: "", end_date: "", gpa: "" }
  ]);
  const [experience, setExperience] = useState<ExperienceEntry[]>([
    { title: "", company: "", location: "", start_date: "", end_date: "Present", raw_bullets: [""] }
  ]);
  const [projects, setProjects] = useState<ProjectEntry[]>([
    { name: "", tech_stack: "", description: "", url: "" }
  ]);
  const [certifications, setCertifications] = useState<CertificationEntry[]>([]);
  const [skillsRaw,  setSkillsRaw]  = useState("");
  const [activities, setActivities] = useState("");
  const [awards,     setAwards]     = useState("");

  const [open, setOpen] = useState<Record<string, boolean>>({
    contact: true, education: true, experience: true, projects: true,
    certifications: false, other: false
  });
  const toggle = (k: string) => setOpen(p => ({ ...p, [k]: !p[k] }));

  async function generate() {
    if (requiresPro) { setShowBuyPack(true); return; }
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
          ? { use_active_resume: true, target_job: targetJob, template: selectedTemplate, contact: { name: "", email: "", phone: "", location: "", linkedin: "", github: "" } }
          : {
              use_active_resume: false,
              target_job: targetJob,
              template: selectedTemplate,
              contact: { name, email, phone, location, linkedin, github, portfolio },
              education,
              experience,
              projects,
              certifications,
              skills_raw: skillsRaw,
              activities,
              awards,
            };

      const { data } = await apiClient.post("/resume-builder/generate", body);
      setLatex(data.latex);
      setModelUsed(data.model_used ?? "jobsynk-ai");
      queryClient.invalidateQueries({ queryKey: ["resume-builder-status"] });
      const aiLabel = data.model_used === "claude-sonnet" ? "Claude Sonnet" : "JobSynk AI Engine";
      toast.success(`Resume generated by ${aiLabel}! Copy the LaTeX and paste into Overleaf.`);
    } catch (e: any) {
      if (e?.response?.status === 402) {
        queryClient.invalidateQueries({ queryKey: ["resume-builder-status"] });
        setShowBuyPack(true);
      } else if (e?.response?.status === 429) {
        toast.error(e?.response?.data?.detail || "Monthly limit reached. Resets on the 1st.");
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

  function SectionHeader({ id, title, icon }: { id: string; title: string; icon?: React.ReactNode }) {
    return (
      <button
        onClick={() => toggle(id)}
        className="w-full flex items-center justify-between py-2 text-[13px] font-semibold text-[var(--text-primary)] border-b border-[var(--border-subtle)] mb-4"
      >
        <span className="flex items-center gap-2">{icon}{title}</span>
        {open[id] ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
      </button>
    );
  }

  const buttonContent = () => {
    if (loading) return <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</>;
    if (!mounted || !rbStatus) return <><Sparkles className="w-4 h-4" /> Generate Resume</>;
    if (requiresPro) return <><Lock className="w-4 h-4" /> Upgrade to Pro for More Generations</>;
    if (locked) return <><Sparkles className="w-4 h-4" /> Monthly Limit Reached</>;
    if (isPro) return <><ClaudeMark size={15} /> Generate with Claude Sonnet</>;
    return <><Zap className="w-4 h-4" /> Generate with JobSynk AI Engine ({usesLimit - usesUsed} free left)</>;
  };

  const selectedTemplateInfo = TEMPLATES.find(t => t.id === selectedTemplate);

  return (
    <>
    <div className="space-y-5">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <Link href="/resume" className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">AI Resume Builder</h1>
          {selectedTemplateInfo && (() => {
            const ats = ATS_CONFIG[selectedTemplateInfo.ats];
            return (
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${ats.bg} ${ats.color}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${ats.dot}`} />
                {selectedTemplateInfo.name} · {ats.label}
              </span>
            );
          })()}
        </div>
        <p className="text-[14px] text-[var(--text-secondary)]">
          Choose a template → AI polishes your content → outputs LaTeX → paste into Overleaf → download PDF.
        </p>
        {mounted && rbStatus && (
          <div className="mt-3">
            <UsageMeter used={usesUsed} limit={usesLimit} isPro={isPro} model={currentModel} />
          </div>
        )}
      </motion.div>

      {/* ── Template Picker ── */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div>
            <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">Choose a Template</h2>
            <p className="text-[11px] text-[var(--text-muted)] mt-0.5">
              Same polished AI content, formatted differently. {TEMPLATES.length} templates available.
            </p>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
            {Object.entries(ATS_CONFIG).map(([key, cfg]) => (
              <span key={key} className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                {cfg.label}
              </span>
            ))}
          </div>
        </div>
        {/* Grid layout — 3-4 columns on desktop, 2 on tablet, scrollable on mobile */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2">
          {TEMPLATES.map(tmpl => (
            <TemplateCard key={tmpl.id} tmpl={tmpl} selected={selectedTemplate === tmpl.id} onClick={() => setSelectedTemplate(tmpl.id)} />
          ))}
        </div>
      </div>

      {/* ── Main content: form + output ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] xl:grid-cols-[460px_1fr] gap-6 items-start">
        {/* ── Left: Input ── */}
        <div className="space-y-4">
          {mounted && requiresPro ? <LockedOverlay onUpgrade={() => setShowBuyPack(true)} /> : null}

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
                AI will read your uploaded resume, rewrite all bullet points with stronger action verbs and metrics, and format it with the selected template.
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
                    <div className="col-span-2">
                      <Field label="Portfolio / Website (optional)" value={portfolio} onChange={setPortfolio} placeholder="https://yoursite.com" />
                    </div>
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
                          <div className="col-span-2">
                            <Field label="Location" value={e.location} onChange={v => setExperience(ex => ex.map((x, j) => j === i ? { ...x, location: v } : x))} placeholder="Remote / Bangalore, India" />
                          </div>
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
                          <div className="col-span-2">
                            <Field label="URL (optional)" value={p.url} onChange={v => setProjects(pr => pr.map((x, j) => j === i ? { ...x, url: v } : x))} placeholder="https://..." />
                          </div>
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

              {/* Certifications */}
              <div>
                <SectionHeader id="certifications" title="Certifications"
                  icon={<Shield className="w-3.5 h-3.5 text-[var(--text-muted)]" />} />
                {open.certifications && (
                  <div className="space-y-3">
                    {certifications.length === 0 && (
                      <p className="text-[12px] text-[var(--text-muted)] mb-2">No certifications added yet.</p>
                    )}
                    {certifications.map((c, i) => (
                      <div key={i} className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] space-y-2 relative">
                        <button onClick={() => setCertifications(prev => prev.filter((_, j) => j !== i))}
                          className="absolute top-2 right-2 p-1 text-[var(--text-muted)] hover:text-[var(--error)]">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                        <div className="grid grid-cols-2 gap-2">
                          <Field label="Certification Name" value={c.name} onChange={v => setCertifications(prev => prev.map((x, j) => j === i ? { ...x, name: v } : x))} placeholder="AWS Solutions Architect" />
                          <Field label="Issuing Organisation" value={c.issuer} onChange={v => setCertifications(prev => prev.map((x, j) => j === i ? { ...x, issuer: v } : x))} placeholder="Amazon" />
                          <Field label="Date Issued" value={c.date} onChange={v => setCertifications(prev => prev.map((x, j) => j === i ? { ...x, date: v } : x))} placeholder="Dec 2024" />
                          <Field label="URL (optional)" value={c.url} onChange={v => setCertifications(prev => prev.map((x, j) => j === i ? { ...x, url: v } : x))} placeholder="https://credly.com/…" />
                        </div>
                      </div>
                    ))}
                    <button onClick={() => setCertifications(prev => [...prev, { name: "", issuer: "", date: "", url: "" }])}
                      className="flex items-center gap-1.5 text-[12px] text-[var(--accent-primary)]">
                      <Plus className="w-3.5 h-3.5" /> Add Certification
                    </button>
                  </div>
                )}
              </div>

              {/* Other */}
              <div>
                <SectionHeader id="other" title="Skills, Activities & Awards"
                  icon={<Award className="w-3.5 h-3.5 text-[var(--text-muted)]" />} />
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
              <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border-subtle)] text-center px-8"
                style={{ minHeight: "calc(100vh - 180px)" }}>
                <div className="mb-6 w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                  style={{ background: "rgba(192,88,0,0.08)", border: "1px solid rgba(192,88,0,0.15)" }}>
                  <Wand2 className="w-7 h-7 text-[#C05800]" />
                </div>
                <p className="text-[16px] font-semibold text-[var(--text-secondary)] mb-2">LaTeX output appears here</p>
                <p className="text-[13px] text-[var(--text-muted)] max-w-xs leading-relaxed mb-6">
                  Pick a template, fill the form (or use your uploaded resume), then click Generate.
                </p>
                <div className="flex flex-col gap-2 w-full max-w-xs">
                  {[
                    { n: "1", t: "Pick a template above" },
                    { n: "2", t: "Fill form or use your uploaded resume" },
                    { n: "3", t: "AI rewrites with action verbs & metrics" },
                    { n: "4", t: "Copy LaTeX → paste into Overleaf → PDF" },
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
                  <div className="text-[12px] text-[var(--text-muted)] mt-1">
                    Formatting with {selectedTemplateInfo?.name ?? "Jake's Resume"} template
                  </div>
                </div>
              </motion.div>
            )}

            {latex && !loading && (
              <motion.div key="output" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                {/* Model attribution */}
                {modelUsed && (
                  <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                    {modelUsed === "claude-sonnet"
                      ? <><ClaudeMark size={11} className="text-[#C05800]" /> Generated by Claude Sonnet</>
                      : <><Zap className="w-3 h-3 text-[#7ab840]" /> Generated by JobSynk AI Engine</>
                    }
                    {modelUsed === "jobsynk-ai" && !isPro && (
                      <span>· <button onClick={() => setShowBuyPack(true)} className="text-[#C05800] hover:underline">Upgrade to Pro for Claude Sonnet</button></span>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={copyLatex}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-[13px] font-medium transition-colors"
                    style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}>
                    {copied ? <><Check className="w-3.5 h-3.5" /> Copied!</> : <><Copy className="w-3.5 h-3.5" /> Copy LaTeX</>}
                  </button>
                  <a href="https://www.overleaf.com/project" target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-[var(--border-default)] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
                    <ExternalLink className="w-3.5 h-3.5" /> Open Overleaf
                  </a>
                  {selectedTemplateInfo && (
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Template: <span className="font-medium text-[var(--text-secondary)]">{selectedTemplateInfo.name}</span>
                    </span>
                  )}
                </div>

                {/* Instructions */}
                <div className="p-3 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                  <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                    <span className="font-semibold text-[var(--text-secondary)]">How to use:</span>{" "}
                    Copy LaTeX → Open Overleaf → New Project → Blank → Paste and replace all content → Click Recompile → Download PDF.
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

    <AnimatePresence>
      {showBuyPack && (
        <CheckoutModal
          plan="resume_pack"
          onClose={() => setShowBuyPack(false)}
          onSuccess={() => { setShowBuyPack(false); refetchStatus(); }}
        />
      )}
    </AnimatePresence>
    </>
  );
}
