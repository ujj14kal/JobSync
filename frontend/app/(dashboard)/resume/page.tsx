"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadZone } from "@/components/resume/upload-zone";
import { resumeApi } from "@/lib/api/resume";
import {
  FileText, CheckCircle2, Trash2, Star, Calendar,
  Code2, Briefcase, GraduationCap, MapPin, Mail, Phone,
  Link2, AlertTriangle, Info,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { Resume } from "@/lib/types";
import { cn } from "@/lib/utils";
import Link from "next/link";

export default function ResumePage() {
  const queryClient = useQueryClient();
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: resumes, isLoading } = useQuery({
    queryKey: ["resumes"],
    queryFn: resumeApi.list,
  });

  const hasResume = resumes && resumes.length > 0;

  async function handleSetActive(id: string) {
    try {
      await resumeApi.setActive(id);
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      toast.success("Active resume updated");
    } catch {
      toast.error("Failed to update active resume");
    }
  }

  async function handleDelete(id: string) {
    try {
      await resumeApi.delete(id);
      queryClient.invalidateQueries({ queryKey: ["resumes"] });
      if (selectedResume?.id === id) setSelectedResume(null);
      setConfirmDelete(null);
      toast.success("Resume deleted");
    } catch {
      toast.error("Failed to delete resume");
    }
  }

  function handleUploadSuccess(resume: Resume) {
    queryClient.invalidateQueries({ queryKey: ["resumes"] });
    setSelectedResume(resume);
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">My Resume</h1>
            <p className="text-[14px] text-[var(--text-secondary)]">
              Your active resume is used for all ATS analyses, AI interview prep, and insights.
            </p>
          </div>
          <Link href="/resume/build"
            className="flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors">
            ✨ Build with AI
          </Link>
        </div>
      </motion.div>

      {/* Disclaimer */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-start gap-3 p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)]"
      >
        <Info className="w-4 h-4 text-[var(--text-muted)] flex-shrink-0 mt-0.5" />
        <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
          <span className="font-semibold text-[var(--text-secondary)]">One resume at a time.</span>{" "}
          JobSync uses your single active resume across all features. To upload a new version,
          delete your current resume first. Use{" "}
          <Link href="/resume/build" className="text-[var(--accent-primary)] hover:underline">AI Resume Builder</Link>{" "}
          to generate a polished, ATS-ready resume from scratch.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: upload or current resume */}
        <div className="lg:col-span-2 space-y-4">

          {isLoading ? (
            <div className="h-40 rounded-2xl animate-shimmer" />
          ) : hasResume ? (
            /* Has resume — show it with delete-to-replace prompt */
            <div className="space-y-3">
              {resumes.map((resume) => (
                <motion.div
                  key={resume.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className={cn(
                    "flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all",
                    selectedResume?.id === resume.id
                      ? "border-[var(--accent-primary)]/40 bg-[var(--accent-subtle)]"
                      : "border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)]"
                  )}
                  onClick={() => setSelectedResume(resume)}
                >
                  <div className="w-8 h-8 rounded-lg bg-[var(--bg-elevated)] flex items-center justify-center flex-shrink-0">
                    <FileText className="w-4 h-4 text-[var(--text-secondary)]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                      {resume.file_name}
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">
                      {formatDate(resume.created_at)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {resume.is_active && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleSetActive(resume.id); }}
                      className="p-1 rounded-md hover:bg-[var(--bg-overlay)] text-[var(--text-muted)] hover:text-amber-400 transition-colors"
                      title="Set as active"
                    >
                      <Star className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(resume.id); }}
                      className="p-1 rounded-md hover:bg-[var(--bg-overlay)] text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
                      title="Delete resume"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}

              {/* Delete confirmation */}
              {confirmDelete && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-4 rounded-xl border border-red-400/30 bg-red-400/5 space-y-3"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[13px] font-medium text-[var(--text-primary)]">Delete resume?</div>
                      <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                        This will remove it from all analyses and features. You can upload a new one after.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleDelete(confirmDelete)}
                      className="flex-1 py-2 rounded-lg bg-red-500 hover:bg-red-600 text-white text-[12px] font-medium transition-colors"
                    >
                      Yes, Delete
                    </button>
                    <button
                      onClick={() => setConfirmDelete(null)}
                      className="flex-1 py-2 rounded-lg border border-[var(--border-default)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Replace hint */}
              <div className="flex items-center gap-2 p-3 rounded-xl border border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <Info className="w-3.5 h-3.5 text-[var(--text-muted)] flex-shrink-0" />
                <p className="text-[11px] text-[var(--text-muted)]">
                  To upload a new resume, delete the existing one above first.
                </p>
              </div>
            </div>
          ) : (
            /* No resume — show upload zone */
            <div className="space-y-3">
              <UploadZone onSuccess={handleUploadSuccess} />
              <div className="flex items-center gap-2 p-3 rounded-xl border border-[var(--accent-primary)]/20 bg-[var(--accent-subtle)]">
                <Info className="w-3.5 h-3.5 text-[var(--accent-primary)] flex-shrink-0" />
                <p className="text-[11px] text-[var(--text-secondary)]">
                  No resume yet. Upload a PDF/DOCX, or{" "}
                  <Link href="/resume/build" className="text-[var(--accent-primary)] hover:underline font-medium">
                    build one with AI
                  </Link>
                  .
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right: parsed preview */}
        <div className="lg:col-span-3">
          {selectedResume ? (
            <ParsedResumePreview resume={selectedResume} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-[var(--border-subtle)]">
              <FileText className="w-8 h-8 text-[var(--text-muted)] mb-3" />
              <p className="text-[14px] text-[var(--text-secondary)]">
                {hasResume ? "Select a resume to preview parsed data" : "Upload a resume to see the parsed preview"}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ParsedResumePreview({ resume }: { resume: Resume }) {
  const { parsed_data: d } = resume;
  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-5 overflow-hidden"
    >
      <div className="pb-4 border-b border-[var(--border-subtle)]">
        <h3 className="text-[20px] font-bold text-[var(--text-primary)] mb-2 tracking-tight">
          {d.contact.name ?? "No name detected"}
        </h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {d.contact.email && (
            <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
              <Mail className="w-3 h-3 flex-shrink-0 text-[var(--text-muted)]" />{d.contact.email}
            </span>
          )}
          {d.contact.phone && (
            <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
              <Phone className="w-3 h-3 flex-shrink-0 text-[var(--text-muted)]" />{d.contact.phone}
            </span>
          )}
          {d.contact.location && (
            <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
              <MapPin className="w-3 h-3 flex-shrink-0 text-[var(--text-muted)]" />{d.contact.location}
            </span>
          )}
          {d.contact.linkedin && (
            <a href={d.contact.linkedin} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[12px] text-[var(--accent-primary)] hover:underline">
              <Link2 className="w-3 h-3 flex-shrink-0" />LinkedIn
            </a>
          )}
          {d.contact.github && (
            <a href={d.contact.github} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[12px] text-[var(--accent-primary)] hover:underline">
              <Link2 className="w-3 h-3 flex-shrink-0" />GitHub
            </a>
          )}
        </div>
      </div>

      {d.skills.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2.5">
            <Code2 className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Skills ({d.skills.length})
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {d.skills.map((s) => (
              <span key={s} className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)]">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {d.experience.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Experience</span>
          </div>
          <div className="space-y-4">
            {d.experience.map((exp, i) => (
              <div key={i} className="pl-4 border-l-2 border-[var(--border-default)]">
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">{exp.title}</div>
                {(exp.company || exp.location) && (
                  <div className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                    {exp.company}{exp.location && ` · ${exp.location}`}
                  </div>
                )}
                {(exp.start_date || exp.end_date) && (
                  <div className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] mt-0.5">
                    <Calendar className="w-3 h-3" />
                    {exp.start_date}{exp.end_date || exp.is_current ? ` — ${exp.is_current ? "Present" : exp.end_date}` : ""}
                  </div>
                )}
                {exp.bullets.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {exp.bullets.slice(0, 3).map((b, j) => (
                      <li key={j} className="text-[11px] text-[var(--text-secondary)] leading-relaxed"
                        style={{ wordBreak: "break-word" }}>
                        · {b}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {d.education.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Education</span>
          </div>
          <div className="space-y-3">
            {d.education.map((edu, i) => (
              <div key={i} className="pl-4 border-l-2 border-[var(--border-default)]">
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">{edu.degree}</div>
                {edu.institution && <div className="text-[12px] text-[var(--text-secondary)] mt-0.5">{edu.institution}</div>}
                {edu.gpa && <div className="text-[11px] text-[var(--text-muted)] mt-0.5">GPA: {edu.gpa}</div>}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
