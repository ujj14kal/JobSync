"use client";

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, FileText, Loader2, AlertCircle, ArrowRight,
  CheckCircle2, Lock, Sparkles,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Step = "input" | "loading" | "result";

interface DemoResult {
  overall_score: number;
  match_tier: string;
  scores: { ats_score: number; technical_fit_score: number; semantic_match_score: number; recruiter_impression_score: number };
  missing_keywords: { keyword: string; importance: string }[];
  job_title: string;
  company: string;
}

const TIER_COLOR: Record<string, string> = {
  "Strong Match": "#10b981",
  "Good Match":   "#3b82f6",
  "Fair Match":   "#f59e0b",
  "Weak Match":   "#f97316",
  "Poor Match":   "#ef4444",
};

export default function TryPage() {
  const [step, setStep] = useState<Step>("input");
  const [jobUrl, setJobUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DemoResult | null>(null);

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) setFile(accepted[0]);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"], "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"] },
    maxFiles: 1,
  });

  async function handleAnalyse() {
    if (!jobUrl.trim() || !file) { setError("Paste a job URL and upload your resume."); return; }
    setError("");
    setStep("loading");

    const form = new FormData();
    form.append("job_url", jobUrl.trim());
    form.append("resume", file);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/public/demo`, {
        method: "POST",
        body: form,
      });
      if (res.status === 429) {
        setError("You've already used your free demo today. Sign up for unlimited analyses — it's free.");
        setStep("input");
        return;
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setError(err.detail || "Something went wrong. Please try again.");
        setStep("input");
        return;
      }
      const data = await res.json();
      setResult(data);
      setStep("result");
    } catch {
      setError("Network error — please try again.");
      setStep("input");
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-16" style={{ background: "var(--bg-base)" }}>
      <div className="w-full max-w-lg space-y-6">

        {/* Header */}
        <div className="text-center space-y-2">
          <Link href="/" className="text-[13px] font-semibold text-[var(--accent-primary)] tracking-widest uppercase">
            JobSynk
          </Link>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">Try it free</h1>
          <p className="text-[14px] text-[var(--text-secondary)]">
            Paste a job URL and upload your resume — get your ATS score in ~30 seconds. No account needed.
          </p>
        </div>

        <AnimatePresence mode="wait">
          {step === "input" && (
            <motion.div key="input" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">
              {/* Job URL */}
              <div className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-3">
                <label className="text-[13px] font-medium text-[var(--text-primary)]">Job URL</label>
                <input
                  value={jobUrl}
                  onChange={e => setJobUrl(e.target.value)}
                  placeholder="https://linkedin.com/jobs/... or any job board URL"
                  className="w-full px-4 py-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none focus:border-[var(--accent-primary)] transition-colors"
                />
              </div>

              {/* Resume upload */}
              <div
                {...getRootProps()}
                className={cn(
                  "p-6 rounded-2xl border-2 border-dashed transition-colors cursor-pointer text-center",
                  isDragActive ? "border-[var(--accent-primary)] bg-[var(--accent-muted)]" : "border-[var(--border-default)] bg-[var(--bg-surface)]",
                  file && "border-emerald-400/40 bg-emerald-400/5"
                )}
              >
                <input {...getInputProps()} />
                {file ? (
                  <div className="flex items-center justify-center gap-2 text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-[13px] font-medium">{file.name}</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-6 h-6 text-[var(--text-muted)] mx-auto" />
                    <p className="text-[13px] text-[var(--text-secondary)]">
                      {isDragActive ? "Drop your resume here" : "Upload resume (PDF or DOCX)"}
                    </p>
                    <p className="text-[11px] text-[var(--text-muted)]">Max 5 MB</p>
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl bg-red-400/8 border border-red-400/20 text-[13px] text-red-400">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {error}
                </div>
              )}

              <button
                onClick={handleAnalyse}
                disabled={!jobUrl || !file}
                className="w-full py-3 rounded-xl font-semibold text-[14px] text-white transition-colors disabled:opacity-40"
                style={{ background: "#C05800" }}
              >
                Analyse my resume →
              </button>

              <p className="text-[11px] text-[var(--text-muted)] text-center">
                1 free demo per day · your resume is not stored · takes ~30 seconds
              </p>
            </motion.div>
          )}

          {step === "loading" && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-primary)]" />
              <p className="text-[14px] text-[var(--text-secondary)]">Scraping job page and scoring your resume…</p>
              <p className="text-[12px] text-[var(--text-muted)]">This usually takes 15–30 seconds</p>
            </motion.div>
          )}

          {step === "result" && result && (
            <motion.div key="result" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {/* Score card */}
              <div className="p-8 rounded-3xl border text-center space-y-4"
                style={{ background: "var(--bg-surface)", borderColor: `${TIER_COLOR[result.match_tier] ?? "#C05800"}35` }}>
                <p className="text-[12px] text-[var(--text-muted)] uppercase tracking-wider">Overall Score</p>
                <div className="text-7xl font-black" style={{ color: TIER_COLOR[result.match_tier] ?? "#C05800" }}>{result.overall_score}</div>
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border text-[13px] font-semibold"
                  style={{ background: `${TIER_COLOR[result.match_tier] ?? "#C05800"}14`, borderColor: `${TIER_COLOR[result.match_tier] ?? "#C05800"}30`, color: TIER_COLOR[result.match_tier] ?? "#C05800" }}>
                  {result.match_tier}
                </div>
                {(result.job_title || result.company) && (
                  <p className="text-[13px] text-[var(--text-muted)]">
                    {result.job_title}{result.company ? ` · ${result.company}` : ""}
                  </p>
                )}
              </div>

              {/* Sub-scores */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "ATS Compat.", score: result.scores.ats_score },
                  { label: "Tech Fit",    score: result.scores.technical_fit_score },
                  { label: "Semantic",   score: result.scores.semantic_match_score },
                  { label: "Recruiter",  score: result.scores.recruiter_impression_score },
                ].map(({ label, score }) => (
                  <div key={label} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-center">
                    <p className="text-xl font-bold" style={{
                      color: score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444"
                    }}>{score}</p>
                    <p className="text-[11px] text-[var(--text-muted)] mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* Top missing keywords */}
              {result.missing_keywords.length > 0 && (
                <div className="p-5 rounded-2xl border border-amber-400/25 bg-amber-400/5 space-y-3">
                  <p className="text-[12px] font-semibold text-[var(--text-primary)]">Top missing keywords</p>
                  <div className="flex flex-wrap gap-2">
                    {result.missing_keywords.slice(0, 5).map(kw => (
                      <span key={kw.keyword}
                        className={cn(
                          "px-3 py-1 rounded-full border text-[12px] font-medium",
                          kw.importance === "required"
                            ? "text-red-400 bg-red-400/10 border-red-400/25"
                            : "text-amber-400 bg-amber-400/10 border-amber-400/25"
                        )}>
                        {kw.keyword}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Gated section — sign up to unlock */}
              <div className="p-5 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] space-y-3">
                <div className="flex items-center gap-2 text-[var(--text-muted)]">
                  <Lock className="w-4 h-4" />
                  <span className="text-[13px] font-medium text-[var(--text-primary)]">Full report requires a free account</span>
                </div>
                <ul className="space-y-2">
                  {[
                    "Recruiter-grade AI feedback on every bullet point",
                    "AI-rewritten bullet points tailored to this role",
                    "Interview prep questions from this JD",
                    "Resume completeness checklist",
                    "Skill gap analysis with learning resources",
                  ].map(item => (
                    <li key={item} className="flex items-center gap-2 text-[12px] text-[var(--text-muted)]">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] flex-shrink-0" />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link href="/signup"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-[14px] text-white mt-2"
                  style={{ background: "#C05800" }}>
                  <Sparkles className="w-4 h-4" />
                  Sign up free — 3 analyses/day
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
