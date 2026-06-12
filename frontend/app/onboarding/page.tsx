"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { useDropzone } from "react-dropzone";
import {
  CheckCircle2,
  Upload,
  FileText,
  BarChart2,
  ArrowRight,
  Loader2,
  User,
  Briefcase,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { resumeApi } from "@/lib/api/resume";
import { toast } from "sonner";
import Link from "next/link";

const STEPS = ["Profile", "Resume", "All set"] as const;

const careerStages = [
  { value: "student", label: "Student / Intern" },
  { value: "entry", label: "Entry Level (0–2 yrs)" },
  { value: "mid", label: "Mid Level (3–6 yrs)" },
  { value: "senior", label: "Senior (7+ yrs)" },
];

function StepDots({ current }: { current: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {STEPS.map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <div
            className={`flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-semibold transition-all ${
              i < current
                ? "bg-[var(--accent-primary)] text-white"
                : i === current
                ? "bg-[var(--accent-primary)] text-white ring-2 ring-[var(--accent-primary)]/30"
                : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-default)]"
            }`}
          >
            {i < current ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
          </div>
          <span
            className={`text-[11px] hidden sm:block ${
              i === current
                ? "text-[var(--text-primary)] font-medium"
                : "text-[var(--text-muted)]"
            }`}
          >
            {label}
          </span>
          {i < STEPS.length - 1 && (
            <div
              className={`w-8 h-px mx-1 transition-colors ${
                i < current ? "bg-[var(--accent-primary)]" : "bg-[var(--border-default)]"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Profile confirmation ───────────────────────────────────────────────
function StepProfile({
  initialName,
  initialStage,
  initialRole,
  onNext,
}: {
  initialName: string;
  initialStage: string;
  initialRole: string;
  onNext: (name: string, stage: string, role: string) => void;
}) {
  const [name, setName] = useState(initialName);
  const [stage, setStage] = useState(initialStage || "entry");
  const [role, setRole] = useState(initialRole);

  return (
    <motion.div
      key="step-profile"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.2 }}
      className="space-y-5"
    >
      <div>
        <h2 className="text-[20px] font-bold text-[var(--text-primary)] mb-1">
          Welcome to JobSynk 👋
        </h2>
        <p className="text-[13px] text-[var(--text-secondary)]">
          Confirm your details and we&apos;ll personalise everything for you.
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
            Your name
          </label>
          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Arjun Mehta"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
            Career stage
          </label>
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
          >
            {careerStages.map((s) => (
              <option key={s.value} value={s.value} style={{ background: "var(--bg-elevated)" }}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
            Target role{" "}
            <span className="text-[var(--text-muted)] font-normal">(optional)</span>
          </label>
          <div className="relative">
            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Software Engineer, Product Manager"
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
            />
          </div>
        </div>
      </div>

      <button
        onClick={() => onNext(name.trim() || "there", stage, role)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
      >
        Continue <ArrowRight className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

// ── Step 2: Resume upload ──────────────────────────────────────────────────────
function StepResume({ onNext, onSkip }: { onNext: () => void; onSkip: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] },
    maxFiles: 1,
    maxSize: 10 * 1024 * 1024,
  });

  async function handleUpload() {
    if (!file) return;
    setUploading(true);
    try {
      await resumeApi.upload(file, setUploadPct);
      toast.success("Resume uploaded!");
      onNext();
    } catch {
      toast.error("Upload failed — please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <motion.div
      key="step-resume"
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.2 }}
      className="space-y-5"
    >
      <div>
        <h2 className="text-[20px] font-bold text-[var(--text-primary)] mb-1">
          Upload your resume
        </h2>
        <p className="text-[13px] text-[var(--text-secondary)]">
          We&apos;ll parse it instantly so every analysis is personalised. PDF or DOCX, max 10 MB.
        </p>
      </div>

      <div
        {...getRootProps()}
        className={`relative flex flex-col items-center justify-center gap-3 p-8 rounded-2xl border-2 border-dashed cursor-pointer transition-all ${
          isDragActive
            ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/5"
            : file
            ? "border-emerald-500/50 bg-emerald-500/5"
            : "border-[var(--border-default)] hover:border-[var(--accent-primary)]/50 hover:bg-[var(--bg-elevated)]"
        }`}
      >
        <input {...getInputProps()} />
        {file ? (
          <>
            <FileText className="w-8 h-8 text-emerald-400" />
            <p className="text-[13px] font-medium text-[var(--text-primary)] text-center">{file.name}</p>
            <p className="text-[11px] text-[var(--text-muted)]">
              {(file.size / 1024).toFixed(0)} KB — click to replace
            </p>
          </>
        ) : (
          <>
            <Upload className="w-8 h-8 text-[var(--text-muted)]" />
            <p className="text-[13px] text-[var(--text-secondary)] text-center">
              {isDragActive ? "Drop it here…" : "Drag & drop your resume, or click to browse"}
            </p>
            <p className="text-[11px] text-[var(--text-muted)]">PDF or DOCX · Max 10 MB</p>
          </>
        )}
      </div>

      {uploading && (
        <div className="space-y-1">
          <div className="h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-[var(--accent-primary)]"
              animate={{ width: `${uploadPct}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <p className="text-[11px] text-[var(--text-muted)] text-right">{uploadPct}%</p>
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!file || uploading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors disabled:opacity-40"
      >
        {uploading ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…
          </>
        ) : (
          <>
            Upload resume <ArrowRight className="w-3.5 h-3.5" />
          </>
        )}
      </button>

      <button
        onClick={onSkip}
        className="w-full py-2 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
      >
        Skip for now — I&apos;ll do this later
      </button>
    </motion.div>
  );
}

// ── Step 3: All set ────────────────────────────────────────────────────────────
function StepDone({ name }: { name: string }) {
  const features = [
    {
      icon: BarChart2,
      label: "ATS Analysis",
      desc: "Paste a job URL + your resume → score in 30 seconds",
      href: "/analysis",
      cta: "Run first analysis",
      primary: true,
    },
    {
      icon: FileText,
      label: "Resume Builder",
      desc: "AI-rewritten bullets, skill gap roadmap, full resume polish",
      href: "/resume",
      cta: "View resume",
      primary: false,
    },
    {
      icon: Briefcase,
      label: "Job Tracker",
      desc: "Log applications, auto-update status from Gmail",
      href: "/jobs",
      cta: "Open tracker",
      primary: false,
    },
  ];

  return (
    <motion.div
      key="step-done"
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, type: "spring" }}
      className="space-y-6"
    >
      <div className="text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.1, type: "spring", stiffness: 300, damping: 20 }}
          className="w-14 h-14 rounded-2xl bg-[var(--accent-primary)]/10 border border-[var(--accent-primary)]/20 flex items-center justify-center mx-auto mb-4"
        >
          <Sparkles className="w-7 h-7 text-[var(--accent-primary)]" />
        </motion.div>
        <h2 className="text-[20px] font-bold text-[var(--text-primary)] mb-1">
          You&apos;re all set, {name}!
        </h2>
        <p className="text-[13px] text-[var(--text-secondary)]">
          Here&apos;s what you can do right now:
        </p>
      </div>

      <div className="space-y-2">
        {features.map(({ icon: Icon, label, desc, href, cta, primary }) => (
          <Link
            key={href}
            href={href}
            className={`flex items-center gap-4 p-4 rounded-xl border transition-all group ${
              primary
                ? "border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/5 hover:border-[var(--accent-primary)]/50"
                : "border-[var(--border-default)] hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]"
            }`}
          >
            <div
              className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                primary
                  ? "bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/25"
                  : "bg-[var(--bg-elevated)] border border-[var(--border-default)]"
              }`}
            >
              <Icon
                className={`w-4 h-4 ${primary ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)]"}`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-[var(--text-primary)]">{label}</div>
              <div className="text-[12px] text-[var(--text-secondary)]">{desc}</div>
            </div>
            <span
              className={`text-[12px] font-medium flex-shrink-0 group-hover:translate-x-0.5 transition-transform ${
                primary ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)]"
              }`}
            >
              {cta} →
            </span>
          </Link>
        ))}
      </div>

      <Link
        href="/dashboard"
        className="block w-full text-center py-2 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
      >
        Go to dashboard →
      </Link>
    </motion.div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [userName, setUserName] = useState("");

  async function handleProfileNext(name: string, stage: string, role: string) {
    setUserName(name);
    try {
      await supabase.auth.updateUser({
        data: { full_name: name, career_stage: stage, target_role: role },
      });
    } catch {
      // non-blocking — user can still proceed
    }
    setStep(1);
  }

  async function markDone() {
    try {
      await supabase.auth.updateUser({ data: { onboarding_completed: true } });
    } catch {
      // non-blocking
    }
  }

  async function handleResumeNext() {
    await markDone();
    setStep(2);
  }

  async function handleSkip() {
    await markDone();
    setStep(2);
  }

  // If user lands here already onboarded, send them home
  supabase.auth.getUser().then(({ data: { user } }) => {
    if (user?.user_metadata?.onboarding_completed) {
      router.replace("/dashboard");
    } else if (user) {
      const meta = user.user_metadata;
      if (!userName && meta?.full_name) setUserName(meta.full_name.split(" ")[0]);
    }
  });

  return (
    <div className="w-full max-w-md">
      {/* Logo */}
      <div className="flex justify-center mb-8">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="JobSynk" className="w-8 h-8 object-contain" />
          <span className="text-[16px] font-bold text-[var(--text-primary)]">JobSynk</span>
        </Link>
      </div>

      <div className="p-8 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
        <StepDots current={step} />

        <AnimatePresence mode="wait">
          {step === 0 && (
            <StepProfile
              initialName={userName}
              initialStage=""
              initialRole=""
              onNext={handleProfileNext}
            />
          )}
          {step === 1 && (
            <StepResume onNext={handleResumeNext} onSkip={handleSkip} />
          )}
          {step === 2 && <StepDone name={userName || "there"} />}
        </AnimatePresence>
      </div>
    </div>
  );
}
