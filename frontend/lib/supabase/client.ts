"use client";

import { createBrowserClient } from "@supabase/ssr";

// Fallbacks ensure the app works when NEXT_PUBLIC_ vars are not set in Vercel
// Project Settings. Supabase anon key is safe to expose — RLS enforces access.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://dzdziagugdcbkictslrt.supabase.co";
const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6ZHppYWd1Z2RjYmtpY3RzbHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTcwMjYsImV4cCI6MjA5NTQzMzAyNn0.1nf7Um3PDSZMzHaBmf2bIzgEqzwpClEp1i_leRnLBYE";

export function createClient() {
  return createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}
