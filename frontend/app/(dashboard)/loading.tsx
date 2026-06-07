export default function DashboardLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-7 w-40 rounded-lg bg-[var(--bg-elevated)]" />
          <div className="h-4 w-64 rounded-lg bg-[var(--bg-elevated)]" />
        </div>
        <div className="h-9 w-32 rounded-xl bg-[var(--bg-elevated)]" />
      </div>

      {/* Quick actions skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]" />
        ))}
      </div>

      {/* Content skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-3">
          <div className="h-4 w-32 rounded bg-[var(--bg-elevated)]" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]" />
          ))}
        </div>
        <div className="space-y-3">
          <div className="h-4 w-28 rounded bg-[var(--bg-elevated)]" />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]" />
          ))}
        </div>
      </div>
    </div>
  );
}
