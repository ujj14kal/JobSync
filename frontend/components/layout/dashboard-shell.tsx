"use client";

import { useRouter } from "next/navigation";
import { useInactivity } from "@/hooks/useInactivity";
import { InactivityModal } from "./inactivity-modal";
import { createClient } from "@/lib/supabase/client";

const WARN_AFTER  = 25 * 60 * 1000; // 25 minutes of inactivity → show warning
const LOGOUT_AFTER = 30 * 60 * 1000; // 5 more minutes → auto logout

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  async function handleLogout() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } finally {
      router.push("/login");
    }
  }

  const { showWarning, timeRemaining, resetTimer } = useInactivity({
    warningAfterMs: WARN_AFTER,
    logoutAfterMs:  LOGOUT_AFTER,
    onLogout: handleLogout,
  });

  return (
    <>
      {children}
      <InactivityModal
        isOpen={showWarning}
        timeRemaining={timeRemaining}
        onStayLoggedIn={resetTimer}
        onLogout={handleLogout}
      />
    </>
  );
}
