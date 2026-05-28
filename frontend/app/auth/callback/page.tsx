"use client";

import { useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Zap } from "lucide-react";

function CallbackHandler() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  useEffect(() => {
    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/dashboard";

    if (!code) {
      router.replace("/login?error=missing_code");
      return;
    }

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

export default function AuthCallbackPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
        <div className="w-10 h-10 rounded-xl bg-[var(--accent-primary)] animate-pulse flex items-center justify-center">
          <Zap className="w-5 h-5 text-white" fill="white" />
        </div>
      </div>
    }>
      <CallbackHandler />
    </Suspense>
  );
}
