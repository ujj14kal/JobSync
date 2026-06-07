export default function AnalysisLoading() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <div className="h-7 w-36 rounded-lg bg-[var(--bg-elevated)]" />
          <div className="h-6 w-28 rounded-full bg-[var(--bg-elevated)]" />
        </div>
        <div className="h-4 w-80 rounded bg-[var(--bg-elevated)]" />
      </div>

      {/* Form + info panel */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 h-64 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]" />
        <div className="lg:col-span-2 space-y-4">
          <div className="h-40 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]" />
          <div className="h-40 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]" />
        </div>
      </div>

      {/* History */}
      <div className="space-y-3">
        <div className="h-4 w-36 rounded bg-[var(--bg-elevated)]" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]" />
        ))}
      </div>
    </div>
  );
}
