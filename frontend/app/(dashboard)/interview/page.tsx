"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient } from "@/lib/api/client";
import { chatApi } from "@/lib/api/chat";
import { CheckoutModal } from "@/components/billing/CheckoutModal";
import {
  Mic, MicOff, ChevronRight, CheckCircle2, AlertCircle,
  RotateCcw, Sparkles, Brain, Loader2, ArrowRight,
  Building2, FileText, User, Clock, ChevronDown, ChevronUp, TrendingUp,
  Maximize2, X, Zap, Lock, Target, ListChecks, Award, BookOpen, MessageSquare,
} from "lucide-react";
import { toast } from "sonner";

// ── Types ────────────────────────────────────────────────────────────────────

interface Question {
  question: string;
  type: "behavioral" | "technical" | "situational";
  follow_up_hint: string;
  ideal_points: string[];
}

interface Feedback {
  score: number;
  overall_feedback: string;
  strengths: string[];
  improvements: string[];
  follow_up: string | null;
}

type Phase = "setup" | "analyzing" | "session" | "results" | "history";
type SessionMode = "thinking" | "recording" | "evaluating" | "feedback";

// ── Brand SVG Logos ───────────────────────────────────────────────────────────

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function MetaLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5">
      <defs>
        <linearGradient id="meta-g1" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#0064E1"/>
          <stop offset="100%" stopColor="#0080FF"/>
        </linearGradient>
      </defs>
      <path d="M6.5 24c0-4.2 1.5-7.8 3.8-10.2C12.6 11.4 15.1 10 18 10c2.1 0 3.9.8 5.5 2.3C25.1 13.8 26.5 16 28 19c1.5-3 2.9-5.2 4.5-6.7C34.1 10.8 35.9 10 38 10c2.9 0 5.4 1.4 7.7 3.8 2.3 2.4 3.8 6 3.8 10.2 0 4.5-1.7 8.8-5.2 11.8-2 1.7-4.1 2.5-6 2.5-1.7 0-3.2-.6-4.8-1.8-1.3-1-2.5-2.4-3.5-4-1 1.6-2.2 3-3.5 4-1.6 1.2-3.1 1.8-4.8 1.8-1.9 0-4-.8-6-2.5C8.2 32.8 6.5 28.5 6.5 24zm11.5-9.8c-1.9 0-3.8.9-5.4 2.8-1.6 1.9-2.6 4.5-2.6 7 0 3.5 1.2 7.1 3.6 9.2 1.4 1.2 2.8 1.8 4.1 1.8 1 0 2.1-.4 3.3-1.3 1.5-1.1 2.8-3 4-5.5-1.5-3.3-2.8-5.8-3.8-7.4-1.2-1.9-2.1-2.8-3.2-2.8zm20 0c-1.1 0-2 .9-3.2 2.8-1 1.6-2.3 4.1-3.8 7.4 1.2 2.5 2.5 4.4 4 5.5 1.2.9 2.3 1.3 3.3 1.3 1.3 0 2.7-.6 4.1-1.8 2.4-2.1 3.6-5.7 3.6-9.2 0-2.5-1-5.1-2.6-7-1.6-1.9-3.5-2.8-5.4-2.8z" fill="url(#meta-g1)"/>
    </svg>
  );
}

function AmazonLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5">
      <path d="M28.5 19.2c0 1.1.1 2 .3 2.6.2.6.5 1.3 1 1.9.2.2.2.5 0 .7L28 25.6c-.2.1-.4.2-.6 0-1-.8-1.7-1.7-2.2-2.8-.1-.2-.1-.2-.3 0-1.4 2-3.4 3-6 3-1.8 0-3.2-.5-4.3-1.5-1.1-1-1.6-2.4-1.6-4.2 0-1.9.7-3.4 2-4.5 1.3-1.1 3.1-1.6 5.3-1.6.7 0 1.5.1 2.4.2V13c0-1.3-.3-2.3-.8-2.8-.5-.5-1.4-.8-2.7-.8-1.2 0-2.3.2-3.3.7-1 .5-1.9 1-2.6 1.6-.3.2-.6.1-.7-.2L11 9.8c-.1-.3 0-.6.2-.8 1-.8 2.3-1.5 3.7-2 1.4-.5 2.9-.7 4.3-.7 2.8 0 4.8.7 6.1 2 1.3 1.4 2 3.4 2 6.1l-.8 4.8zM24 23.1V21c-.7-.1-1.3-.2-1.9-.2-1.2 0-2.1.3-2.7.8-.6.5-.9 1.2-.9 2.1 0 1.9.9 2.8 2.7 2.8.9 0 1.6-.2 2.2-.6.6-.3.6-1.3.6-2.8z" fill="#FF9900"/>
      <path d="M37 32.8c-4.3 3.2-10.6 4.9-15.9 4.9-7.5 0-14.3-2.8-19.4-7.4-.4-.4 0-.9.5-.6 5.5 3.2 12.3 5.1 19.4 5.1 4.7 0 10-1 14.7-3 .7-.3 1.3.5.7.9v.1z" fill="#FF9900"/>
      <path d="M38.8 30.8c-.6-.7-3.7-.4-5.1-.2-.4.1-.5-.3-.1-.6 2.5-1.7 6.6-1.2 7.1-.7.5.6-.1 4.7-2.5 6.7-.4.3-.7.1-.6-.3.5-1.3 1.7-4.2 1.2-4.9z" fill="#FF9900"/>
    </svg>
  );
}

function MicrosoftLogo() {
  return (
    <svg viewBox="0 0 21 21" className="w-5 h-5">
      <rect x="1" y="1" width="9" height="9" fill="#F25022"/>
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00"/>
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF"/>
      <rect x="11" y="11" width="9" height="9" fill="#FFB900"/>
    </svg>
  );
}

function AppleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
    </svg>
  );
}

function NetflixLogo() {
  return (
    <svg viewBox="0 0 111 30" className="h-4 w-auto" fill="#E50914">
      <path d="M105.06 29l-8.35-21.6V29h-5.54V1h7.75l8.35 21.6V1H113v28h-7.94zM87.65 1v5.4H78.9v5.4h8.75v5.4H78.9V29h-5.54V1h14.3zM67.25 1v22.6H75v5.4H61.71V1h5.54zM50.85 29V6.4H44.3V1H63v5.4h-6.6V29h-5.54zM37.5 29V16.4L29.75 1h6.35l4.6 9.6 4.6-9.6h6.35L43.9 16.4V29H37.5zM0 1h5.54v12.6L15.13 1h6.93L11.1 14.9 22.75 29h-7.07L5.54 17.5V29H0V1z"/>
    </svg>
  );
}

function NetflixLogoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <path d="M5.398 0v.006c3.028 8.556 5.37 15.175 8.348 23.596 2.344.058 4.85.398 4.854.398-2.8-7.924-5.923-16.747-8.487-24zm8.489 0v9.63L18.6 22.951c-.043-7.86-.004-15.913.002-22.95zM5.398 1.05V24c1.873-.225 2.81-.312 4.715-.398v-9.22z" fill="#E50914"/>
    </svg>
  );
}

function BlackRockLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5">
      <rect width="48" height="48" rx="4" fill="#1C1C1C"/>
      <text x="24" y="31" textAnchor="middle" fill="white" fontSize="16" fontWeight="bold" fontFamily="serif">BR</text>
    </svg>
  );
}

function GoldmanSachsLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5">
      <rect width="48" height="48" rx="4" fill="#003087"/>
      <text x="24" y="31" textAnchor="middle" fill="#C8A84B" fontSize="13" fontWeight="bold" fontFamily="serif">GS</text>
    </svg>
  );
}

function StripeLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z" fill="#635BFF"/>
    </svg>
  );
}

function UberLogo() {
  return (
    <svg viewBox="0 0 48 48" className="w-5 h-5">
      <rect width="48" height="48" rx="24" fill="#000"/>
      <text x="24" y="31" textAnchor="middle" fill="white" fontSize="14" fontWeight="900" fontFamily="sans-serif">U</text>
    </svg>
  );
}

function AirbnbLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5">
      <path d="M12 .005C5.383.005 0 5.388 0 12.005c0 6.617 5.383 12 12 12s12-5.383 12-12S18.617.005 12 .005zm0 3.09c2.646 0 4.796 2.15 4.796 4.796S14.646 12.687 12 12.687s-4.796-2.15-4.796-4.796S9.354 3.095 12 3.095zM12 20.92c-2.945 0-5.546-1.437-7.153-3.638.12-1.29.948-2.413 2.17-2.93.896-.378 1.923-.397 2.86-.066.637.227 1.313.34 2.008.34.696 0 1.372-.113 2.01-.34.936-.331 1.963-.312 2.859.066 1.22.517 2.05 1.64 2.17 2.93-1.607 2.2-4.208 3.638-7.153 3.638h.029z" fill="#FF5A5F"/>
    </svg>
  );
}

function OpenAILogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z"/>
    </svg>
  );
}

function GeneralLogo() {
  return (
    <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.5">
      <circle cx="12" cy="12" r="10"/>
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
    </svg>
  );
}

// ── Constants ────────────────────────────────────────────────────────────────

const ROLES = [
  "Software Engineer", "Product Manager", "Data Scientist", "ML Engineer",
  "Frontend Engineer", "Backend Engineer", "Full Stack Engineer", "DevOps Engineer",
  "UX Designer", "Business Analyst", "Data Analyst", "Quantitative Analyst",
  "Investment Analyst", "Solutions Architect", "Marketing Manager",
];

const COMPANIES = [
  { name: "Google",        Logo: GoogleLogo,       bg: "bg-white",           border: "border-gray-200/60" },
  { name: "Meta",          Logo: MetaLogo,         bg: "bg-white",           border: "border-blue-200/60" },
  { name: "Amazon",        Logo: AmazonLogo,       bg: "bg-[#232F3E]",       border: "border-orange-400/40" },
  { name: "Microsoft",     Logo: MicrosoftLogo,    bg: "bg-white",           border: "border-gray-200/60" },
  { name: "Apple",         Logo: AppleLogo,        bg: "bg-gray-900",        border: "border-gray-700/60",   logoColor: "text-white" },
  { name: "Netflix",       Logo: NetflixLogoIcon,  bg: "bg-black",           border: "border-red-800/60" },
  { name: "BlackRock",     Logo: BlackRockLogo,    bg: "bg-[#1C1C1C]",       border: "border-gray-700/60" },
  { name: "Goldman Sachs", Logo: GoldmanSachsLogo, bg: "bg-[#003087]",       border: "border-blue-900/60" },
  { name: "Stripe",        Logo: StripeLogo,       bg: "bg-[#0A2540]",       border: "border-[#713600]/40" },
  { name: "Uber",          Logo: UberLogo,         bg: "bg-black",           border: "border-gray-700/60" },
  { name: "Airbnb",        Logo: AirbnbLogo,       bg: "bg-white",           border: "border-red-200/60" },
  { name: "OpenAI",        Logo: OpenAILogo,       bg: "bg-[#0F0F0F]",       border: "border-gray-700/60",   logoColor: "text-white" },
  { name: "General",       Logo: GeneralLogo,      bg: "bg-[var(--bg-elevated)]", border: "border-[var(--border-subtle)]", logoColor: "text-[var(--text-secondary)]" },
];

