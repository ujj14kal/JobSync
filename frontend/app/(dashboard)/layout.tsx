import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { AuroraBackground } from "@/components/ui/aurora-background";
import { PrefetchProvider } from "@/components/layout/prefetch-provider";
import { UpsellProvider } from "@/components/billing/UpsellModal";
import ChatSidebarClient from "@/components/chat/ChatSidebarClient";
import { FeedbackProvider } from "@/components/feedback/FeedbackProvider";
import WarningModal, { type PendingWarning } from "@/components/WarningModal";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dashboard",
};

async function acknowledgeWarning(warningId: string): Promise<void> {
  "use server";
  const supabase = await createClient();
  await supabase
    .from("user_warnings")
    .update({ acknowledged_at: new Date().toISOString() })
    .eq("id", warningId);
}

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

  // Fetch the oldest unacknowledged warning for this user
  const { data: warningRows } = await supabase
    .from("user_warnings")
    .select("id, message, warning_number, sent_at")
    .eq("user_id", user.id)
    .is("acknowledged_at", null)
    .order("sent_at", { ascending: true })
    .limit(1);

  const pendingWarning: PendingWarning | null =
    warningRows && warningRows.length > 0 ? (warningRows[0] as PendingWarning) : null;

  return (
    <FeedbackProvider>
    <UpsellProvider>
      <div className="relative flex h-screen bg-[var(--bg-base)] overflow-hidden">
        {/* Rich ambient aurora background */}
        <AuroraBackground />

        {/* Dot grid texture overlay */}
        <div className="fixed inset-0 pointer-events-none z-0 dot-grid opacity-60" />

        <PrefetchProvider />
        <Sidebar />
        <main className="relative z-10 flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <DashboardShell>
              {children}
            </DashboardShell>
          </div>
        </main>

        {/* Ask Claude floating sidebar — client-only to avoid hydration mismatch */}
        <ChatSidebarClient />

        {/* Warning modal — blocks all interaction until user acknowledges */}
        <WarningModal warning={pendingWarning} onAcknowledge={acknowledgeWarning} />
      </div>
    </UpsellProvider>
    </FeedbackProvider>
  );
}
