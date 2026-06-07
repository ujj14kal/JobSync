export default function JobsLoading() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="h-7 w-36 rounded-lg bg-[var(--bg-elevated)]" />
      <div className="flex gap-3">
        <div className="h-9 flex-1 rounded-xl bg-[var(--bg-elevated)]" />
        <div className="h-9 w-24 rounded-xl bg-[var(--bg-elevated)]" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="h-20 rounded-2xl bg-[var(--bg-surface)] border border-[var(--border-subtle)]" />
      ))}
    </div>
  );
}
