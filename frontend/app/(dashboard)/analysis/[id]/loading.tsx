export default function AnalysisResultLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Breadcrumb + title */}
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3 w-48 rounded bg-[var(--bg-elevated)]" />
          <div className="h-7 w-56 rounded-lg bg-[var(--bg-elevated)]" />
          <div className="h-4 w-36 rounded bg-[var(--bg-elevated)]" />
        </div>
        <div className="flex gap-2">
          <div className="h-8 w-24 rounded-lg bg-[var(--bg-elevated)]" />
          <div className="h-8 w-28 rounded-lg bg-[var(--bg-elevated)]" />
        </div>
      </div>

      {/* Score card */}
      <div className="p-6 rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] flex flex-col md:flex-row items-center gap-8">
        <div className="w-32 h-32 rounded-full bg-[var(--bg-elevated)]" />
        <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-3 w-full">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-[var(--bg-elevated)]" />
          ))}
        </div>
        <div className="flex flex-col gap-2 flex-shrink-0 w-36">
          <div className="h-9 rounded-xl bg-[var(--bg-elevated)]" />
          <div className="h-9 rounded-xl bg-[var(--bg-elevated)]" />
        </div>
      </div>

      {/* Tabs */}
      <div className="h-12 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]" />

      {/* Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-32 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]" />
        ))}
      </div>
    </div>
  );
}
