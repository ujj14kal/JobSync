import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://dzdziagugdcbkictslrt.supabase.co";
const SUPABASE_ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6ZHppYWd1Z2RjYmtpY3RzbHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTcwMjYsImV4cCI6MjA5NTQzMzAyNn0.1nf7Um3PDSZMzHaBmf2bIzgEqzwpClEp1i_leRnLBYE";

export async function middleware(request: NextRequest) {
  const { pathname, searchParams, origin } = request.nextUrl;

  // Forward any stray OAuth code that lands outside /auth/callback
  const code = searchParams.get("code");
  if (code && pathname !== "/auth/callback") {
    const next = searchParams.get("next") ?? "/dashboard";
    const callbackUrl = new URL("/auth/callback", origin);
    callbackUrl.searchParams.set("code", code);
    callbackUrl.searchParams.set("next", next);
    return NextResponse.redirect(callbackUrl);
  }

  // Let the auth callback route handle its own exchange
  if (pathname.startsWith("/auth/callback")) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  // Use get/set/remove (not getAll/setAll) — @supabase/ssr v0.3.0's internal
  // storage adapter calls cookies.get() to read; getAll-only adapters return
  // undefined from getItem, making getUser() always return null.
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: object) {
        request.cookies.set({ name, value, ...(options as Record<string, unknown>) });
        supabaseResponse = NextResponse.next({ request });
        supabaseResponse.cookies.set({ name, value, ...(options as Record<string, unknown>) });
      },
      remove(name: string, options: object) {
        request.cookies.set({ name, value: "", ...(options as Record<string, unknown>) });
        supabaseResponse = NextResponse.next({ request });
        supabaseResponse.cookies.set({ name, value: "", ...(options as Record<string, unknown>) });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();

  const isAuthPage =
    pathname.startsWith("/login") || pathname.startsWith("/signup");

  const isDashboard =
    pathname.startsWith("/dashboard") ||
    pathname.startsWith("/analysis") ||
    pathname.startsWith("/resume") ||
    pathname.startsWith("/mentors") ||
    pathname.startsWith("/improve") ||
    pathname.startsWith("/insights");

  if (!user && isDashboard) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
