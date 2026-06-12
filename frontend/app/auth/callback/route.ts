import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://dzdziagugdcbkictslrt.supabase.co";
const SUPABASE_ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6ZHppYWd1Z2RjYmtpY3RzbHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTcwMjYsImV4cCI6MjA5NTQzMzAyNn0.1nf7Um3PDSZMzHaBmf2bIzgEqzwpClEp1i_leRnLBYE";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=missing_code`);
  }

  const cookieStore = await cookies();
  const response = NextResponse.redirect(`${origin}${next}`);

  // Use get/set/remove — @supabase/ssr v0.3.0's internal storage adapter
  // reads via cookies.get(); without it, the PKCE verifier is never found
  // and exchangeCodeForSession always fails.
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: object) {
        response.cookies.set({ name, value, ...(options as Record<string, unknown>) });
      },
      remove(name: string, options: object) {
        response.cookies.set({ name, value: "", ...(options as Record<string, unknown>) });
      },
    },
  });

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[auth/callback] exchangeCodeForSession error:", error.message);
    return NextResponse.redirect(`${origin}/login?error=auth_failed`);
  }

  // For Google OAuth logins that arrive without an explicit next destination,
  // send brand-new users (created in the last 5 minutes, no onboarding flag)
  // to the onboarding wizard. Existing users who simply lack the flag are left alone.
  if (next === "/dashboard") {
    const { data: { user } } = await supabase.auth.getUser();
    if (user && !user.user_metadata?.onboarding_completed) {
      const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
      const isNewAccount = Date.now() - createdAt < 5 * 60 * 1000; // within 5 minutes
      if (isNewAccount) {
        return NextResponse.redirect(`${origin}/onboarding`);
      }
    }
  }

  return response;
}
