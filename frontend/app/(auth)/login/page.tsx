"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Mail, Lock, Eye, EyeOff, Phone, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

// Firebase auth
import { auth as firebaseAuth } from "@/lib/firebase/client";
import {
  RecaptchaVerifier,
  signInWithPhoneNumber,
  ConfirmationResult,
  GoogleAuthProvider,
  signInWithPopup,
} from "firebase/auth";

type Tab = "email" | "phone";

// Extend window so TS doesn't complain about the global recaptcha verifier
declare global {
  interface Window {
    recaptchaVerifier?: RecaptchaVerifier;
    confirmationResult?: ConfirmationResult;
  }
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/dashboard";

  const [tab, setTab] = useState<Tab>("email");

  // Email state
  const [email, setEmail]         = useState("");
  const [password, setPassword]   = useState("");
  const [showPass, setShowPass]   = useState(false);

  // Phone state
  const [phone, setPhone]         = useState("");
  const [otp, setOtp]             = useState("");
  const [otpSent, setOtpSent]     = useState(false);

  const [loading, setLoading]     = useState(false);
  const recaptchaContainerRef     = useRef<HTMLDivElement>(null);
  const supabase = createClient();

  // ── Cleanup reCAPTCHA on unmount / tab switch ──────────────────────────
  useEffect(() => {
    return () => {
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = undefined;
      }
    };
  }, []);

  function resetPhone() {
    setOtpSent(false);
    setOtp("");
    setPhone("");
    if (window.recaptchaVerifier) {
      window.recaptchaVerifier.clear();
      window.recaptchaVerifier = undefined;
    }
  }

  /* ── Google Sign-In via Firebase ── */
  async function handleGoogle() {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope("email");
      provider.addScope("profile");

      const result = await signInWithPopup(firebaseAuth, provider);
      const idToken = await result.user.getIdToken();

      // Exchange Firebase ID token for a Supabase session
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/v1/auth/google-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Login failed" }));
        throw new Error(err.detail || "Login failed");
      }

      const { access_token, refresh_token } = await res.json();
      await supabase.auth.setSession({ access_token, refresh_token });
      router.push(redirect);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Google sign-in failed";
      // Ignore popup-closed-by-user — not a real error
      if (!msg.includes("popup-closed-by-user") && !msg.includes("cancelled-popup-request")) {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  /* ── Email / Password ── */
  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { toast.error(error.message); setLoading(false); return; }
    router.push(redirect);
  }

  /* ── Phone: send OTP via Firebase ── */
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.startsWith("+")) {
      toast.error("Include country code e.g. +91 9876543210");
      return;
    }
    setLoading(true);
    try {
      // Initialise invisible reCAPTCHA verifier (required by Firebase)
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(
          firebaseAuth,
          "recaptcha-container",
          { size: "invisible" }
        );
      }

      const confirmationResult = await signInWithPhoneNumber(
        firebaseAuth,
        phone,
        window.recaptchaVerifier
      );
      window.confirmationResult = confirmationResult;
      setOtpSent(true);
      toast.success("OTP sent! Check your SMS.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send OTP";
      toast.error(msg);
      // Reset verifier so user can retry
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = undefined;
      }
    } finally {
      setLoading(false);
    }
  }

  /* ── Phone: verify OTP via Firebase → exchange for Supabase session ── */
  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!window.confirmationResult) {
      toast.error("Session expired. Please request a new OTP.");
      setOtpSent(false);
      return;
    }
    setLoading(true);
    try {
      // 1. Confirm OTP with Firebase
      const credential = await window.confirmationResult.confirm(otp);
      const idToken = await credential.user.getIdToken();

      // 2. Exchange Firebase ID token for Supabase session via backend
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      const res = await fetch(`${apiUrl}/api/v1/auth/phone-login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken, phone }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Login failed" }));
        throw new Error(err.detail || "Login failed");
      }

      const { access_token, refresh_token } = await res.json();

      // 3. Set Supabase session in the browser
      await supabase.auth.setSession({ access_token, refresh_token });
      router.push(redirect);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "OTP verification failed";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center px-6">
      {/* Invisible reCAPTCHA container — Firebase renders into this div */}
      <div id="recaptcha-container" ref={recaptchaContainerRef} />

      <div className="w-full max-w-md">

        {/* Logo */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          className="flex justify-center mb-8">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[var(--accent-primary)] flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" fill="white" />
            </div>
            <span className="text-[16px] font-bold text-[var(--text-primary)]">JobSync</span>
          </Link>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="p-8 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">

          <h1 className="text-[22px] font-bold text-[var(--text-primary)] mb-1">Welcome back</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mb-6">Sign in to continue to JobSync</p>

          {/* Google */}
          <button onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-2.5 py-2.5 rounded-xl border border-[var(--border-default)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-overlay)] text-[13px] text-[var(--text-primary)] transition-colors mb-5">
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-xl bg-[var(--bg-elevated)] mb-5">
            {(["email", "phone"] as Tab[]).map((t) => (
              <button key={t} onClick={() => { setTab(t); resetPhone(); }}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[12px] font-medium transition-all ${
                  tab === t
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                }`}>
                {t === "email" ? <Mail className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
                {t === "email" ? "Email" : "Phone"}
              </button>
            ))}
          </div>

          <AnimatePresence mode="wait">

            {/* ── Email tab ── */}
            {tab === "email" && (
              <motion.form key="email" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.15 }}
                onSubmit={handleEmail} className="space-y-4">

                <div>
                  <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com" required
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors" />
                  </div>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input type={showPass ? "text" : "password"} value={password}
                      onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors" />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
                      {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors disabled:opacity-50">
                  {loading ? "Signing in…" : "Sign in"}
                </button>
              </motion.form>
            )}

            {/* ── Phone: enter number ── */}
            {tab === "phone" && !otpSent && (
              <motion.form key="phone-enter" initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.15 }}
                onSubmit={handleSendOtp} className="space-y-4">

                <div>
                  <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                    Phone number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
                    <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 9876543210" required
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors" />
                  </div>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1.5">Include country code (e.g. +91 for India)</p>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors disabled:opacity-50">
                  {loading ? "Sending…" : "Send OTP"}
                </button>
              </motion.form>
            )}

            {/* ── Phone: enter OTP ── */}
            {tab === "phone" && otpSent && (
              <motion.form key="phone-otp" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.15 }}
                onSubmit={handleVerifyOtp} className="space-y-4">

                <div className="flex items-center gap-2 p-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                  <ShieldCheck className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                  <p className="text-[12px] text-[var(--text-secondary)]">
                    OTP sent to <span className="font-medium text-[var(--text-primary)]">{phone}</span>
                  </p>
                </div>

                <div>
                  <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1.5">
                    Enter 6-digit OTP
                  </label>
                  <input type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6}
                    value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                    placeholder="123456" required
                    className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors tracking-[0.3em] text-center text-[16px] font-mono" />
                </div>

                <button type="submit" disabled={loading || otp.length < 6}
                  className="w-full py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors disabled:opacity-50">
                  {loading ? "Verifying…" : "Verify & Sign in"}
                </button>

                <button type="button" onClick={resetPhone}
                  className="w-full py-2 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
                  ← Change number
                </button>
              </motion.form>
            )}

          </AnimatePresence>

          <p className="text-center text-[12px] text-[var(--text-muted)] mt-5">
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-[var(--accent-primary)] hover:text-[var(--accent-hover)] font-medium">
              Sign up free
            </Link>
          </p>
        </motion.div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--bg-base)]" />}>
      <LoginContent />
    </Suspense>
  );
}
