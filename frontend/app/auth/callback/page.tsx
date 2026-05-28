"use client";

/**
 * OAuth callback — manual PKCE, server-side session exchange.
 *
 * Flow:
 * 1. Login page generates PKCE verifier/challenge, stores verifier in localStorage,
 *    redirects to Supabase OAuth with code_challenge.
 * 2. Google redirects back here with ?code=...
 * 3. We POST { code, verifier, next } to /api/auth/exchange (server-side).
 * 4. The server exchanges the code, calls setSession() via createServerClient,
 *    and returns Set-Cookie headers on the JSON response.
 * 5. Browser stores those cookies, then window.location.href = next navigates
 *    to the dashboard — the middleware sees the session in request.cookies.
 *
 * Why server-side exchange? Browser setSession() writes via document.cookie, but
 * the auth-state-change flush can race with navigation. Server Set-Cookie headers
 * are guaranteed to be stored before the next request fires.
 */

import { useEffect, useRef } from "react";
import { Zap } from "lucide-react";

export default function AuthCallbackPage() {
  const called = useRef(false);

  useEffect(() => {
    if (called.current) return;
    called.current = true;

    const params   = new URLSearchParams(window.location.search);
    const code     = params.get("code");
    const next     = params.get("next") ?? "/dashboard";
    const verifier = localStorage.getItem("pkce_verifier");

    if (!code) {
      window.location.href = "/login?error=missing_code";
      return;
    }

    if (!verifier) {
      // No verifier (e.g. page reload on callback URL) — nothing we can do
      window.location.href = "/login?error=missing_verifier";
      return;
    }

    // Remove verifier so it can't be replayed
    localStorage.removeItem("pkce_verifier");

    // POST to our server-side exchange route — it sets session cookies in the response
    fetch("/api/auth/exchange", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, verifier, next }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || data.error) {
          console.error("[auth/callback] exchange error:", data.error);
          window.location.href = "/login?error=auth_failed";
          return;
        }
        // Cookies are now set via Set-Cookie headers on the response above.
        // Hard navigate so the browser sends them with the request.
        window.location.href = data.next ?? next;
      })
      .catch((err) => {
        console.error("[auth/callback] fetch error:", err);
        window.location.href = "/login?error=auth_failed";
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
