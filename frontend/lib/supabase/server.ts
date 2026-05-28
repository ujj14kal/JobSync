import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://dzdziagugdcbkictslrt.supabase.co";
const SUPABASE_ANON =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6ZHppYWd1Z2RjYmtpY3RzbHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTcwMjYsImV4cCI6MjA5NTQzMzAyNn0.1nf7Um3PDSZMzHaBmf2bIzgEqzwpClEp1i_leRnLBYE";

export async function createClient() {
  const cookieStore = await cookies();

  // Use get/set/remove — @supabase/ssr v0.3.0's storage adapter reads via
  // cookies.get(); a getAll-only adapter causes getItem() to always return
  // undefined, breaking session reads everywhere.
  return createServerClient(SUPABASE_URL, SUPABASE_ANON, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value;
      },
      set(name: string, value: string, options: object) {
        try {
          cookieStore.set({ name, value, ...(options as Record<string, unknown>) });
        } catch {
          // Server Component — writes handled by middleware
        }
      },
      remove(name: string, options: object) {
        try {
          cookieStore.set({ name, value: "", ...(options as Record<string, unknown>) });
        } catch {
          // Server Component — writes handled by middleware
        }
      },
    },
  });
}
