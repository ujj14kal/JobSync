/**
 * POST /api/auth/exchange
 *
 * Receives { code, verifier, next } from the client-side callback page,
 * exchanges the PKCE code for tokens, and sets the session via createServerClient
 * so the cookies are written directly into the HTTP response headers.
 *
 * Why server-side? Browser setSession() writes cookies via document.cookie, but
 * the auth-state-change flush can race with window.location.href navigation, so
 * the middleware sees the request before the cookie lands. Setting cookies on the
 * server response guarantees they arrive in the browser BEFORE the next navigation.
 */

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://dzdziagugdcbkictslrt.supabase.co";
const SUPABASE_ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6ZHppYWd1Z2RjYmtpY3RzbHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTcwMjYsImV4cCI6MjA5NTQzMzAyNn0.1nf7Um3PDSZMzHaBmf2bIzgEqzwpClEp1i_leRnLBYE";

export async function POST(request: NextRequest) {
  const { code, verifier, next = "/dashboard" } = await request.json();

  if (!code || !verifier) {
    return NextResponse.json({ error: "missing_params" }, { status: 400 });
  }

  // Exchange code + verifier with Supabase token endpoint
  const tokenRes = await fetch(
    `${SUPABASE_URL}/auth/v1/token?grant_type=pkce`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_ANON,
      },
      body: JSON.stringify({ auth_code: code, code_verifier: verifier }),
    }
  );

  const data = await tokenRes.json();

  if (data.error || !data.access_token) {
    console.error("[api/auth/exchange] token error:", data.error_description ?? data.error);
    return NextResponse.json(
      { error: data.error ?? "token_exchange_failed" },
      { status: 400 }
    );
  }

  // Build the response first so createServerClient can attach Set-Cookie headers to it
  const response = NextResponse.json({ ok: true, next });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
        );
      },
    },
  });

  const { error } = await supabase.auth.setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  });

  if (error) {
    console.error("[api/auth/exchange] setSession error:", error.message);
    return NextResponse.json({ error: "session_error" }, { status: 500 });
  }

  return response;
}
