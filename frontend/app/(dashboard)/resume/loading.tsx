export default function ResumeLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <div className="h-7 w-32 rounded-lg bg-[var(--bg-elevated)]" />
        <div className="h-4 w-72 rounded bg-[var(--bg-elevated)]" />
      </div>

      {/* Upload zone skeleton */}
      <div className="h-40 rounded-2xl border-2 border-dashed border-[var(--border-subtle)] bg-[var(--bg-surface)]" />

      {/* Resume list */}
      <div className="space-y-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-4 p-4 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]"
          >
            <div className="w-10 h-10 rounded-xl bg-[var(--bg-elevated)]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-48 rounded bg-[var(--bg-elevated)]" />
              <div className="h-3 w-32 rounded bg-[var(--bg-elevated)]" />
            </div>
            <div className="flex gap-2">
              <div className="h-7 w-16 rounded-lg bg-[var(--bg-elevated)]" />
              <div className="h-7 w-16 rounded-lg bg-[var(--bg-elevated)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
