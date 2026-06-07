export default function InsightsLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-7 w-28 rounded-lg bg-[var(--bg-elevated)]" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]" />
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-48 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]" />
        ))}
      </div>
    </div>
  );
}