const EXPERIENCE_LEVELS = [
  { value: "student", label: "Student / Intern", icon: "🎓" },
  { value: "entry",   label: "Entry (0–2 yrs)",  icon: "🌱" },
  { value: "mid",     label: "Mid (2–5 yrs)",    icon: "⚡" },
  { value: "senior",  label: "Senior (5+ yrs)",  icon: "🚀" },
];

const INTERVIEW_TYPES = [
  { value: "behavioral", label: "Behavioural", desc: "STAR-format past experience", icon: "💬" },
  { value: "technical",  label: "Technical",   desc: "Problem-solving & depth",     icon: "⚙️" },
  { value: "mixed",      label: "Mixed",       desc: "Both behavioural & technical", icon: "✨" },
];

const ANALYSIS_STEPS = [
  { label: "Scanning your active resume",       icon: FileText },
  { label: "Loading company interview profile", icon: Building2 },
  { label: "Analysing your background",         icon: User },
  { label: "Generating personalised questions", icon: Sparkles },
];

const THINK_SECONDS  = 60;
const SILENCE_MS     = 2500;
const SILENCE_RMS    = 0.013;
const FEEDBACK_AUTO_ADVANCE = 7;

// ── Frequency Visualizer ─────────────────────────────────────────────────────

function FrequencyBars({
  analyser,
  active,
  color = "#6366f1",
  bars = 48,
  height = 72,
}: {
  analyser: AnalyserNode | null;
  active: boolean;
  color?: string;
  bars?: number;
  height?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;

    if (!analyser || !active) {
      cancelAnimationFrame(rafRef.current);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = color + "30";
      ctx.fillRect(0, canvas.height / 2 - 1, canvas.width, 2);
      return;
    }

    analyser.fftSize = 256;
    const bufLen = analyser.frequencyBinCount;
    const data   = new Uint8Array(bufLen);
    const cw     = canvas.width;
    const ch     = canvas.height;
    const bw     = cw / bars;

    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      analyser!.getByteFrequencyData(data);
      ctx.clearRect(0, 0, cw, ch);
      for (let i = 0; i < bars; i++) {
        const sliceStart = Math.floor(i * bufLen / bars);
        const sliceEnd   = Math.floor((i + 1) * bufLen / bars);
        let sum = 0;
        for (let j = sliceStart; j < sliceEnd; j++) sum += data[j];
        const avg  = sum / (sliceEnd - sliceStart);
        const barH = Math.max(2, (avg / 255) * ch);
        const x    = i * bw;
        const grad = ctx.createLinearGradient(0, ch - barH, 0, ch);
        grad.addColorStop(0, color + "ff");
        grad.addColorStop(1, color + "20");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.roundRect(x + 1, ch - barH, Math.max(1, bw - 2), barH, 2);
        ctx.fill();
      }
    }
    draw();
    return () => cancelAnimationFrame(rafRef.current);
  }, [analyser, active, color, bars, height]);

  return (
    <canvas
      ref={canvasRef}
      width={600}
      height={height}
      className="w-full"
      style={{ height }}
    />
  );
}

// ── ElevenLabs logo (their "11" two-bar mark) ────────────────────────────────
function ElevenLabsLogo({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 20 16" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <rect x="0"  y="0" width="5.5" height="16" rx="1.5"/>
      <rect x="7.25" y="3" width="5.5" height="10" rx="1.5"/>
      <rect x="14.5" y="0" width="5.5" height="16" rx="1.5"/>
    </svg>
  );
}

// ── Analysis Screen ───────────────────────────────────────────────────────────

