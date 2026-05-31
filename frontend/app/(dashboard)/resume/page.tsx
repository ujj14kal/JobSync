"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UploadZone } from "@/components/resume/upload-zone";
import { resumeApi } from "@/lib/api/resume";
import {
  FileText,
  CheckCircle2,
  Trash2,
  Star,
  Calendar,
  Code2,
  Briefcase,
  GraduationCap,
  MapPin,
  Mail,
  Phone,
  Link2,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { toast } from "sonner";
import type { Resume } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function ResumePage() {
  const queryClient = useQueryClient();
  const [selectedResume, setSelectedResume] = useState<Resume | null>(null);

  const { data: resumes, isLoading } = useQuery({
    queryKey: ["resumes"],
    queryFn: resumeApi.list,
  });

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
    <div className="space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-1">
          My Resumes
        </h1>
        <p className="text-[14px] text-[var(--text-secondary)]">
          Upload and manage your resumes. The active resume is used for all analyses.
        </p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Upload + list */}
        <div className="lg:col-span-2 space-y-5">
          <UploadZone
            onSuccess={handleUploadSuccess}
            existingResumes={resumes ?? []}
          />

          {/* Resume list */}
          {isLoading ? (
            <div className="space-y-2">
              {[...Array(2)].map((_, i) => (
                <div key={i} className="h-16 rounded-2xl animate-shimmer" />
              ))}
            </div>
          ) : resumes && resumes.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-[12px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
                Your Resumes
              </h3>
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
                      onClick={(e) => { e.stopPropagation(); handleDelete(resume.id); }}
                      className="p-1 rounded-md hover:bg-[var(--bg-overlay)] text-[var(--text-muted)] hover:text-[var(--error)] transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Parsed preview */}
        <div className="lg:col-span-3">
          {selectedResume ? (
            <ParsedResumePreview resume={selectedResume} />
          ) : (
            <div className="h-full flex flex-col items-center justify-center py-20 rounded-2xl border border-dashed border-[var(--border-subtle)]">
              <FileText className="w-8 h-8 text-[var(--text-muted)] mb-3" />
              <p className="text-[14px] text-[var(--text-secondary)]">
                Select a resume to preview parsed data
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
      {/* Contact */}
      <div className="pb-4 border-b border-[var(--border-subtle)]">
        <h3 className="text-[20px] font-bold text-[var(--text-primary)] mb-2 tracking-tight">
          {d.contact.name ?? "No name detected"}
        </h3>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1">
          {d.contact.email && (
            <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
              <Mail className="w-3 h-3 flex-shrink-0 text-[var(--text-muted)]" />
              {d.contact.email}
            </span>
          )}
          {d.contact.phone && (
            <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
              <Phone className="w-3 h-3 flex-shrink-0 text-[var(--text-muted)]" />
              {d.contact.phone}
            </span>
          )}
          {d.contact.location && (
            <span className="flex items-center gap-1.5 text-[12px] text-[var(--text-secondary)]">
              <MapPin className="w-3 h-3 flex-shrink-0 text-[var(--text-muted)]" />
              {d.contact.location}
            </span>
          )}
          {d.contact.linkedin && (
            <a
              href={d.contact.linkedin}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[12px] text-[var(--accent-primary)] hover:underline"
            >
              <Link2 className="w-3 h-3 flex-shrink-0" />
              LinkedIn
            </a>
          )}
          {d.contact.github && (
            <a
              href={d.contact.github}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-[12px] text-[var(--accent-primary)] hover:underline"
            >
              <Link2 className="w-3 h-3 flex-shrink-0" />
              GitHub
            </a>
          )}
        </div>
      </div>

      {/* Skills */}
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
              <span
                key={s}
                className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-secondary)]"
              >
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Experience */}
      {d.experience.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <Briefcase className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Experience
            </span>
          </div>
          <div className="space-y-4">
            {d.experience.map((exp, i) => (
              <div key={i} className="pl-4 border-l-2 border-[var(--border-default)]">
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">
                  {exp.title}
                </div>
                {(exp.company || exp.location) && (
                  <div className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                    {exp.company}
                    {exp.location && ` · ${exp.location}`}
                  </div>
                )}
                {(exp.start_date || exp.end_date) && (
                  <div className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] mt-0.5">
                    <Calendar className="w-3 h-3" />
                    {exp.start_date}
                    {exp.end_date || exp.is_current
                      ? ` — ${exp.is_current ? "Present" : exp.end_date}`
                      : ""}
                  </div>
                )}
                {exp.bullets.length > 0 && (
                  <ul className="mt-1.5 space-y-1">
                    {exp.bullets.slice(0, 3).map((b, j) => (
                      <li
                        key={j}
                        className="text-[11px] text-[var(--text-secondary)] leading-relaxed"
                        style={{ wordBreak: "break-word", overflowWrap: "break-word" }}
                      >
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

      {/* Education */}
      {d.education.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <GraduationCap className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">
              Education
            </span>
          </div>
          <div className="space-y-3">
            {d.education.map((edu, i) => (
              <div key={i} className="pl-4 border-l-2 border-[var(--border-default)]">
                <div className="text-[13px] font-semibold text-[var(--text-primary)]">
                  {edu.degree}
                </div>
                {edu.institution && (
                  <div className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                    {edu.institution}
                  </div>
                )}
                {edu.gpa && (
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">GPA: {edu.gpa}</div>
                )}
                {edu.end_date && (
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">{edu.end_date}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
