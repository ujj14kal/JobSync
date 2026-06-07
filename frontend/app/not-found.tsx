import Link from "next/link";
import { FileSearch, Home, BarChart2 } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg-base,#080809)] text-white px-6">
      <div className="text-center max-w-sm">
        <div className="text-[64px] font-bold text-white/10 mb-2 leading-none">404</div>
        <div className="w-12 h-12 rounded-2xl bg-[var(--accent-muted,rgba(99,102,241,0.1))] border border-[var(--accent-primary,#6366f1)]/20 flex items-center justify-center mx-auto mb-4">
          <FileSearch className="w-6 h-6 text-[var(--accent-primary,#6366f1)]" />
        </div>
        <h1 className="text-[18px] font-semibold mb-2">Page not found</h1>
        <p className="text-[13px] text-white/50 mb-6 leading-relaxed">
          This page doesn&apos;t exist or was moved. Check the URL or head back to the dashboard.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[var(--accent-primary,#6366f1)] hover:opacity-90 text-white text-[13px] font-medium transition-opacity"
          >
            <Home className="w-3.5 h-3.5" /> Dashboard
          </Link>
          <Link
            href="/analysis"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-white/15 hover:bg-white/5 text-[13px] text-white/60 transition-colors"
          >
            <BarChart2 className="w-3.5 h-3.5" /> New analysis
          </Link>
        </div>
      </div>
    </div>
  );
}
