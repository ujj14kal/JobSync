"use client";

import { useEffect } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[JobSynk] Unhandled error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#080809] text-white">
      <div className="text-center px-6 max-w-md">
        <div className="w-14 h-14 rounded-2xl bg-red-400/10 border border-red-400/20 flex items-center justify-center mx-auto mb-5">
          <AlertTriangle className="w-7 h-7 text-red-400" />
        </div>
        <h1 className="text-[20px] font-semibold mb-2">Something went wrong</h1>
        <p className="text-[13px] text-white/50 mb-6 leading-relaxed">
          An unexpected error occurred. Your data is safe — this is likely a temporary issue.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-[13px] font-medium transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Try again
          </button>
          <Link
            href="/"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 hover:bg-white/5 text-[13px] text-white/60 transition-colors"
          >
            <Home className="w-3.5 h-3.5" /> Go home
          </Link>
        </div>
        {error.digest && (
          <p className="text-[11px] text-white/25 mt-5">Error ID: {error.digest}</p>
        )}
      </div>
    </div>
  );
}
