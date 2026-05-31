"use client";

import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Upload, FileText, CheckCircle2, X, AlertCircle, AlertTriangle } from "lucide-react";
import { resumeApi } from "@/lib/api/resume";
import { bytesToMB } from "@/lib/utils";
import { toast } from "sonner";
import type { Resume } from "@/lib/types";
import { cn } from "@/lib/utils";

interface UploadZoneProps {
  onSuccess: (resume: Resume) => void;
  existingResumes?: Resume[];
}

export function UploadZone({ onSuccess, existingResumes = [] }: UploadZoneProps) {
  const [status, setStatus] = useState<"idle" | "uploading" | "parsing" | "success" | "error">("idle");
  const [progress, setProgress]     = useState(0);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg]     = useState("");
  const [pendingFile, setPendingFile] = useState<File | null>(null); // waiting on duplicate confirm

  const doUpload = useCallback(
    async (file: File) => {
      setSelectedFile(file);
      setStatus("uploading");
      setProgress(0);
      setErrorMsg("");

      try {
        const resume = await resumeApi.upload(file, (pct) => {
          if (pct < 90) setProgress(pct);
          else {
            setProgress(90);
            setStatus("parsing");
          }
        });
        setProgress(100);
        setStatus("success");
        toast.success("Resume parsed successfully!");
        onSuccess(resume);
      } catch (err) {
        setStatus("error");
        setErrorMsg((err as Error).message);
        toast.error("Upload failed: " + (err as Error).message);
      }
    },
    [onSuccess]
  );

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      // Duplicate name check
      const duplicate = existingResumes.find(
        (r) => r.file_name.toLowerCase() === file.name.toLowerCase()
      );
      if (duplicate) {
        setPendingFile(file);
        return; // show confirm dialog
      }

      await doUpload(file);
    },
    [existingResumes, doUpload]
  );

  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/msword": [".doc"],
    },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
    disabled: status === "uploading" || status === "parsing" || !!pendingFile,
  });

  // Strip framer-motion props from dropzone root
  const {
    onAnimationStart, onDrag, onDragEnd, onDragStart,
    ...dropzoneRootProps
  } = getRootProps();
  void onAnimationStart; void onDrag; void onDragEnd; void onDragStart;

  const reset = () => {
    setStatus("idle");
    setSelectedFile(null);
    setProgress(0);
    setErrorMsg("");
  };

  return (
    <div className="w-full space-y-3">
      {/* Duplicate confirm dialog */}
      <AnimatePresence>
        {pendingFile && (
          <motion.div
            key="dup-confirm"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="p-4 rounded-xl border border-amber-400/30 bg-amber-400/5 space-y-3"
          >
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <div>
                <div className="text-[13px] font-medium text-[var(--text-primary)]">
                  File already exists
                </div>
                <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                  A resume named <span className="font-medium text-[var(--text-primary)]">&ldquo;{pendingFile.name}&rdquo;</span> is already in your library. Upload anyway?
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  const file = pendingFile;
                  setPendingFile(null);
                  await doUpload(file);
                }}
                className="flex-1 py-2 rounded-lg bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[12px] font-medium transition-colors"
              >
                Upload Anyway
              </button>
              <button
                onClick={() => setPendingFile(null)}
                className="flex-1 py-2 rounded-lg border border-[var(--border-default)] text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {status === "idle" || (status === "error" && !selectedFile) ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            {...dropzoneRootProps}
            className={cn(
              "relative flex flex-col items-center justify-center p-12 rounded-2xl border-2 border-dashed cursor-pointer transition-all duration-200",
              isDragActive
                ? "border-[var(--accent-primary)] bg-[var(--accent-subtle)]"
                : "border-[var(--border-default)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)]/50 hover:bg-[var(--bg-elevated)]"
            )}
          >
            <input {...getInputProps()} />
            <div className={cn(
              "w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-colors",
              isDragActive ? "bg-[var(--accent-primary)] text-white" : "bg-[var(--bg-elevated)] text-[var(--text-muted)]"
            )}>
              <Upload className="w-6 h-6" />
            </div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-1">
              {isDragActive ? "Drop your resume here" : "Upload your resume"}
            </h3>
            <p className="text-[13px] text-[var(--text-secondary)] mb-3">
              Drag & drop or click to browse
            </p>
            <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)]">
              <span className="px-2 py-0.5 rounded-full bg-[var(--bg-overlay)] border border-[var(--border-subtle)]">PDF</span>
              <span className="px-2 py-0.5 rounded-full bg-[var(--bg-overlay)] border border-[var(--border-subtle)]">DOCX</span>
              <span>Max 5 MB</span>
            </div>
            {fileRejections.length > 0 && (
              <div className="mt-4 flex items-center gap-1.5 text-[12px] text-[var(--error)]">
                <AlertCircle className="w-3.5 h-3.5" />
                {fileRejections[0]?.errors[0]?.message}
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="progress"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[var(--bg-elevated)] flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5 text-[var(--text-secondary)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                  {selectedFile?.name}
                </div>
                <div className="text-[11px] text-[var(--text-muted)]">
                  {selectedFile && bytesToMB(selectedFile.size)}
                </div>
              </div>
              {(status === "error" || status === "success") && (
                <button
                  onClick={reset}
                  className="p-1 rounded-md hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {(status === "uploading" || status === "parsing") && (
              <>
                <div className="flex items-center justify-between text-[12px] mb-2">
                  <span className="text-[var(--text-secondary)]">
                    {status === "uploading" ? "Uploading…" : "Parsing resume…"}
                  </span>
                  <span className="text-[var(--accent-primary)] font-medium">{progress}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-[var(--bg-overlay)] overflow-hidden">
                  <motion.div
                    animate={{ width: `${progress}%` }}
                    className="h-full rounded-full bg-[var(--accent-primary)]"
                    transition={{ duration: 0.3 }}
                  />
                </div>
                {status === "parsing" && (
                  <p className="text-[11px] text-[var(--text-muted)] mt-2">
                    Extracting sections, skills, and experience…
                  </p>
                )}
              </>
            )}

            {status === "success" && (
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-[13px] font-medium">Resume parsed successfully</span>
              </div>
            )}

            {status === "error" && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-[var(--error)]">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-[13px] font-medium">Upload failed</span>
                </div>
                <p className="text-[12px] text-[var(--text-muted)]">{errorMsg}</p>
                <button
                  onClick={reset}
                  className="text-[12px] text-[var(--accent-primary)] hover:text-[var(--accent-hover)]"
                >
                  Try again
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
