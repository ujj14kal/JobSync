"use client";

/**
 * OAuth callback — manual PKCE exchange via localStorage.
 *
 * Why manual? @supabase/ssr stores the PKCE verifier in cookies, but the
 * cookie never reliably survives the Supabase→Google→app redirect chain.
 * Instead the login page stores the verifier in localStorage (guaranteed
 * same-tab persistence across cross-origin redirects).  Here we read it,
 * POST directly to Supabase /token, then call setSession() so the session
 * lands in cookies where the middleware can see it.
 */

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Zap } from "lucide-react";

const SUPABASE_URL  = "https://dzdziagugdcbkictslrt.supabase.co";
const SUPABASE_ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6ZHppYWd1Z2RjYmtpY3RzbHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTcwMjYsImV4cCI6MjA5NTQzMzAyNn0.1nf7Um3PDSZMzHaBmf2bIzgEqzwpClEp1i_leRnLBYE";

export default function AuthCallbackPage() {
  const router  = useRouter();
  const called  = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const params   = new URLSearchParams(window.location.search);
    const code     = params.get("code");
    const next     = params.get("next") ?? "/dashboard";
    const verifier = localStorage.getItem("pkce_verifier");

    if (!code) {
      router.replace("/login?error=missing_code");
      return;
    }
    if (!verifier) {
      // Verifier missing — fall back to Supabase client exchange (handles
      // edge cases like page reload on callback URL).
      createClient()
        .auth.exchangeCodeForSession(code)
        .then(({ error }) =>
          router.replace(error ? "/login?error=auth_failed" : next)
        );
      return;
    }

    // Remove verifier so it can't be replayed.
    localStorage.removeItem("pkce_verifier");

    // Exchange code + verifier directly with Supabase token endpoint.
    fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=pkce`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON,
      },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    })
      .then((r) => r.json())
      .then(async (data) => {
        if (data.error || !data.access_token) {
          console.error("[auth/callback] token error:", data.error_description ?? data.error);
          router.replace("/login?error=auth_failed");
          return;
        }
        // Store session in cookies (so middleware / server components can read it).
        const supabase = createClient();
        const { error } = await supabase.auth.setSession({
          access_token:  data.access_token,
          refresh_token: data.refresh_token,
        });
        router.replace(error ? "/login?error=session_error" : next);
      })
      .catch((err) => {
        console.error("[auth/callback] fetch error:", err);
        router.replace("/login?error=auth_failed");
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
