import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

const ADMIN_EMAIL = "ujj.kalra10@gmail.com";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    redirect("/dashboard");
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-primary)]">
      <nav className="border-b border-[var(--border-default)] px-6 py-3 flex items-center gap-3">
        <span className="text-[14px] font-bold">JobSynk Admin</span>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] border border-[var(--accent-primary)]/20">
          owner
        </span>
        <a
          href="/dashboard"
          className="ml-auto text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          ← Back to app
        </a>
      </nav>
      <div className="max-w-6xl mx-auto px-6 py-8">{children}</div>
    </div>
  );
}
