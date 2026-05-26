"use client";

import { useQuery } from "@tanstack/react-query";
import { Activity } from "lucide-react";
import { analysisApi } from "@/lib/api/analysis";
import type { ServiceStatus } from "@/lib/types";

interface ServiceStatusBadgeProps {
  /** Extra Tailwind classes to apply to the wrapper */
  className?: string;
  /**
   * compact  → shows only the dot + fraction  (e.g. "3/5")
   * full     → adds descriptive label          (e.g. "3/5 active")
   * detailed → adds message text below         (default)
   */
  variant?: "compact" | "full" | "detailed";
}

function colorClasses(status: ServiceStatus) {
  if (status.at_capacity) {
    return {
      wrapper: "text-red-400 border-red-400/25 bg-red-400/8",
      dot: "bg-red-400",
      bar: "bg-red-400",
      pulse: false,
    };
  }
  if (status.utilization_pct >= 60) {
    return {
      wrapper: "text-amber-400 border-amber-400/25 bg-amber-400/8",
      dot: "bg-amber-400",
      bar: "bg-amber-400",
      pulse: true,
    };
  }
  return {
    wrapper: "text-emerald-400 border-emerald-400/25 bg-emerald-400/8",
    dot: "bg-emerald-400",
    bar: "bg-emerald-400",
    pulse: true,
  };
}

export function ServiceStatusBadge({
  className = "",
  variant = "detailed",
}: ServiceStatusBadgeProps) {
  const { data: status, isLoading } = useQuery({
    queryKey: ["service-status"],
    queryFn: analysisApi.getStatus,
    refetchInterval: 10_000,   // poll every 10 s
    staleTime: 8_000,
    retry: false,              // don't spam retries on network error
  });

  if (isLoading || !status) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-elevated)] ${className}`}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--text-muted)] animate-pulse" />
        <span className="text-[11px] text-[var(--text-muted)] font-medium">Checking…</span>
      </div>
    );
  }

  const c = colorClasses(status);
  const fraction = `${status.active_analyses}/${status.max_concurrent}`;
  const label = status.at_capacity ? "At capacity" : `${fraction} active`;

  if (variant === "compact") {
    return (
      <div
        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${c.wrapper} ${className}`}
        title={status.message}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot} ${c.pulse ? "animate-pulse" : ""}`} />
        {fraction}
      </div>
    );
  }

  if (variant === "full") {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium ${c.wrapper} ${className}`}
        title={status.message}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${c.dot} ${c.pulse ? "animate-pulse" : ""}`} />
        {label}
      </div>
    );
  }

  // ── "detailed" variant ────────────────────────────────────────────────────
  const barWidthPct = Math.min(100, status.utilization_pct);

  return (
    <div className={`rounded-xl border p-3 ${c.wrapper} ${className}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Activity className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="text-[12px] font-semibold">Service capacity</span>
        </div>
        <span className="text-[11px] font-mono font-bold">{fraction}</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1 rounded-full bg-current/20 overflow-hidden mb-2">
        <div
          className={`h-full rounded-full transition-all duration-700 ${c.bar}`}
          style={{ width: `${barWidthPct}%` }}
        />
      </div>

      <p className="text-[11px] opacity-80 leading-snug">{status.message}</p>
    </div>
  );
}