function AnalysisScreen({
  company,
  Logo,
  apiReady,
  onDone,
}: {
  company: string;
  Logo?: React.ComponentType;
  apiReady: boolean;
  onDone: () => void;
}) {
  const [step, setStep] = useState(0);

  useEffect(() => {
    // Steps 1–3 are fast backend ops; advance them quickly
    const ts = [
      setTimeout(() => setStep(1), 500),
      setTimeout(() => setStep(2), 1100),
      setTimeout(() => setStep(3), 1700),
    ];
    return () => ts.forEach(clearTimeout);
  }, []);

  // Step 4 only completes once the real API call resolves
  useEffect(() => {
    if (apiReady && step >= 3) {
      setStep(4);
      setTimeout(onDone, 500);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiReady, step]);

  return (
    <motion.div
      key="analyzing"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="flex flex-col items-center justify-center py-16 space-y-8"
    >
      <div className="text-center">
        <div className="relative w-20 h-20 mx-auto mb-5">
          <div className="absolute inset-0 rounded-2xl bg-[var(--accent-primary)]/20 animate-pulse" />
          <div className="w-20 h-20 rounded-2xl bg-[var(--accent-muted)] border border-[var(--accent-primary)]/30 flex items-center justify-center relative">
            <Brain className="w-9 h-9 text-[var(--accent-primary)]" />
          </div>
        </div>
        <h2 className="text-[20px] font-bold text-[var(--text-primary)] mb-1">Preparing Your Interview</h2>
        <p className="text-[13px] text-[var(--text-secondary)]">
          Tailoring questions for <span className="font-semibold text-[var(--accent-hover)]">{company}</span>
        </p>
      </div>
      <div className="w-full max-w-sm space-y-3">
        {ANALYSIS_STEPS.map((s, i) => {
          const Icon = s.icon;
          const done = step > i; const cur = step === i;
          return (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: step >= i ? 1 : 0.3, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
                done ? "border-emerald-400/30 bg-emerald-400/5"
                  : cur ? "border-[var(--accent-primary)]/30 bg-[var(--accent-subtle)]"
                  : "border-[var(--border-subtle)] bg-[var(--bg-surface)]"
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                done ? "bg-emerald-400/15" : cur ? "bg-[var(--accent-muted)]" : "bg-[var(--bg-elevated)]"
              }`}>
                {done ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  : cur ? <Loader2 className="w-4 h-4 text-[var(--accent-primary)] animate-spin" />
                  : <Icon className="w-4 h-4 text-[var(--text-muted)]" />}
              </div>
              <span className={`text-[13px] ${done ? "text-emerald-400" : cur ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-muted)]"}`}>
                {s.label}{done && " ✓"}
              </span>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ── QuestionCard — collapsible per-question report card ──────────────────────

function QuestionCard({
  index,
  question,
  feedback,
  answer,
}: {
  index: number;
  question: Question;
  feedback: Feedback;
  answer: string;
}) {
  const [open, setOpen] = useState(false);
  const scoreColor = feedback.score >= 7 ? "#10b981" : feedback.score >= 5 ? "#f59e0b" : "#ef4444";
  const typeBadge = question.type === "technical"
    ? "text-blue-400 bg-blue-400/10 border-blue-400/20"
    : question.type === "situational"
    ? "text-[#d4aa30] bg-[#d4aa30]/10 border-[#d4aa30]/20"
    : "text-amber-400 bg-amber-400/10 border-amber-400/20";

  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] overflow-hidden">
      {/* Header row — always visible */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-start gap-3 p-4 text-left hover:bg-[var(--bg-elevated)] transition-colors"
      >
        {/* Score circle */}
        <div className="flex-shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center text-[12px] font-black tabular-nums"
          style={{ borderColor: scoreColor, color: scoreColor }}>
          {feedback.score}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${typeBadge}`}>
              {question.type}
            </span>
            <span className="text-[10px] text-[var(--text-muted)]">Q{index + 1}</span>
          </div>
          <p className="text-[13px] text-[var(--text-primary)] font-medium leading-snug line-clamp-2">{question.question}</p>
        </div>

        {/* Score bar + chevron */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-16 h-1.5 rounded-full bg-[var(--bg-overlay)] overflow-hidden hidden sm:block">
            <div className="h-full rounded-full transition-all" style={{ width: `${(feedback.score / 10) * 100}%`, background: scoreColor }} />
          </div>
          {open ? <ChevronUp className="w-4 h-4 text-[var(--text-muted)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-muted)]" />}
        </div>
      </button>

      {/* Expanded content */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-3 border-t border-[var(--border-subtle)]">

              {/* User's answer */}
              {answer && (
                <div className="mt-3">
                  <div className="flex items-center gap-1.5 text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider mb-1.5">
                    <MessageSquare className="w-3 h-3" /> Your answer
                  </div>
                  <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed bg-[var(--bg-elevated)] rounded-lg p-3 border border-[var(--border-subtle)] italic">
                    "{answer}"
                  </p>
                </div>
              )}

              {/* Overall feedback */}
              <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{feedback.overall_feedback}</p>

              {/* Strengths + Improvements */}
              <div className="grid grid-cols-2 gap-3">
                {feedback.strengths.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 mb-1.5">
                      <CheckCircle2 className="w-3 h-3" /> Strengths
                    </div>
                    {feedback.strengths.map((s, i) => (
                      <div key={i} className="text-[11px] text-[var(--text-muted)] flex gap-1.5 mb-1">· {s}</div>
                    ))}
                  </div>
                )}
                {feedback.improvements.length > 0 && (
                  <div>
                    <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 mb-1.5">
                      <AlertCircle className="w-3 h-3" /> To improve
                    </div>
                    {feedback.improvements.map((s, i) => (
                      <div key={i} className="text-[11px] text-[var(--text-muted)] flex gap-1.5 mb-1">· {s}</div>
                    ))}
                  </div>
                )}
              </div>

              {/* Ideal points hint */}
              {question.ideal_points?.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold text-[var(--accent-primary)] mb-1.5 uppercase tracking-wider">What a great answer covers</div>
                  <div className="flex flex-wrap gap-1.5">
                    {question.ideal_points.map((p, i) => (
                      <span key={i} className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--accent-muted)] text-[var(--accent-hover)] border border-[var(--accent-primary)]/20">{p}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function InterviewPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const { data: status, refetch: refetchStatus } = useQuery({
    queryKey: ["chat-status"],
    queryFn: chatApi.getStatus,
    staleTime: 60_000,
    retry: false,
  });
  const isPro = mounted && status?.is_pro === true;
  const interviewCreditsLeft = mounted ? (status?.interview_voice_credits ?? 0) : null;
  const hasVoiceCredits = mounted && (status?.interview_voice_credits ?? 0) > 0;
  const canStartInterview = isPro || (mounted && (status?.interview_voice_credits ?? 0) > 0);
  const [showBuySession, setShowBuySession] = useState(false);
  const [showBuyVoice, setShowBuyVoice] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [savedSession, setSavedSession] = useState<{
    questions: Question[];
    qIndex: number;
    allFeedback: Feedback[];
    role: string;
    company: string;
    resumeLoaded: boolean;
  } | null>(null);

  const [phase,       setPhase]       = useState<Phase>("setup");
  const [sessionMode, setSessionMode] = useState<SessionMode>("thinking");

  const [ttsAvail,      setTtsAvail]      = useState(false);
  const [aiSpeaking,    setAiSpeaking]    = useState(false);
  const [useElevenLabs, setUseElevenLabs] = useState(false);
  const [previewing,    setPreviewing]    = useState<string | null>(null);
  const [elVoices, setElVoices] = useState<{ id: string; name: string; desc: string; gender: string }[]>([]);
  const [selectedElVoice, setSelectedElVoice] = useState("EXAVITQu4vr4xnSDxMaL");
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedBrowserVoice, setSelectedBrowserVoice] = useState("");

  const [role,      setRole]      = useState("Software Engineer");
  const [company,   setCompany]   = useState("General");
  const [expLevel,  setExpLevel]  = useState("entry");
  const [iType,     setIType]     = useState("mixed");
  const [numQ,      setNumQ]      = useState(5);
  const [showAllCo, setShowAllCo] = useState(false);

  const [questions,    setQuestions]    = useState<Question[]>([]);
  const [qIndex,       setQIndex]       = useState(0);
  const [answer,       setAnswer]       = useState("");
  const [feedback,     setFeedback]     = useState<Feedback | null>(null);
  const [allFeedback,  setAllFeedback]  = useState<Feedback[]>([]);
  const [allAnswers,   setAllAnswers]   = useState<string[]>([]);
  const [companyInfo,  setCompanyInfo]  = useState<{ name: string; style: string; focus: string[] } | null>(null);
  const [resumeLoaded, setResumeLoaded] = useState(false);
  const [pendingFollowUp, setPendingFollowUp] = useState<string | null>(null);

  const [thinkSecs,  setThinkSecs]  = useState(THINK_SECONDS);
  const thinkIntRef  = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const [advanceSecs, setAdvanceSecs] = useState(FEEDBACK_AUTO_ADVANCE);
  const advanceIntRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const audioCtxRef   = useRef<AudioContext | null>(null);
  const aiAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef  = useRef<MediaStream | null>(null);
  const audioElRef    = useRef<HTMLAudioElement | null>(null);
  const silenceRafRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);
  const hasSpeechRef  = useRef(false);
  const silenceStartRef = useRef<number | null>(null);
  const ttsAbortRef   = useRef<AbortController | null>(null);
  const ttsSessionRef = useRef(false);  // true once ElevenLabs credit was consumed this session

  const [micActive, setMicActive] = useState(false);
  const [analysisReady, setAnalysisReady] = useState(false);
  const pendingSessionData = useRef<any>(null);

  const sessionRef = useRef<HTMLDivElement>(null);

  const selectedCompany = COMPANIES.find(c => c.name === company) ?? COMPANIES[COMPANIES.length - 1];
  const displayedCos = showAllCo ? COMPANIES : COMPANIES.slice(0, 8);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    apiClient.get("/interview/tts/status")
      .then(({ data }) => setTtsAvail(data.available))
      .catch(() => setTtsAvail(false));
    apiClient.get("/interview/voices")
      .then(({ data }) => { setElVoices(data.voices); setSelectedElVoice(data.default); })
      .catch(() => {});

    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const load = () => {
      const all = window.speechSynthesis.getVoices();
      const PRIORITY = ["Samantha", "Ava", "Allison", "Victoria", "Alex", "Tom", "Daniel", "Karen"];
      // Only show well-known named voices — skip anything with a non-word/gibberish name
      const BLOCKED = new Set(["Bad","Bahh","Bells","Boing","Bubbles","Cellos","Jester","Organ","Superstar","Trinoids","Whisper","Wobble","Zarvox","Bottle","Boing","Pipe Organ","Good News","Hysterical","Deranged"]);
      const priorityFound = PRIORITY.map(n => all.find(v => v.name === n)).filter(Boolean) as SpeechSynthesisVoice[];
      const fallback = all.filter(v => v.lang.startsWith("en") && !PRIORITY.includes(v.name) && /^[A-Z][a-z]{3,}/.test(v.name) && !BLOCKED.has(v.name));
      const sorted = [...priorityFound, ...fallback].slice(0, 6);
      if (sorted.length) {
        setBrowserVoices(sorted);
        setSelectedBrowserVoice(sorted[0].name);
      }
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
  }, []);

  // ── Audio helpers ─────────────────────────────────────────────────────────

  function getAudioCtx(): AudioContext {
    if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
      audioCtxRef.current = new AudioContext();
    }
    return audioCtxRef.current;
  }

  async function speakText(text: string) {
    stopAudio();
    setAiSpeaking(true);

    if (useElevenLabs && ttsAvail) {
      const controller = new AbortController();
      ttsAbortRef.current = controller;
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const token = await createClient().auth.getSession()
          .then(r => r.data.session?.access_token ?? "");
        const resp = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/interview/tts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ text, voice_id: selectedElVoice }),
            signal: controller.signal,
          }
        );
        if (!resp.ok) throw new Error();
        const blob  = await resp.blob();
        // If stopAudio() was called while we were fetching, bail out cleanly
        if (ttsAbortRef.current !== controller) return;
        ttsAbortRef.current = null;
        ttsSessionRef.current = true;
        const url   = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioElRef.current = audio;
        const ctx      = getAudioCtx();
        if (ctx.state === "suspended") await ctx.resume();
        const src      = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        analyser.connect(ctx.destination);
        aiAnalyserRef.current = analyser;
        audio.onended = () => { setAiSpeaking(false); aiAnalyserRef.current = null; URL.revokeObjectURL(url); startThinkTime(); };
        audio.onerror = () => { setAiSpeaking(false); startThinkTime(); };
        await audio.play();
        return;
      } catch (err: unknown) {
        if ((err as Error)?.name === "AbortError") {
          // Cleanly cancelled by stopAudio() — don't start think time
          setAiSpeaking(false);
          return;
        }
        // ElevenLabs failed — stop partial audio, skip browser TTS (question is visible on screen)
        audioElRef.current?.pause();
        audioElRef.current = null;
        aiAnalyserRef.current = null;
        ttsAbortRef.current = null;
        setAiSpeaking(false);
        startThinkTime();
        return;
      }
    }

    if (!("speechSynthesis" in window)) {
      setAiSpeaking(false);
      startThinkTime();
      return;
    }

    // Chrome bug: speechSynthesis gets paused after fullscreen / focus changes
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();

    const speak = () => {
      const utt = new SpeechSynthesisUtterance(text);
      utt.rate   = 0.9;
      utt.pitch  = 1.0;
      utt.volume = 1;

      const allVoices = window.speechSynthesis.getVoices();
      const pick = allVoices.find(v => v.name === selectedBrowserVoice)
        ?? allVoices.find(v => v.name === "Samantha")
        ?? allVoices.find(v => v.lang.startsWith("en-") && !v.name.toLowerCase().includes("google"))
        ?? allVoices.find(v => v.lang.startsWith("en"))
        ?? null;
      if (pick) utt.voice = pick;

      utt.onend   = () => { setAiSpeaking(false); startThinkTime(); };
      utt.onerror = (e) => {
        // "interrupted" fires when we cancel() a previous utterance — not a real error
        if ((e as SpeechSynthesisErrorEvent).error === "interrupted") return;
        setAiSpeaking(false);
        startThinkTime();
      };
      window.speechSynthesis.speak(utt);

      // Chrome sometimes silently drops the utterance; kick it after 200ms if still queued
      setTimeout(() => {
        if (window.speechSynthesis.paused) window.speechSynthesis.resume();
      }, 200);
    };

    // If voices haven't loaded yet, wait for them
    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        window.speechSynthesis.onvoiceschanged = null;
        speak();
      };
    } else {
      speak();
    }
  }

  function stopAudio() {
    ttsAbortRef.current?.abort();
    ttsAbortRef.current = null;
    audioElRef.current?.pause();
    audioElRef.current = null;
    window.speechSynthesis?.cancel();
    aiAnalyserRef.current = null;
    setAiSpeaking(false);
  }

  async function previewVoice(voiceId: string, isBrowser = false) {
    if (previewing) { stopAudio(); window.speechSynthesis?.cancel(); setPreviewing(null); return; }
    setPreviewing(voiceId);
    const SAMPLE = "Hi, I'm your interviewer. Ready?";

    if (isBrowser) {
      if (!("speechSynthesis" in window)) { setPreviewing(null); return; }
      const utt  = new SpeechSynthesisUtterance(SAMPLE);
      utt.rate   = 0.9; utt.pitch = 1.0; utt.volume = 1;
      const pick = window.speechSynthesis.getVoices().find(v => v.name === voiceId) ?? null;
      if (pick) utt.voice = pick;
      utt.onend   = () => setPreviewing(null);
      utt.onerror = () => {
        setPreviewing(null);
        toast.error(`"${voiceId.split(" ")[0]}" preview unavailable on this device`);
      };
      window.speechSynthesis.speak(utt);
      return;
    }

    if (!ttsAvail) { toast.error("ElevenLabs not configured"); setPreviewing(null); return; }
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const token = await createClient().auth.getSession()
        .then(r => r.data.session?.access_token ?? "");
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/interview/tts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: SAMPLE, voice_id: voiceId }),
        }
      );
      if (!resp.ok) throw new Error();
      const blob  = await resp.blob();
      const url   = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioElRef.current = audio;
      audio.onended = () => { setPreviewing(null); URL.revokeObjectURL(url); };
      audio.onerror = () => setPreviewing(null);
      await audio.play();
    } catch {
      setPreviewing(null);
      toast.error("Preview failed");
    }
  }

  // ── Think time ────────────────────────────────────────────────────────────

  function startThinkTime() {
    if (thinkIntRef.current) clearInterval(thinkIntRef.current);
    setThinkSecs(THINK_SECONDS);
    setSessionMode("thinking");

    let remaining = THINK_SECONDS;
    thinkIntRef.current = setInterval(() => {
      remaining--;
      setThinkSecs(remaining);
      if (remaining <= 0) {
        clearInterval(thinkIntRef.current);
        beginRecording();
      }
    }, 1000);
  }

  function skipThinkTime() {
    if (thinkIntRef.current) clearInterval(thinkIntRef.current);
    beginRecording();
  }

  // ── Recording ────────────────────────────────────────────────────────────

  const beginRecording = useCallback(async () => {
    setSessionMode("recording");
    setAnswer("");
    hasSpeechRef.current   = false;
    silenceStartRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setMicActive(true);

      const ctx      = getAudioCtx();
      const src      = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      micAnalyserRef.current = analyser;

      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SR) {
        const recog = new SR();
        recog.lang = "en-US";
        recog.continuous = true;
        recog.interimResults = true;
        recog.onresult = (e: any) => {
          const transcript = Array.from(e.results).map((r: any) => r[0].transcript).join("");
          setAnswer(transcript);
        };
        recog.onerror = () => {};
        recog.start();
        recognitionRef.current = recog;
      }

      const silenceBuffer = new Float32Array(analyser.fftSize);
      function detectSilence() {
        silenceRafRef.current = requestAnimationFrame(detectSilence);
        analyser.getFloatTimeDomainData(silenceBuffer);
        const rms = Math.sqrt(silenceBuffer.reduce((s, v) => s + v * v, 0) / silenceBuffer.length);
        if (rms > SILENCE_RMS) {
          hasSpeechRef.current    = true;
          silenceStartRef.current = null;
        } else if (hasSpeechRef.current) {
          if (!silenceStartRef.current) silenceStartRef.current = Date.now();
          if (Date.now() - silenceStartRef.current > SILENCE_MS) {
            cancelAnimationFrame(silenceRafRef.current);
            stopRecordingAndSubmit();
          }
        }
      }
      detectSilence();
    } catch {
      toast.error("Microphone permission needed for the interview.");
      setSessionMode("thinking");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIndex]);

  function stopMic() {
    cancelAnimationFrame(silenceRafRef.current);
    recognitionRef.current?.stop();
    micStreamRef.current?.getTracks().forEach(t => t.stop());
    micStreamRef.current = null;
    micAnalyserRef.current = null;
    setMicActive(false);
  }

  async function stopRecordingAndSubmit() {
    stopMic();
    setSessionMode("evaluating");

    const currentQ    = pendingFollowUp ?? questions[qIndex]?.question ?? "";
    const currentType = pendingFollowUp ? "situational" : (questions[qIndex]?.type ?? "behavioral");
    const finalAnswer = answer.trim();

    if (!finalAnswer) {
      toast.error("No answer detected — try again.");
      setSessionMode("thinking");
      startThinkTime();
      return;
    }

    try {
      const { data } = await apiClient.post("/interview/evaluate", {
        role,
        question: currentQ,
        answer:   finalAnswer,
        question_type: currentType,
      });
      const fb = data as Feedback;
      setFeedback(fb);
      if (!pendingFollowUp) {
        setAllFeedback(prev => [...prev, fb]);
        setAllAnswers(prev => [...prev, finalAnswer]);
      }
      setSessionMode("feedback");
      startAutoAdvance(fb);
    } catch {
      toast.error("Evaluation failed — moving to next question.");
      advanceQuestion(null);
    }
  }

  function startAutoAdvance(fb: Feedback) {
    if (advanceIntRef.current) clearInterval(advanceIntRef.current);
    setAdvanceSecs(FEEDBACK_AUTO_ADVANCE);
    let rem = FEEDBACK_AUTO_ADVANCE;
    advanceIntRef.current = setInterval(() => {
      rem--;
      setAdvanceSecs(rem);
      if (rem <= 0) {
        clearInterval(advanceIntRef.current);
        advanceQuestion(fb);
      }
    }, 1000);
  }

  function advanceQuestion(fb: Feedback | null) {
    if (advanceIntRef.current) clearInterval(advanceIntRef.current);
    stopAudio();

    if (pendingFollowUp) {
      setPendingFollowUp(null);
      setAnswer("");
      setFeedback(null);
      const nextIdx = qIndex + 1;
      if (nextIdx >= questions.length) {
        stopMic();
        setPhase("results");
        document.exitFullscreen?.().catch(() => {});
        refetchStatus();
        return;
      }
      setQIndex(nextIdx);
      speakNextQuestion(nextIdx);
      return;
    }

    if (fb?.follow_up && answer.length > 80) {
      setPendingFollowUp(fb.follow_up);
      setAnswer("");
      setFeedback(null);
      speakText(fb.follow_up);
      return;
    }

    const nextIdx = qIndex + 1;
    if (nextIdx >= questions.length) {
      stopMic();
      setPhase("results");
      document.exitFullscreen?.().catch(() => {});
      refetchStatus();
      return;
    }
    setQIndex(nextIdx);
    setAnswer("");
    setFeedback(null);
    setPendingFollowUp(null);
    speakNextQuestion(nextIdx);
  }

  function speakNextQuestion(idx: number) {
    const q = questions[idx];
    if (q) speakText(q.question);
    else startThinkTime();
  }

  async function startInterview() {
    if (!canStartInterview) {
      setShowBuySession(true);
      return;
    }
    setPhase("analyzing");
    setAnalysisReady(false);
    pendingSessionData.current = null;

    try {
      const { data } = await apiClient.post("/interview/hirevue/start", {
        role, company, experience_level: expLevel, interview_type: iType, num_questions: numQ,
      });
      // Store result; the AnalysisScreen's onDone callback will apply it
      pendingSessionData.current = data;
      setAnalysisReady(true);
    } catch (err: unknown) {
      setPhase("setup");
      const status = (err as { response?: { status?: number; data?: { detail?: string } } })?.response?.status;
      if (status === 402) {
        toast.error("No interview credits remaining — buy a session to continue.", { duration: 6000 });
        refetchStatus();
        setShowBuySession(true);
      } else {
        toast.error("Failed to generate questions. Try again.");
      }
    }
  }

  function applySessionData() {
    const data = pendingSessionData.current;
    if (!data) return;
    setQuestions(data.questions);
    setCompanyInfo(data.company_profile);
    setResumeLoaded(data.resume_loaded ?? false);
    setQIndex(0);
    setAllFeedback([]);
    setAllAnswers([]);
    setReport(null);
    setFeedback(null);
    setAnswer("");
    setPendingFollowUp(null);
    setPhase("session");

    // Speak first — Chrome cancels speech when fullscreen is requested
    const firstQ = data.questions[0]?.question;
    if (firstQ) speakText(firstQ);

    // Request fullscreen after a tick so speech is already queued
    setTimeout(() => {
      try { document.documentElement.requestFullscreen(); } catch {}
    }, 100);
  }

  function exitSession() {
    stopAudio();
    stopMic();
    if (thinkIntRef.current)   clearInterval(thinkIntRef.current);
    if (advanceIntRef.current) clearInterval(advanceIntRef.current);
    document.exitFullscreen?.().catch(() => {});
    setPhase("setup");
    setQuestions([]);
    setQIndex(0);
    setAnswer("");
    setFeedback(null);
    setAllFeedback([]);
    setAllAnswers([]);
    setReport(null);
    setPendingFollowUp(null);
    setSessionMode("thinking");
    ttsSessionRef.current = false;
  }

  async function handleConfirmedExit() {
    setShowExitConfirm(false);
    // Snapshot current session for the Resume button before clearing state
    setSavedSession({
      questions: [...questions],
      qIndex,
      allFeedback: [...allFeedback],
      role,
      company,
      resumeLoaded,
    });
    // Refund ElevenLabs credit — user didn't complete the interview
    if (useElevenLabs && ttsSessionRef.current) {
      try { await apiClient.post("/interview/voice/cancel"); } catch {}
    }
    exitSession();
  }

  function handleResume() {
    if (!savedSession) return;
    const { questions: qs, qIndex: qi, allFeedback: af, role: r, company: co, resumeLoaded: rl } = savedSession;
    setSavedSession(null);
    setQuestions(qs);
    setQIndex(qi);
    setAllFeedback(af);
    setRole(r);
    setCompany(co);
    setResumeLoaded(rl);
    setFeedback(null);
    setAnswer("");
    setPendingFollowUp(null);
    setSessionMode("thinking");
    setPhase("session");
    setTimeout(() => {
      const q = qs[qi];
      if (q) speakText(q.question);
      else startThinkTime();
    }, 50);
    setTimeout(() => {
      try { document.documentElement.requestFullscreen(); } catch {}
    }, 100);
  }

  const overallScore = allFeedback.length
    ? Math.round(allFeedback.reduce((s, f) => s + f.score, 0) / allFeedback.length)
    : 0;

  // ── Report (generated once when results phase begins) ─────────────────────
  type ReportData = {
    verdict: string;
    interview_pct: number;
    top_strengths: string[];
    improvement_plan: { area: string; tip: string; priority: string }[];
    skill_gaps: string[];
    next_steps: string[];
  };
  const [report, setReport] = useState<ReportData | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  useEffect(() => {
    if (phase !== "results" || allFeedback.length === 0 || report) return;
    setReportLoading(true);
    const avgScore = allFeedback.reduce((s, f) => s + f.score, 0) / allFeedback.length;
    const items = questions.map((q, i) => ({
      question: q.question,
      question_type: q.type,
      answer: allAnswers[i] ?? "",
      score: allFeedback[i]?.score ?? 5,
      strengths: allFeedback[i]?.strengths ?? [],
      improvements: allFeedback[i]?.improvements ?? [],
      overall_feedback: allFeedback[i]?.overall_feedback ?? "",
    })).filter((_, i) => allFeedback[i]);
    apiClient.post("/interview/report", { role, company, items })
      .then(({ data }) => {
        setReport(data);
        // Auto-save session to history (fire-and-forget)
        apiClient.post("/interview/sessions", {
          role,
          company,
          questions: questions.map(q => ({ question: q.question, type: q.type, follow_up_hint: q.follow_up_hint, ideal_points: q.ideal_points })),
          answers: allAnswers,
          feedback: allFeedback.map(f => ({ score: f.score, overall_feedback: f.overall_feedback, strengths: f.strengths, improvements: f.improvements })),
          report: data,
          overall_score: parseFloat(avgScore.toFixed(2)),
          interview_pct: data.interview_pct,
        }).then(() => {
          // Invalidate history cache so the new session appears if user visits history
          setHistorySessions(null);
        }).catch(() => {});
      })
      .catch(() => {})
      .finally(() => setReportLoading(false));
  }, [phase]);

  // ── History ───────────────────────────────────────────────────────────────
  type HistorySession = {
    id: string;
    role: string;
    company: string;
    overall_score: number | null;
    interview_pct: number | null;
    created_at: string;
    verdict: string | null;
    num_questions: number;
  };
  type FullSession = {
    id: string;
    role: string;
    company: string;
    questions: Question[];
    answers: string[];
    feedback: Feedback[];
    report: ReportData | null;
    overall_score: number | null;
    interview_pct: number | null;
    created_at: string;
  };

  const [historySessions, setHistorySessions] = useState<HistorySession[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [selectedSession, setSelectedSession] = useState<FullSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(false);

  useEffect(() => {
    if (phase !== "history" || historySessions !== null) return;
    setHistoryLoading(true);
    apiClient.get("/interview/sessions")
      .then(({ data }) => setHistorySessions(data.sessions ?? []))
      .catch(() => setHistorySessions([]))
      .finally(() => setHistoryLoading(false));
  }, [phase]);

  function loadSession(id: string) {
    setSessionLoading(true);
    setSelectedSession(null);
    apiClient.get(`/interview/sessions/${id}`)
      .then(({ data }) => setSelectedSession(data))
      .catch(() => toast.error("Could not load session"))
      .finally(() => setSessionLoading(false));
  }

  function deleteSession(id: string) {
    apiClient.delete(`/interview/sessions/${id}`)
      .then(() => {
        setHistorySessions(prev => (prev ?? []).filter(s => s.id !== id));
        if (selectedSession?.id === id) setSelectedSession(null);
      })
      .catch(() => toast.error("Could not delete session"));
  }

  const currentQuestion = pendingFollowUp ?? questions[qIndex]?.question ?? "";
  const currentType     = pendingFollowUp ? "situational" : questions[qIndex]?.type;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl mx-auto space-y-0">

      {/* ── Page hero header ── */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative rounded-2xl overflow-hidden mb-6 border border-[var(--border-subtle)]"
        style={{ background: "linear-gradient(135deg, rgba(192,88,0,0.12) 0%, rgba(212,170,48,0.07) 50%, rgba(15,14,13,0) 100%)" }}
      >
        {/* Decorative orbs */}
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-3xl pointer-events-none" style={{ background: "radial-gradient(circle, rgba(192,88,0,0.15) 0%, transparent 70%)" }} />
        <div className="absolute bottom-0 left-32 w-40 h-40 rounded-full blur-2xl pointer-events-none" style={{ background: "radial-gradient(circle, rgba(212,170,48,0.10) 0%, transparent 70%)" }} />

        <div className="relative px-6 py-5 flex items-center justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "rgba(192,88,0,0.15)", border: "1px solid rgba(192,88,0,0.25)" }}>
                <Brain className="w-4 h-4" style={{ color: "#C05800" }} />
              </div>
              <h1 className="text-[22px] font-bold text-[var(--text-primary)] tracking-tight">AI Interview Practice</h1>
              <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider" style={{ background: "rgba(192,88,0,0.12)", color: "#d4aa30", border: "1px solid rgba(212,170,48,0.25)" }}>
                <Zap className="w-2.5 h-2.5" /> HireVue-style
              </span>
            </div>
            <p className="text-[13px] text-[var(--text-muted)]">
              Personalised questions from your resume · AI voice interviewer · instant feedback
            </p>
          </div>
          {phase !== "session" && phase !== "analyzing" && (
            <button
              onClick={() => {
                if (phase === "history") { setPhase("setup"); setSelectedSession(null); }
                else { setPhase("history"); }
              }}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[12px] font-medium transition-all border ${
                phase === "history"
                  ? "border-[var(--accent-primary)]/40 bg-[var(--accent-muted)] text-[var(--accent-hover)]"
                  : "border-[var(--border-default)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:border-[var(--border-default)]"
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              {phase === "history" ? "← Back" : "History"}
            </button>
          )}
        </div>
      </motion.div>

      <AnimatePresence mode="wait">

        {/* ── Setup ── */}
        {phase === "setup" && (
          <motion.div key="setup" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>

            {/* Resume-in-progress banner */}
            {savedSession && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center justify-between gap-4 p-4 rounded-xl mb-4 border"
                style={{ borderColor: "rgba(192,88,0,0.3)", background: "rgba(192,88,0,0.06)" }}
              >
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: "#d4aa30" }}>
                    Interview in progress — {savedSession.company} · {savedSession.role}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5">
                    {savedSession.allFeedback.length} of {savedSession.questions.length} questions answered
                  </div>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button onClick={handleResume}
                    className="px-4 py-2 rounded-lg text-white text-[12px] font-semibold transition-all"
                    style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}>
                    Resume
                  </button>
                  <button onClick={() => setSavedSession(null)}
                    className="px-3 py-2 rounded-lg border border-[var(--border-subtle)] text-[var(--text-muted)] text-[12px] hover:text-[var(--text-secondary)] transition-colors">
                    Discard
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Single unified configurator card ── */}
            <div className="rounded-2xl border border-[var(--border-subtle)] overflow-hidden flex flex-col" style={{ background: "var(--bg-surface)", height: "calc(100vh - 196px)" }}>

              {/* ① Company */}
              <div className="px-6 py-5 flex-1 flex flex-col justify-center">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">Company</span>
                  <button onClick={() => setShowAllCo(v => !v)}
                    className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
                    {showAllCo ? "Show less" : "Show all"} <ChevronDown className={`w-3 h-3 transition-transform ${showAllCo ? "rotate-180" : ""}`} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {displayedCos.map(co => {
                    const Logo = co.Logo;
                    const isSelected = company === co.name;
                    return (
                      <button key={co.name} onClick={() => setCompany(co.name)}
                        className="relative group flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-xl border transition-all duration-150"
                        style={isSelected
                          ? { background: "rgba(192,88,0,0.10)", borderColor: "rgba(192,88,0,0.50)", boxShadow: "0 0 0 3px rgba(192,88,0,0.08)" }
                          : { background: "var(--bg-elevated)", borderColor: "var(--border-subtle)" }}
                      >
                        <span className={`w-6 h-6 rounded-lg flex items-center justify-center overflow-hidden flex-shrink-0 ${co.bg} ${co.logoColor ?? ""}`}>
                          <Logo />
                        </span>
                        <span className={`text-[12px] font-semibold leading-none whitespace-nowrap transition-colors ${isSelected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)] group-hover:text-[var(--text-primary)]"}`}>
                          {co.name}
                        </span>
                        {isSelected && <motion.div layoutId="co-sel" className="absolute inset-0 rounded-xl ring-1 ring-[rgba(192,88,0,0.45)] pointer-events-none" />}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ② Role */}
              <div className="px-6 py-5 flex-1 flex flex-col justify-center border-t border-[var(--border-subtle)]">
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-2">Role</div>
                    <input
                      list="roles-list"
                      value={role}
                      onChange={e => setRole(e.target.value)}
                      placeholder="What role are you interviewing for?"
                      className="w-full bg-transparent text-[17px] font-medium text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
                    />
                    <datalist id="roles-list">{ROLES.map(r => <option key={r} value={r} />)}</datalist>
                  </div>
                  {role.trim() && (
                    <button onClick={() => setRole("")}
                      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                      style={{ background: "var(--bg-elevated)" }}>
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                    </button>
                  )}
                </div>
              </div>

              {/* ③ Experience + Format */}
              <div className="flex-1 flex flex-col justify-center border-t border-[var(--border-subtle)] px-6 py-5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-3">Experience level</div>
                    <div className="flex flex-wrap gap-2">
                      {EXPERIENCE_LEVELS.map(l => (
                        <button key={l.value} onClick={() => setExpLevel(l.value)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all"
                          style={expLevel === l.value
                            ? { background: "rgba(192,88,0,0.10)", borderColor: "rgba(192,88,0,0.50)", color: "var(--text-primary)" }
                            : { background: "var(--bg-elevated)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                        >
                          <span>{l.icon}</span>
                          <span>{l.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] mb-3">Interview format</div>
                    <div className="flex flex-wrap gap-2">
                      {INTERVIEW_TYPES.map(t => (
                        <button key={t.value} onClick={() => setIType(t.value)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold border transition-all"
                          style={iType === t.value
                            ? { background: "rgba(192,88,0,0.10)", borderColor: "rgba(192,88,0,0.50)", color: "var(--text-primary)" }
                            : { background: "var(--bg-elevated)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}
                        >
                          <span>{t.icon}</span>
                          <span>{t.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* ④ Bottom action bar: Q count + Voice + CTA */}
              <div className="px-6 py-4 flex flex-wrap items-center gap-4 flex-shrink-0 border-t border-[var(--border-subtle)]" style={{ background: "var(--bg-elevated)" }}>

                {/* Q count */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] whitespace-nowrap">Questions</span>
                  <input type="range" min={3} max={10} step={1} value={numQ}
                    onChange={e => setNumQ(Number(e.target.value))}
                    className="w-20 accent-[#C05800]" />
                  <span className="text-[12px] font-bold tabular-nums whitespace-nowrap" style={{ color: "#C05800" }}>
                    {numQ} <span className="text-[10px] font-normal text-[var(--text-muted)]">~{numQ * 5}m</span>
                  </span>
                </div>

                <div className="h-4 w-px bg-[var(--border-subtle)] flex-shrink-0 hidden sm:block" />

                {/* Voice */}
                <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
                  <span className="text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)] whitespace-nowrap flex-shrink-0">Voice</span>

                  {/* Free / ElevenLabs toggle */}
                  <div className="flex rounded-md overflow-hidden border text-[10px] flex-shrink-0 transition-colors"
                    style={{ borderColor: useElevenLabs ? "rgba(139,92,246,0.45)" : "var(--border-subtle)" }}>
                    <button onClick={() => setUseElevenLabs(false)}
                      className="px-2.5 py-1 font-bold transition-all"
                      style={!useElevenLabs ? { background: "#C05800", color: "white" } : { color: "var(--text-muted)" }}>
                      Free
                    </button>
                    <button onClick={() => { if (!hasVoiceCredits) { setShowBuyVoice(true); return; } setUseElevenLabs(true); }}
                      className="flex items-center gap-1 px-2.5 py-1 font-bold transition-all"
                      style={useElevenLabs
                        ? { background: "linear-gradient(135deg,#7c3aed,#4f46e5)", color: "white" }
                        : { color: "var(--text-muted)" }}>
                      <ElevenLabsLogo className="w-3 h-2.5 flex-shrink-0" />
                      {!hasVoiceCredits && mounted ? "₹149" : "HD"}
                    </button>
                  </div>

                  {/* Browser voice chips */}
                  {!useElevenLabs && (
                    <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                      {browserVoices.map(v => (
                        <button key={v.name}
                          onClick={() => setSelectedBrowserVoice(v.name)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-semibold whitespace-nowrap transition-all flex-shrink-0"
                          style={selectedBrowserVoice === v.name
                            ? { background: "rgba(192,88,0,0.10)", borderColor: "rgba(192,88,0,0.50)", color: "var(--text-primary)" }
                            : { background: "var(--bg-surface)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
                          {v.name.split(" ")[0]}
                          <span onClick={e => { e.stopPropagation(); previewVoice(v.name, true); }}
                            className="text-[9px] opacity-60 hover:opacity-100 transition-opacity ml-0.5">
                            {previewing === v.name ? "■" : "▶"}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* ElevenLabs HD voice chips */}
                  {useElevenLabs && ttsAvail && (
                    <div className="flex items-center gap-2 min-w-0 overflow-hidden">
                      <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
                        {elVoices.map(v => (
                          <button key={v.id}
                            onClick={() => setSelectedElVoice(v.id)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-full border text-[11px] font-semibold whitespace-nowrap transition-all flex-shrink-0"
                            style={selectedElVoice === v.id
                              ? { background: "rgba(124,58,237,0.15)", borderColor: "rgba(124,58,237,0.6)", color: "white" }
                              : { background: "var(--bg-surface)", borderColor: "var(--border-subtle)", color: "var(--text-muted)" }}>
                            {v.name}
                            <span onClick={e => { e.stopPropagation(); previewVoice(v.id); }}
                              className="text-[9px] opacity-60 hover:opacity-100 transition-opacity ml-0.5">
                              {previewing === v.id ? "■" : "▶"}
                            </span>
                          </button>
                        ))}
                      </div>
                      <span className="flex items-center gap-1 pl-2 flex-shrink-0 border-l border-[var(--border-subtle)]">
                        <span className="text-[9px] text-[var(--text-muted)] whitespace-nowrap">powered by</span>
                        <ElevenLabsLogo className="w-3 h-2.5 flex-shrink-0" style={{ color: "#a78bfa" }} />
                        <span className="text-[9px] font-bold whitespace-nowrap" style={{ color: "#a78bfa" }}>ElevenLabs</span>
                      </span>
                    </div>
                  )}

                  {useElevenLabs && !ttsAvail && (
                    <span className="text-[11px] text-[var(--text-muted)]">Add <code style={{ color: "#C05800" }}>ELEVENLABS_API_KEY</code> to backend</span>
                  )}
                </div>

                {/* Credit count */}
                {mounted && !isPro && (
                  <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border"
                    style={{
                      background: (interviewCreditsLeft ?? 0) > 0 ? "rgba(192,88,0,0.08)" : "rgba(239,68,68,0.08)",
                      borderColor: (interviewCreditsLeft ?? 0) > 0 ? "rgba(192,88,0,0.3)" : "rgba(239,68,68,0.3)",
                    }}>
                    <span className="text-[11px] font-bold" style={{ color: (interviewCreditsLeft ?? 0) > 0 ? "#C05800" : "#ef4444" }}>
                      {interviewCreditsLeft ?? "–"}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] whitespace-nowrap">session{(interviewCreditsLeft ?? 0) !== 1 ? "s" : ""} left</span>
                  </div>
                )}

                {/* CTA */}
                <button onClick={startInterview} disabled={!role.trim()}
                  className="relative overflow-hidden flex items-center gap-2 px-6 py-3 rounded-xl text-white font-bold text-[13px] transition-all disabled:opacity-35 disabled:cursor-not-allowed group flex-shrink-0"
                  style={{ background: role.trim() ? "linear-gradient(135deg,#C05800 0%,#713600 100%)" : "var(--bg-surface)", boxShadow: role.trim() ? "0 4px 20px rgba(192,88,0,0.4)" : "none" }}
                >
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{ background: "linear-gradient(105deg,transparent 40%,rgba(255,255,255,0.1) 50%,transparent 60%)" }} />
                  {mounted && !canStartInterview
                    ? <><Lock className="w-3.5 h-3.5" /> Buy · ₹149</>
                    : <><Maximize2 className="w-3.5 h-3.5" /> Start Interview <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" /></>
                  }
                </button>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Analyzing ── */}
        {phase === "analyzing" && (
          <AnalysisScreen
            key="analyzing"
            company={company}
            Logo={selectedCompany.Logo}
            apiReady={analysisReady}
            onDone={applySessionData}
          />
        )}

        {/* ── Session ── */}
        {phase === "session" && questions.length > 0 && (
          <motion.div
            ref={sessionRef}
            key="session"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-[var(--bg-base)] flex flex-col overflow-hidden"
          >
            {/* Top bar */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] flex-shrink-0 bg-[var(--bg-surface)]/80 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                {/* Company logo in session bar */}
                {(() => {
                  const co = COMPANIES.find(c => c.name === (companyInfo?.name ?? company));
                  if (!co) return (
                    <div className="w-9 h-9 rounded-xl bg-[var(--accent-muted)] border border-[var(--accent-primary)]/30 flex items-center justify-center">
                      <Brain className="w-5 h-5 text-[var(--accent-primary)]" />
                    </div>
                  );
                  const Logo = co.Logo;
                  return (
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center border overflow-hidden ${co.bg} ${co.border} ${co.logoColor ?? ""}`}>
                      <Logo />
                    </div>
                  );
                })()}
                <div>
                  <div className="text-[13px] font-semibold text-[var(--text-primary)]">
                    {companyInfo?.name ?? "AI"} Interview
                  </div>
                  <div className="text-[10px] text-[var(--text-muted)]">
                    {pendingFollowUp ? `Q${qIndex + 1} Follow-up` : `Question ${qIndex + 1} of ${questions.length}`}
                  </div>
                </div>
              </div>

              {/* Progress dots */}
              <div className="flex items-center gap-1.5">
                {questions.map((_, i) => (
                  <div key={i} className={`h-1.5 rounded-full transition-all ${
                    i < qIndex ? "w-4 bg-emerald-400"
                      : i === qIndex ? "w-4 bg-[var(--accent-primary)]"
                      : "w-1.5 bg-[var(--border-default)]"
                  }`} />
                ))}
              </div>

              <div className="flex items-center gap-2">
                {resumeLoaded && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-400">
                    ✓ Resume
                  </span>
                )}
                <button
                  onClick={() => allFeedback.length < questions.length ? setShowExitConfirm(true) : exitSession()}
                  className="p-2 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">

              {/* AI side */}
              <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-10 gap-5 border-b lg:border-b-0 lg:border-r border-[var(--border-subtle)]">
                {/* AI avatar */}
                <div className={`relative w-20 h-20 rounded-2xl border-2 flex items-center justify-center transition-all ${
                  aiSpeaking
                    ? "border-[var(--accent-primary)] bg-[var(--accent-muted)] shadow-[0_0_40px_var(--accent-primary)33]"
                    : "border-[var(--border-default)] bg-[var(--bg-elevated)]"
                }`}>
                  <Brain className="w-9 h-9 text-[var(--accent-primary)]" />
                  {aiSpeaking && (
                    <span className="absolute -bottom-1.5 -right-1.5 w-5 h-5 rounded-full bg-[var(--accent-primary)] flex items-center justify-center shadow">
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                    </span>
                  )}
                </div>

                <div className="text-center">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-1">
                    {companyInfo?.name ?? "AI"} Interviewer
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)]">
                    {aiSpeaking ? "Speaking…" : sessionMode === "thinking" ? "Waiting for you to think" : "Listening"}
                  </div>
                </div>

                <div className="w-full max-w-xs">
                  <FrequencyBars analyser={aiAnalyserRef.current} active={aiSpeaking} color="#6366f1" bars={40} height={56} />
                </div>

                <div className="w-full max-w-lg bg-[var(--bg-elevated)] rounded-2xl p-5 border border-[var(--border-default)]">
                  <div className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border mb-3 ${
                    currentType === "technical"
                      ? "text-blue-400 bg-blue-400/10 border-blue-400/20"
                      : currentType === "situational"
                        ? "text-[#d4aa30] bg-[#d4aa30]/10 border-[#d4aa30]/20"
                        : "text-amber-400 bg-amber-400/10 border-amber-400/20"
                  }`}>
                    {pendingFollowUp ? "↳ Follow-up" : currentType}
                  </div>
                  <p className="text-[16px] text-[var(--text-primary)] leading-relaxed font-medium">
                    {currentQuestion}
                  </p>
                </div>
              </div>

              {/* User side */}
              <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-10 gap-5">
                <AnimatePresence mode="wait">

                  {sessionMode === "thinking" && (
                    <motion.div key="thinking" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-5 w-full max-w-xs text-center">
                      <div className="relative w-24 h-24">
                        <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                          <circle cx="50" cy="50" r="44" fill="none" stroke="var(--border-default)" strokeWidth="6" />
                          <motion.circle cx="50" cy="50" r="44" fill="none"
                            stroke="var(--accent-primary)" strokeWidth="6"
                            strokeLinecap="round"
                            strokeDasharray={`${2 * Math.PI * 44}`}
                            animate={{ strokeDashoffset: 2 * Math.PI * 44 * (1 - thinkSecs / THINK_SECONDS) }}
                            transition={{ duration: 0.5 }}
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <Clock className="w-4 h-4 text-[var(--text-muted)] mb-0.5" />
                          <span className="text-2xl font-black tabular-nums text-[var(--text-primary)]">{thinkSecs}</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-[15px] font-semibold text-[var(--text-primary)]">Think Time</div>
                        <div className="text-[12px] text-[var(--text-muted)] mt-0.5">Mic opens automatically when timer hits 0</div>
                      </div>
                      <button onClick={skipThinkTime}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-secondary)] hover:border-[var(--accent-primary)]/40 transition-colors">
                        <Mic className="w-3.5 h-3.5" /> Start Answering Now
                      </button>
                    </motion.div>
                  )}

                  {sessionMode === "recording" && (
                    <motion.div key="recording" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-5 w-full">
                      <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-red-400/20 animate-ping scale-150" />
                        <div className="w-16 h-16 rounded-full bg-red-400/15 border-2 border-red-400/60 flex items-center justify-center relative">
                          <Mic className="w-7 h-7 text-red-400" />
                        </div>
                      </div>
                      <div className="w-full max-w-xs">
                        <FrequencyBars analyser={micAnalyserRef.current} active={micActive} color="#f43f5e" bars={40} height={64} />
                      </div>
                      <div className="text-center">
                        <div className="text-[14px] font-semibold text-[var(--text-primary)]">Recording…</div>
                        <div className="text-[11px] text-[var(--text-muted)] mt-0.5">Auto-submits after 2.5s of silence</div>
                      </div>
                      {answer && (
                        <div className="w-full max-w-sm bg-[var(--bg-elevated)] rounded-xl p-3 border border-[var(--border-subtle)]">
                          <p className="text-[12px] text-[var(--text-secondary)] italic leading-relaxed">{answer}</p>
                        </div>
                      )}
                      <button onClick={stopRecordingAndSubmit}
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors">
                        <ChevronRight className="w-4 h-4" /> Submit Answer
                      </button>
                    </motion.div>
                  )}

                  {sessionMode === "evaluating" && (
                    <motion.div key="evaluating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-4">
                      <Loader2 className="w-10 h-10 animate-spin text-[var(--accent-primary)]" />
                      <div className="text-[14px] text-[var(--text-secondary)]">Evaluating your answer…</div>
                    </motion.div>
                  )}

                  {sessionMode === "feedback" && feedback && (
                    <motion.div key="feedback" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="w-full max-w-sm space-y-3">
                      <div className="flex items-center gap-3">
                        <div className="text-3xl font-black tabular-nums"
                          style={{ color: feedback.score >= 7 ? "#10b981" : feedback.score >= 5 ? "#f59e0b" : "#ef4444" }}>
                          {feedback.score}/10
                        </div>
                        <div className="flex-1 h-2.5 rounded-full bg-[var(--bg-overlay)] overflow-hidden">
                          <motion.div className="h-full rounded-full"
                            style={{ background: feedback.score >= 7 ? "#10b981" : feedback.score >= 5 ? "#f59e0b" : "#ef4444" }}
                            initial={{ width: 0 }}
                            animate={{ width: `${(feedback.score / 10) * 100}%` }}
                            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                          />
                        </div>
                        <TrendingUp className="w-4 h-4 text-[var(--text-muted)]" />
                      </div>
                      <p className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{feedback.overall_feedback}</p>
                      <div className="grid grid-cols-2 gap-2">
                        {feedback.strengths.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400 mb-1">
                              <CheckCircle2 className="w-3 h-3" /> Strengths
                            </div>
                            {feedback.strengths.slice(0, 2).map((s, i) => (
                              <div key={i} className="text-[11px] text-[var(--text-muted)] flex gap-1.5">· {s}</div>
                            ))}
                          </div>
                        )}
                        {feedback.improvements.length > 0 && (
                          <div>
                            <div className="flex items-center gap-1 text-[10px] font-semibold text-amber-400 mb-1">
                              <AlertCircle className="w-3 h-3" /> Improve
                            </div>
                            {feedback.improvements.slice(0, 2).map((s, i) => (
                              <div key={i} className="text-[11px] text-[var(--text-muted)] flex gap-1.5">· {s}</div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button onClick={() => advanceQuestion(feedback)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors">
                        {qIndex + 1 >= questions.length ? "See Results" : "Next Question"}
                        <span className="text-[11px] opacity-70">({advanceSecs}s)</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  )}

                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── Results ── */}
        {phase === "results" && (
          <motion.div key="results" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-5">

            {/* ── Score hero ── */}
            <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden relative">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#C05800] via-[#d4aa30] to-[#7ab840]" />
              <div className="flex flex-col sm:flex-row items-center gap-6">
                {/* Circular progress */}
                <div className="relative flex-shrink-0 w-28 h-28">
                  <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border-default)" strokeWidth="8"/>
                    <motion.circle
                      cx="50" cy="50" r="42" fill="none"
                      stroke={overallScore >= 7 ? "#10b981" : overallScore >= 5 ? "#f59e0b" : "#ef4444"}
                      strokeWidth="8" strokeLinecap="round"
                      strokeDasharray={`${2 * Math.PI * 42}`}
                      initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                      animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - (report?.interview_pct ?? overallScore * 10) / 100) }}
                      transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <motion.span
                      className="text-2xl font-black tabular-nums leading-none"
                      style={{ color: overallScore >= 7 ? "#10b981" : overallScore >= 5 ? "#f59e0b" : "#ef4444" }}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: 0.5 }}
                    >
                      {reportLoading ? "…" : `${report?.interview_pct ?? overallScore * 10}%`}
                    </motion.span>
                    <span className="text-[10px] text-[var(--text-muted)] mt-0.5">Interview</span>
                  </div>
                </div>

                {/* Text side */}
                <div className="flex-1 text-center sm:text-left">
                  <div className="text-[11px] font-semibold text-[var(--text-muted)] uppercase tracking-widest mb-1">
                    Interview Complete{companyInfo && ` · ${companyInfo.name}`}
                  </div>
                  <div className="text-2xl font-bold text-[var(--text-primary)] mb-2">
                    {overallScore}/10 avg · {allFeedback.length} question{allFeedback.length !== 1 ? "s" : ""}
                  </div>
                  {reportLoading ? (
                    <div className="flex items-center gap-2 text-[13px] text-[var(--text-muted)]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> Generating your report…
                    </div>
                  ) : (
                    <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                      {report?.verdict ?? (
                        overallScore >= 8 ? "Outstanding — you're interview-ready!" :
                        overallScore >= 6 ? "Good performance with clear areas to polish." :
                        overallScore >= 4 ? "Fair start — keep practising the weaker areas." :
                        "Needs more practice — keep going!"
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Score bar row */}
              <div className="mt-5 flex items-center gap-3">
                <span className="text-[11px] text-[var(--text-muted)] w-24 flex-shrink-0">Overall score</span>
                <div className="flex-1 h-2 rounded-full bg-[var(--bg-overlay)] overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: overallScore >= 7 ? "#10b981" : overallScore >= 5 ? "#f59e0b" : "#ef4444" }}
                    initial={{ width: 0 }}
                    animate={{ width: `${(overallScore / 10) * 100}%` }}
                    transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.4 }}
                  />
                </div>
                <span className="text-[11px] font-semibold tabular-nums text-[var(--text-primary)] w-8 text-right">{overallScore}/10</span>
              </div>
            </div>

            {/* ── Top strengths ── */}
            {report?.top_strengths && report.top_strengths.length > 0 && (
              <div className="p-4 rounded-xl border border-emerald-400/20 bg-emerald-400/5">
                <div className="flex items-center gap-2 mb-3">
                  <Award className="w-4 h-4 text-emerald-400" />
                  <span className="text-[13px] font-semibold text-emerald-400">What you did well</span>
                </div>
                <div className="space-y-1.5">
                  {report.top_strengths.map((s, i) => (
                    <div key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />
                      {s}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Question-by-question breakdown ── */}
            <div className="space-y-3">
              <h3 className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <ListChecks className="w-4 h-4 text-[var(--accent-primary)]" />
                Question Breakdown
              </h3>
              {questions.map((q, i) => {
                const f = allFeedback[i];
                const ans = allAnswers[i];
                if (!f) return null;
                return (
                  <QuestionCard key={i} index={i} question={q} feedback={f} answer={ans} />
                );
              })}
            </div>

            {/* ── AI Improvement Plan ── */}
            {(reportLoading || (report?.improvement_plan && report.improvement_plan.length > 0)) && (
              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-subtle)]">
                  <Target className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span className="text-[13px] font-semibold text-[var(--text-primary)]">AI Improvement Plan</span>
                  <span className="ml-auto text-[10px] text-[var(--text-muted)] italic">personalised from your resume + answers</span>
                </div>
                {reportLoading ? (
                  <div className="flex items-center gap-2 px-4 py-5 text-[13px] text-[var(--text-muted)]">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analysing your answers against your resume…
                  </div>
                ) : (
                  <div className="divide-y divide-[var(--border-subtle)]">
                    {report!.improvement_plan.map((item, i) => (
                      <div key={i} className="px-4 py-3 flex items-start gap-3">
                        <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${
                          item.priority === "high" ? "bg-red-400" :
                          item.priority === "medium" ? "bg-amber-400" : "bg-emerald-400"
                        }`} />
                        <div>
                          <div className="text-[12px] font-semibold text-[var(--text-primary)] mb-0.5">{item.area}</div>
                          <div className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{item.tip}</div>
                        </div>
                        <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${
                          item.priority === "high" ? "text-red-400 bg-red-400/10" :
                          item.priority === "medium" ? "text-amber-400 bg-amber-400/10" : "text-emerald-400 bg-emerald-400/10"
                        }`}>{item.priority}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── Skill gaps ── */}
            {report?.skill_gaps && report.skill_gaps.length > 0 && (
              <div className="p-4 rounded-xl border border-amber-400/20 bg-amber-400/5">
                <div className="flex items-center gap-2 mb-3">
                  <BookOpen className="w-4 h-4 text-amber-400" />
                  <span className="text-[13px] font-semibold text-amber-400">Skill gaps to close</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {report.skill_gaps.map((g, i) => (
                    <span key={i} className="text-[11px] px-2.5 py-1 rounded-full border border-amber-400/25 bg-amber-400/10 text-amber-300">{g}</span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Next steps ── */}
            {report?.next_steps && report.next_steps.length > 0 && (
              <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                <div className="flex items-center gap-2 mb-3">
                  <ArrowRight className="w-4 h-4 text-[var(--accent-primary)]" />
                  <span className="text-[13px] font-semibold text-[var(--text-primary)]">Next steps</span>
                </div>
                <ol className="space-y-1.5">
                  {report.next_steps.map((s, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                      <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[var(--accent-muted)] text-[var(--accent-hover)] text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* ── Actions ── */}
            <div className="flex gap-3">
              <button onClick={() => setPhase("setup")}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--border-default)] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
                <RotateCcw className="w-3.5 h-3.5" /> New Interview
              </button>
              <button onClick={() => { setQIndex(0); setAllFeedback([]); setAllAnswers([]); setReport(null); setFeedback(null); setAnswer(""); setPendingFollowUp(null); setPhase("session"); if (questions[0]?.question) speakText(questions[0].question); setTimeout(() => { try { document.documentElement.requestFullscreen(); } catch {} }, 100); }}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#C05800] to-[#713600] hover:from-[#D06818] hover:to-[#C05800] text-white text-[13px] font-semibold transition-all">
                <RotateCcw className="w-3.5 h-3.5" /> Retry Same Questions
              </button>
            </div>
          </motion.div>
        )}

        {/* ── History ── */}
        {phase === "history" && (
          <motion.div key="history" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-4">

            {/* Detail view — a past session's full report */}
            {selectedSession ? (
              <div className="space-y-5">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSelectedSession(null)}
                    className="flex items-center gap-1.5 text-[12px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <ChevronDown className="w-3.5 h-3.5 rotate-90" /> Back to history
                  </button>
                  <span className="text-[var(--border-default)]">·</span>
                  <span className="text-[12px] text-[var(--text-muted)]">
                    {new Date(selectedSession.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                    {" · "}{selectedSession.role}
                    {selectedSession.company !== "General" ? ` · ${selectedSession.company}` : ""}
                  </span>
                </div>

                {/* Score hero */}
                <div className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden relative">
                  <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#C05800] via-[#d4aa30] to-[#7ab840]" />
                  <div className="flex flex-col sm:flex-row items-center gap-5">
                    {/* Circle */}
                    <div className="relative flex-shrink-0 w-24 h-24">
                      <svg className="w-24 h-24 -rotate-90" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--border-default)" strokeWidth="8"/>
                        {(() => {
                          const pct = selectedSession.interview_pct ?? Math.round((selectedSession.overall_score ?? 5) * 10);
                          const color = pct >= 70 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
                          return (
                            <motion.circle cx="50" cy="50" r="42" fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
                              strokeDasharray={`${2 * Math.PI * 42}`}
                              initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
                              animate={{ strokeDashoffset: 2 * Math.PI * 42 * (1 - pct / 100) }}
                              transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
                            />
                          );
                        })()}
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        {(() => {
                          const pct = selectedSession.interview_pct ?? Math.round((selectedSession.overall_score ?? 5) * 10);
                          return (
                            <span className="text-xl font-black tabular-nums" style={{ color: pct >= 70 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444" }}>
                              {pct}%
                            </span>
                          );
                        })()}
                        <span className="text-[9px] text-[var(--text-muted)]">Interview</span>
                      </div>
                    </div>
                    <div className="flex-1 text-center sm:text-left">
                      <div className="text-[11px] text-[var(--text-muted)] uppercase tracking-widest mb-1">Past Session</div>
                      <div className="text-xl font-bold text-[var(--text-primary)] mb-1.5">
                        {selectedSession.overall_score?.toFixed(1) ?? "—"}/10 avg · {selectedSession.questions?.length ?? 0} questions
                      </div>
                      {selectedSession.report?.verdict && (
                        <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">{selectedSession.report.verdict}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Top strengths */}
                {selectedSession.report?.top_strengths && selectedSession.report.top_strengths.length > 0 && (
                  <div className="p-4 rounded-xl border border-emerald-400/20 bg-emerald-400/5">
                    <div className="flex items-center gap-2 mb-3">
                      <Award className="w-4 h-4 text-emerald-400" />
                      <span className="text-[13px] font-semibold text-emerald-400">What you did well</span>
                    </div>
                    {selectedSession.report.top_strengths.map((s, i) => (
                      <div key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)] mb-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 mt-0.5 flex-shrink-0" />{s}
                      </div>
                    ))}
                  </div>
                )}

                {/* Q&A breakdown */}
                {selectedSession.questions && selectedSession.questions.length > 0 && (
                  <div className="space-y-3">
                    <h3 className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
                      <ListChecks className="w-4 h-4 text-[var(--accent-primary)]" /> Question Breakdown
                    </h3>
                    {selectedSession.questions.map((q, i) => {
                      const f = selectedSession.feedback?.[i];
                      const ans = selectedSession.answers?.[i];
                      if (!f) return null;
                      return <QuestionCard key={i} index={i} question={q} feedback={f} answer={ans ?? ""} />;
                    })}
                  </div>
                )}

                {/* Improvement plan */}
                {selectedSession.report?.improvement_plan && selectedSession.report.improvement_plan.length > 0 && (
                  <div className="rounded-xl border border-[var(--border-default)] bg-[var(--bg-surface)] overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-subtle)]">
                      <Target className="w-4 h-4 text-[var(--accent-primary)]" />
                      <span className="text-[13px] font-semibold text-[var(--text-primary)]">AI Improvement Plan</span>
                    </div>
                    <div className="divide-y divide-[var(--border-subtle)]">
                      {selectedSession.report.improvement_plan.map((item, i) => (
                        <div key={i} className="px-4 py-3 flex items-start gap-3">
                          <div className={`mt-0.5 w-2 h-2 rounded-full flex-shrink-0 ${item.priority === "high" ? "bg-red-400" : item.priority === "medium" ? "bg-amber-400" : "bg-emerald-400"}`} />
                          <div>
                            <div className="text-[12px] font-semibold text-[var(--text-primary)] mb-0.5">{item.area}</div>
                            <div className="text-[12px] text-[var(--text-secondary)] leading-relaxed">{item.tip}</div>
                          </div>
                          <span className={`ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 ${item.priority === "high" ? "text-red-400 bg-red-400/10" : item.priority === "medium" ? "text-amber-400 bg-amber-400/10" : "text-emerald-400 bg-emerald-400/10"}`}>
                            {item.priority}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Skill gaps */}
                {selectedSession.report?.skill_gaps && selectedSession.report.skill_gaps.length > 0 && (
                  <div className="p-4 rounded-xl border border-amber-400/20 bg-amber-400/5">
                    <div className="flex items-center gap-2 mb-3">
                      <BookOpen className="w-4 h-4 text-amber-400" />
                      <span className="text-[13px] font-semibold text-amber-400">Skill gaps to close</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedSession.report.skill_gaps.map((g, i) => (
                        <span key={i} className="text-[11px] px-2.5 py-1 rounded-full border border-amber-400/25 bg-amber-400/10 text-amber-300">{g}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Next steps */}
                {selectedSession.report?.next_steps && selectedSession.report.next_steps.length > 0 && (
                  <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                    <div className="flex items-center gap-2 mb-3">
                      <ArrowRight className="w-4 h-4 text-[var(--accent-primary)]" />
                      <span className="text-[13px] font-semibold text-[var(--text-primary)]">Next steps</span>
                    </div>
                    <ol className="space-y-1.5">
                      {selectedSession.report.next_steps.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-[12px] text-[var(--text-secondary)]">
                          <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[var(--accent-muted)] text-[var(--accent-hover)] text-[10px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>{s}
                        </li>
                      ))}
                    </ol>
                  </div>
                )}

                {/* Delete button */}
                <div className="flex justify-end">
                  <button
                    onClick={() => { deleteSession(selectedSession.id); setSelectedSession(null); }}
                    className="text-[12px] text-red-400/60 hover:text-red-400 transition-colors"
                  >
                    Delete this session
                  </button>
                </div>
              </div>
            ) : (

              /* Session list */
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Past Interviews</h2>
                  {historyLoading && <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />}
                </div>

                {sessionLoading && (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-6 h-6 animate-spin text-[var(--accent-primary)]" />
                  </div>
                )}

                {!historyLoading && !sessionLoading && historySessions?.length === 0 && (
                  <div className="text-center py-16 text-[var(--text-muted)]">
                    <Clock className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <div className="text-[14px] font-medium mb-1">No past interviews yet</div>
                    <div className="text-[12px]">Complete an interview to see your history here.</div>
                  </div>
                )}

                {(historySessions ?? []).map((session) => {
                  const pct = session.interview_pct ?? Math.round((session.overall_score ?? 5) * 10);
                  const pctColor = pct >= 70 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
                  const date = new Date(session.created_at);
                  return (
                    <motion.button
                      key={session.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => loadSession(session.id)}
                      className="w-full text-left p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] hover:border-[var(--border-default)] hover:bg-[var(--bg-elevated)] transition-all group"
                    >
                      <div className="flex items-center gap-4">
                        {/* Score circle */}
                        <div className="relative flex-shrink-0 w-12 h-12">
                          <svg className="w-12 h-12 -rotate-90" viewBox="0 0 100 100">
                            <circle cx="50" cy="50" r="40" fill="none" stroke="var(--border-default)" strokeWidth="10"/>
                            <circle cx="50" cy="50" r="40" fill="none" stroke={pctColor} strokeWidth="10" strokeLinecap="round"
                              strokeDasharray={`${2 * Math.PI * 40}`}
                              strokeDashoffset={2 * Math.PI * 40 * (1 - pct / 100)}
                            />
                          </svg>
                          <div className="absolute inset-0 flex items-center justify-center">
                            <span className="text-[11px] font-black tabular-nums" style={{ color: pctColor }}>{pct}%</span>
                          </div>
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{session.role}</span>
                            {session.company !== "General" && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-subtle)] text-[var(--text-muted)] flex-shrink-0">
                                {session.company}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)]">
                            {session.num_questions} question{session.num_questions !== 1 ? "s" : ""} · {session.overall_score?.toFixed(1) ?? "—"}/10 avg
                          </div>
                          {session.verdict && (
                            <div className="text-[11px] text-[var(--text-muted)] mt-1 line-clamp-1 italic">{session.verdict}</div>
                          )}
                        </div>

                        {/* Date + arrow */}
                        <div className="flex-shrink-0 text-right">
                          <div className="text-[11px] text-[var(--text-muted)] mb-1">
                            {date.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                          </div>
                          <ChevronRight className="w-4 h-4 text-[var(--text-muted)] group-hover:text-[var(--text-secondary)] transition-colors ml-auto" />
                        </div>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>

      {/* Exit confirmation modal */}
      <AnimatePresence>
        {showExitConfirm && (
          <motion.div
            key="exit-confirm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--bg-surface)] rounded-2xl border border-[var(--border-default)] p-6 max-w-sm w-full mx-4 space-y-4"
            >
              <div>
                <h3 className="text-[16px] font-bold text-[var(--text-primary)] mb-1">Exit Interview?</h3>
                <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                  You've answered <span className="font-semibold text-[var(--text-primary)]">{allFeedback.length} of {questions.length}</span> questions.
                  Your progress will be saved so you can resume later.
                  {useElevenLabs && ttsSessionRef.current && (
                    <span className="block mt-1 text-emerald-400 text-[12px]">
                      ✓ Your ElevenLabs credit will be refunded.
                    </span>
                  )}
                </p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setShowExitConfirm(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[var(--accent-primary)]/40 bg-[var(--accent-muted)] text-[13px] font-semibold text-[var(--accent-hover)] hover:bg-[var(--accent-subtle)] transition-colors"
                >
                  Resume Interview
                </button>
                <button
                  onClick={handleConfirmedExit}
                  className="flex-1 py-2.5 rounded-xl border border-red-500/30 bg-red-500/10 text-[13px] font-semibold text-red-400 hover:bg-red-500/15 transition-colors"
                >
                  Exit & Save
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Voice session purchase — ₹149 (ElevenLabs upgrade) */}
      <AnimatePresence>
        {showBuyVoice && (
          <CheckoutModal
            plan="interview_voice"
            onClose={() => setShowBuyVoice(false)}
            onSuccess={() => { setShowBuyVoice(false); refetchStatus(); setUseElevenLabs(true); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
