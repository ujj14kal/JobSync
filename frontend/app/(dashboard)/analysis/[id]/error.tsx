"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";

export default function AnalysisError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[analysis/error]", error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(239,68,68,0.10)", border: "1px solid rgba(239,68,68,0.25)" }}
      >
        <AlertTriangle className="w-8 h-8" style={{ color: "#ef4444" }} />
      </div>
      <div>
        <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-2">
          Analysis unavailable
        </h2>
        <p className="text-[13px] text-[var(--text-muted)] max-w-sm">
          We couldn&apos;t load this analysis. It may have been deleted or an error occurred.
        </p>
      </div>
      <button
        onClick={reset}
        className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all"
        style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}
      >
        <RotateCcw className="w-3.5 h-3.5" /> Try again
      </button>
    </div>
  );
}
