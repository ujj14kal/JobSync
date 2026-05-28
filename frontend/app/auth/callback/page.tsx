"use client";

/**
 * Client-side OAuth callback handler.
 *
 * Why client-side instead of a route.ts (server-side)?
 * @supabase/ssr stores the PKCE code verifier in document.cookie (browser JS).
 * A server-side route handler reads cookies from HTTP request headers — but the
 * cookie is only reliably available in the same browser JS context where it was
 * written.  Using createBrowserClient here guarantees we read from the same
 * storage, so exchangeCodeForSession always finds the verifier.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Zap } from "lucide-react";

export default function AuthCallbackPage() {
  const router = useRouter();
  const called = useRef(false);

  useEffect(() => {
    // Guard against React double-invoke (StrictMode / Suspense remount)
    // so the PKCE verifier cookie is only consumed once.
    if (called.current) return;
    called.current = true;

    // Read params from window.location to avoid triggering a Suspense cycle
    // (useSearchParams() would wrap in Suspense and could cause a remount).
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const next = params.get("next") ?? "/dashboard";

    if (!code) {
      router.replace("/login?error=missing_code");
      return;
    }

    // createClient() returns createBrowserClient — same storage as the login
    // page that initiated the OAuth flow and stored the PKCE verifier.
    const supabase = createClient();
    supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
      if (error) {
        console.error("[auth/callback]", error.message);
        router.replace("/login?error=auth_failed");
      } else {
        router.replace(next);
      }
    });
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex flex-col items-center justify-center gap-3">
      <div className="w-9 h-9 rounded-xl bg-[var(--accent-primary)] flex items-center justify-center animate-pulse">
        <Zap className="w-5 h-5 text-white" fill="white" />
      </div>
      <p className="text-sm text-[var(--text-secondary)]">Signing you in…</p>
    </div>
  );
}
