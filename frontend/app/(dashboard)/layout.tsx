import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AuroraBackground } from "@/components/ui/aurora-background";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div className="relative flex h-screen bg-[var(--bg-base)] overflow-hidden">
      {/* Rich ambient aurora background */}
      <AuroraBackground />

      {/* Dot grid texture overlay */}
      <div className="fixed inset-0 pointer-events-none z-0 dot-grid opacity-60" />

      <Sidebar />
      <main className="relative z-10 flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <DashboardShell>
            {children}
          </DashboardShell>
        </div>
      </main>
    </div>
  );
}
