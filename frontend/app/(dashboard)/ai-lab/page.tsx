"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain, Cpu, Play, RefreshCw,
  CheckCircle2,
  BarChart3, Layers, Info,
} from "lucide-react";
import { modelMgmtApi, ModelStatus } from "@/lib/api/model-mgmt";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── Status pill ──────────────────────────────────────────────────────────────

function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold",
      active
        ? "bg-emerald-400/15 text-emerald-400 border border-emerald-400/25"
        : "bg-[var(--bg-elevated)] text-[var(--text-muted)] border border-[var(--border-subtle)]"
    )}>
      <span className={cn("w-1.5 h-1.5 rounded-full", active ? "bg-emerald-400" : "bg-[var(--text-muted)]")} />
      {label}
    </span>
  );
}

// ─── Metric tile ──────────────────────────────────────────────────────────────

function Metric({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-subtle)]">
      <p className="text-[11px] text-[var(--text-muted)] mb-1">{label}</p>
      <p className="text-[18px] font-bold text-[var(--text-primary)]">{value}</p>
      {sub && <p className="text-[10px] text-[var(--text-muted)] mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Training step card ───────────────────────────────────────────────────────

function TrainStep({
  step,
  title,
  description,
  done,
  active,
  buttonLabel,
  onRun,
  running,
}: {
  step: number;
  title: string;
  description: string;
  done: boolean;
  active: boolean;
  buttonLabel: string;
  onRun: () => void;
  running: boolean;
}) {
  return (
    <div className={cn(
      "flex items-start gap-4 p-4 rounded-2xl border transition-colors",
      done
        ? "border-emerald-400/25 bg-emerald-400/5"
        : active
          ? "border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/5"
          : "border-[var(--border-subtle)] bg-[var(--bg-surface)] opacity-60"
    )}>
      <div className={cn(
        "w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold shrink-0 mt-0.5",
        done
          ? "bg-emerald-400/20 text-emerald-400"
          : active
            ? "bg-[var(--accent-primary)]/20 text-[var(--accent-primary)]"
            : "bg-[var(--bg-elevated)] text-[var(--text-muted)]"
      )}>
        {done ? <CheckCircle2 className="w-4 h-4" /> : step}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">{title}</h3>
        <p className="text-[12px] text-[var(--text-muted)] mt-0.5">{description}</p>
      </div>
      {active && !done && (
        <button
          onClick={onRun}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[12px] font-medium transition-colors disabled:opacity-60 shrink-0"
        >
          {running
            ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Running…</>
            : <><Play className="w-3.5 h-3.5" /> {buttonLabel}</>}
        </button>
      )}
      {done && (
        <span className="text-[11px] text-emerald-400 font-medium shrink-0">Done ✓</span>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AILabPage() {
  const [status, setStatus] = useState<ModelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<Record<string, boolean>>({});

  async function fetchStatus() {
    try {
      const data = await modelMgmtApi.getStatus();
      setStatus(data);
    } catch {
      toast.error("Could not load model status");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 30_000); // auto-refresh every 30s
    return () => clearInterval(interval);
  }, []);

  async function run(key: string, fn: () => Promise<unknown>, msg: string) {
    setRunning(r => ({ ...r, [key]: true }));
    try {
      await fn();
      toast.success(msg);
      setTimeout(fetchStatus, 3000);
    } catch {
      toast.error("Action failed — check backend logs");
    } finally {
      setRunning(r => ({ ...r, [key]: false }));
    }
  }

  const neural = status?.neural_scorer;
  const calibrator = status?.score_calibrator;
  const hasTrainingData = true; // assume data exists if button has been run
  const neuralTrained = neural?.trained ?? false;
  const calibratorTrained = calibrator?.loaded ?? false;

  // Determine which pipeline step is active
  const step1Done = false; // can't know without filesystem check
  const step2Done = neuralTrained;
  const step3Done = calibratorTrained && (calibrator?.samples_used ?? 0) >= 80;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[28px] font-bold text-[var(--text-primary)] flex items-center gap-3">
            <Brain className="w-7 h-7 text-[var(--accent-primary)]" />
            AI Lab
          </h1>
          <p className="text-[var(--text-muted)] text-[14px] mt-1">
            Train and manage your custom JobSync AI models. No third-party API needed after training.
          </p>
        </div>
        <button
          onClick={fetchStatus}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-[var(--border-default)] text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* Neural Scorer Status */}
      {loading ? (
        <div className="h-40 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)] animate-pulse" />
      ) : (
        <div className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Brain className="w-5 h-5 text-[var(--accent-primary)]" />
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">JobSync Neural Scorer</h2>
            </div>
            <StatusPill active={neuralTrained} label={neuralTrained ? `v${neural?.version} active` : "Not trained"} />
          </div>

          {neural && (
            <>
              <p className="text-[12px] text-[var(--text-muted)]">{neural.architecture}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Metric
                  label="Training samples"
                  value={neural.training_samples || "—"}
                  sub="target: 600+"
                />
                <Metric
                  label="Val MSE"
                  value={neural.val_mse != null ? neural.val_mse.toFixed(2) : "—"}
                  sub="lower is better"
                />
                <Metric
                  label="Val MAE"
                  value={neural.val_mae != null ? neural.val_mae.toFixed(2) : "—"}
                  sub="≈ avg score error"
                />
                <Metric
                  label="Epochs"
                  value={neural.epochs_trained || "—"}
                  sub={neural.last_trained_at ? new Date(neural.last_trained_at).toLocaleDateString() : "never"}
                />
              </div>
            </>
          )}
        </div>
      )}

      {/* Training pipeline */}
      <div className="space-y-3">
        <h2 className="text-[16px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Layers className="w-4.5 h-4.5 text-[var(--text-muted)]" />
          Training Pipeline
        </h2>

        <TrainStep
          step={1}
          title="Generate synthetic training data"
          description="Uses Groq to generate 600+ labeled resume-JD pairs with per-dimension ATS scores. One-time step (~10 min). Data saved locally."
          done={step1Done}
          active={true}
          buttonLabel="Generate 600 pairs"
          running={running["gen"] ?? false}
          onRun={() => run("gen", () => modelMgmtApi.generateTrainingData(600), "Training data generation started in background (~10 min)")}
        />

        <TrainStep
          step={2}
          title="Train the neural scorer"
          description="Trains the custom PyTorch model on the generated data. After this, all scoring is local with no API calls. (~45-90 min on CPU, ~8 min on GPU)"
          done={step2Done}
          active={true}
          buttonLabel="Train model"
          running={running["neural"] ?? false}
          onRun={() => run("neural", () => modelMgmtApi.trainNeuralScorer(100), "Neural scorer training started — check back in ~1 hour")}
        />

        <TrainStep
          step={3}
          title="Fine-tune embedder"
          description="Fine-tunes the sentence-transformer on resume-JD pairs for better semantic understanding. Improves semantic_match_score accuracy. (~45 min on CPU)"
          done={false}
          active={step2Done}
          buttonLabel="Fine-tune embedder"
          running={running["embed"] ?? false}
          onRun={() => run("embed", () => modelMgmtApi.trainEmbedder(5), "Embedder fine-tuning started in background (~45 min)")}
        />

        <TrainStep
          step={4}
          title="Train score calibrator"
          description="Trains isotonic regression to calibrate scores against real user outcomes. Needs 80+ feedback samples. Run this after collecting real-world feedback."
          done={step3Done}
          active={step2Done && (calibrator?.samples_used ?? 0) >= 20}
          buttonLabel="Train calibrator"
          running={running["calib"] ?? false}
          onRun={() => run("calib", () => modelMgmtApi.trainCalibrator(), "Calibrator training started")}
        />

        <TrainStep
          step={5}
          title="Fine-tune on real feedback"
          description="Updates the neural model using real user outcome data (got_interview, rejected, etc.). Run monthly as feedback accumulates."
          done={false}
          active={step2Done && (calibrator?.samples_used ?? 0) >= 30}
          buttonLabel="Fine-tune on feedback"
          running={running["finetune"] ?? false}
          onRun={() => run("finetune", () => modelMgmtApi.trainNeuralScorer(50, true), "Fine-tuning on feedback data started (~30 min)")}
        />
      </div>

      {/* Calibrator + feedback summary */}
      {status && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
            <div className="flex items-center gap-2 mb-3">
              <BarChart3 className="w-4 h-4 text-[var(--text-muted)]" />
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Score Calibrator</h3>
              <StatusPill active={calibrator?.loaded ?? false} label={calibrator?.loaded ? "Active" : "Inactive"} />
            </div>
            <p className="text-[12px] text-[var(--text-muted)]">
              Feedback samples: <span className="text-[var(--text-primary)] font-semibold">{calibrator?.samples_used ?? 0}</span> / 80 needed
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--accent-primary)] transition-all"
                style={{ width: `${Math.min(100, ((calibrator?.samples_used ?? 0) / 80) * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-[var(--text-muted)] mt-1.5">
              {calibrator?.loaded
                ? `Calibrating: ${calibrator.dimensions_calibrated.join(", ")}`
                : "Will activate at 80 feedback samples"}
            </p>
          </div>

          <div className="p-4 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
            <div className="flex items-center gap-2 mb-3">
              <Cpu className="w-4 h-4 text-[var(--text-muted)]" />
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Embedder</h3>
              <StatusPill active={status.fine_tuned_embedder?.trained} label={status.fine_tuned_embedder?.trained ? "Fine-tuned" : "Stock model"} />
            </div>
            <p className="text-[12px] text-[var(--text-muted)]">
              Model: <span className="text-[var(--text-primary)] font-medium">{status.embedding_model?.model_name ?? "all-mpnet-base-v2"}</span>
            </p>
            <p className="text-[12px] text-[var(--text-muted)] mt-1">
              Embedding dim: <span className="text-[var(--text-primary)] font-medium">{status.embedding_model?.embedding_dim ?? 768}</span>
            </p>
          </div>
        </div>
      )}

      {/* Info box */}
      <div className="flex gap-3 p-4 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
        <Info className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
        <p className="text-[12px] text-[var(--text-muted)] leading-relaxed">
          Once the neural scorer is trained, <strong className="text-[var(--text-secondary)]">all scoring runs 100% locally</strong> with no API calls.
          The model improves continuously: every time a user records an outcome (got interview / rejected),
          that signal is used to fine-tune the model further. The goal is accuracy that surpasses
          generic LLMs because it&apos;s trained specifically on ATS scoring data.
        </p>
      </div>
    </div>
  );
}
