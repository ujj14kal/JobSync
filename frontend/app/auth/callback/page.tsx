"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Zap } from "lucide-react";

export default function AuthCallbackPage() {
  const router = useRouter();
  const called = useRef(false);

  useEffect(() => {
    // Guard against React double-mount (Suspense/hydration remount) consuming
    // the PKCE verifier cookie twice — second call would silently fail.
    if (called.current) return;
    called.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const next = params.get("next") ?? "/dashboard";

    if (!code) {
      router.replace("/login?error=missing_code");
      return;
    }

    const supabase = createClient();
    supabase.auth
      .exchangeCodeForSession(code)
      .then(({ error }) => {
        if (error) {
          console.error("[auth/callback]", error.message);
          router.replace("/login?error=auth_failed");
        } else {
          router.replace(next);
        }
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex flex-col items-center justify-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary)] flex items-center justify-center animate-pulse">
        <Zap className="w-5 h-5 text-white" fill="white" />
      </div>
      <p className="text-[14px] text-[var(--text-secondary)]">Completing sign-in…</p>
    </div>
  );
}
