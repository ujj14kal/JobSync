"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient } from "@/lib/api/client";
import {
  Mic, MicOff, ChevronRight, CheckCircle2, AlertCircle,
  RotateCcw, Sparkles, Brain, Loader2, ArrowRight,
  Building2, FileText, User, Clock, ChevronDown, TrendingUp,
  Maximize2, X,
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

type Phase = "setup" | "analyzing" | "session" | "results";
type SessionMode = "thinking" | "recording" | "evaluating" | "feedback";

// ── Constants ────────────────────────────────────────────────────────────────

const ROLES = [
  "Software Engineer", "Product Manager", "Data Scientist", "ML Engineer",
  "Frontend Engineer", "Backend Engineer", "Full Stack Engineer", "DevOps Engineer",
  "UX Designer", "Business Analyst", "Data Analyst", "Quantitative Analyst",
  "Investment Analyst", "Solutions Architect", "Marketing Manager",
];

const COMPANIES = [
  { name: "Google",        emoji: "🔵" },
  { name: "Meta",          emoji: "🟣" },
  { name: "Amazon",        emoji: "🟠" },
  { name: "BlackRock",     emoji: "⚫" },
  { name: "Microsoft",     emoji: "🟢" },
  { name: "Apple",         emoji: "⚪" },
  { name: "Netflix",       emoji: "🔴" },
  { name: "Goldman Sachs", emoji: "🟡" },
  { name: "Stripe",        emoji: "🔷" },
  { name: "Uber",          emoji: "⬛" },
  { name: "Airbnb",        emoji: "🩷" },
  { name: "OpenAI",        emoji: "🤍" },
  { name: "General",       emoji: "🌐" },
];

const EXPERIENCE_LEVELS = [
  { value: "student", label: "Student / Intern" },
  { value: "entry",   label: "Entry (0–2 yrs)" },
  { value: "mid",     label: "Mid (2–5 yrs)" },
  { value: "senior",  label: "Senior (5+ yrs)" },
];

const INTERVIEW_TYPES = [
  { value: "behavioral", label: "Behavioural", desc: "STAR-format past experience" },
  { value: "technical",  label: "Technical",   desc: "Problem-solving & depth" },
  { value: "mixed",      label: "Mixed",       desc: "Both behavioural & technical" },
];

const ANALYSIS_STEPS = [
  { label: "Scanning your active resume",       icon: FileText },
  { label: "Loading company interview profile", icon: Building2 },
  { label: "Analysing your background",         icon: User },
  { label: "Generating personalised questions", icon: Sparkles },
];

const THINK_SECONDS  = 60;   // thinking time before mic opens
const SILENCE_MS     = 2500; // ms of silence before auto-submit
const SILENCE_RMS    = 0.013; // RMS threshold for "silence"
const FEEDBACK_AUTO_ADVANCE = 7; // seconds before auto-next

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
      // flat idle line
      ctx.fillStyle = color + "30";
      ctx.fillRect(0, canvas.height / 2 - 1, canvas.width, 2);
      return;
    }

    analyser.fftSize = bars * 4;
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

// ── Analysis loading ──────────────────────────────────────────────────────────

function AnalysisScreen({ company }: { company: string }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const ts = ANALYSIS_STEPS.map((_, i) => setTimeout(() => setStep(i + 1), (i + 1) * 900));
    return () => ts.forEach(clearTimeout);
  }, []);

  return (
    <motion.div
      key="analyzing"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className="flex flex-col items-center justify-center py-16 space-y-8"
    >
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-[var(--accent-muted)] border border-[var(--accent-primary)]/30 flex items-center justify-center mx-auto mb-4">
          <Brain className="w-8 h-8 text-[var(--accent-primary)]" />
        </div>
        <h2 className="text-[18px] font-bold text-[var(--text-primary)] mb-1">Preparing Your Interview</h2>
        <p className="text-[13px] text-[var(--text-secondary)]">
          Tailoring questions for <span className="font-medium text-[var(--text-primary)]">{company}</span>
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
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
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

// ── Main Page ────────────────────────────────────────────────────────────────

export default function InterviewPage() {
  // Phase
  const [phase,       setPhase]       = useState<Phase>("setup");
  const [sessionMode, setSessionMode] = useState<SessionMode>("thinking");

  // TTS + voice
  const [ttsAvail,    setTtsAvail]    = useState(false);
  const [aiSpeaking,  setAiSpeaking]  = useState(false);
  const [selectedVoice, setSelectedVoice] = useState("EXAVITQu4vr4xnSDxMaL"); // Sarah default
  const [previewing,  setPreviewing]  = useState<string | null>(null);
  const [voices, setVoices] = useState<{ id: string; name: string; desc: string }[]>([]);

  // Setup fields
  const [role,      setRole]      = useState("Software Engineer");
  const [company,   setCompany]   = useState("General");
  const [expLevel,  setExpLevel]  = useState("entry");
  const [iType,     setIType]     = useState("mixed");
  const [numQ,      setNumQ]      = useState(5);
  const [showAllCo, setShowAllCo] = useState(false);

  // Session
  const [questions,    setQuestions]    = useState<Question[]>([]);
  const [qIndex,       setQIndex]       = useState(0);
  const [answer,       setAnswer]       = useState("");
  const [feedback,     setFeedback]     = useState<Feedback | null>(null);
  const [allFeedback,  setAllFeedback]  = useState<Feedback[]>([]);
  const [companyInfo,  setCompanyInfo]  = useState<{ name: string; style: string; focus: string[] } | null>(null);
  const [resumeLoaded, setResumeLoaded] = useState(false);
  const [pendingFollowUp, setPendingFollowUp] = useState<string | null>(null);

  // Think time
  const [thinkSecs,  setThinkSecs]  = useState(THINK_SECONDS);
  const thinkIntRef  = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Feedback auto-advance
  const [advanceSecs, setAdvanceSecs] = useState(FEEDBACK_AUTO_ADVANCE);
  const advanceIntRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Audio refs
  const audioCtxRef   = useRef<AudioContext | null>(null);
  const aiAnalyserRef = useRef<AnalyserNode | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef  = useRef<MediaStream | null>(null);
  const audioElRef    = useRef<HTMLAudioElement | null>(null);
  const silenceRafRef = useRef<number>(0);
  const recognitionRef = useRef<any>(null);
  const hasSpeechRef  = useRef(false);
  const silenceStartRef = useRef<number | null>(null);

  const [micActive, setMicActive] = useState(false);

  // Fullscreen ref
  const sessionRef = useRef<HTMLDivElement>(null);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    apiClient.get("/interview/tts/status")
      .then(({ data }) => setTtsAvail(data.available))
      .catch(() => setTtsAvail(false));
    apiClient.get("/interview/voices")
      .then(({ data }) => { setVoices(data.voices); setSelectedVoice(data.default); })
      .catch(() => {});
    if (typeof window !== "undefined" && "speechSynthesis" in window)
      window.speechSynthesis.getVoices();
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

    if (ttsAvail) {
      // ElevenLabs path
      try {
        const { createClient } = await import("@/lib/supabase/client");
        const token = await createClient().auth.getSession()
          .then(r => r.data.session?.access_token ?? "");
        const resp = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/interview/tts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({ text, voice_id: selectedVoice }),
          }
        );
        if (!resp.ok) throw new Error("TTS failed");
        const blob = await resp.blob();
        const url  = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audioElRef.current = audio;

        // Wire frequency analyser on the audio element
        const ctx      = getAudioCtx();
        const src      = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        src.connect(analyser);
        analyser.connect(ctx.destination);
        aiAnalyserRef.current = analyser;

        audio.onended = () => {
          setAiSpeaking(false);
          aiAnalyserRef.current = null;
          URL.revokeObjectURL(url);
          startThinkTime();
        };
        audio.onerror = () => { setAiSpeaking(false); startThinkTime(); };
        await audio.play();
        return;
      } catch {
        // fallthrough to browser TTS
      }
    }

    // Browser Speech Synthesis fallback
    if ("speechSynthesis" in window) {
      const utt  = new SpeechSynthesisUtterance(text);
      utt.rate   = 0.88;
      utt.pitch  = 1.0;
      utt.volume = 1;
      const voices = window.speechSynthesis.getVoices();
      const pick = voices.find(v =>
        v.name.includes("Samantha") || v.name.includes("Karen") ||
        v.name.includes("Daniel") || (v.lang === "en-US" && !v.name.includes("Google"))
      ) ?? voices.find(v => v.lang.startsWith("en")) ?? null;
      if (pick) utt.voice = pick;
      utt.onend   = () => { setAiSpeaking(false); startThinkTime(); };
      utt.onerror = () => { setAiSpeaking(false); startThinkTime(); };
      window.speechSynthesis.speak(utt);
    } else {
      setAiSpeaking(false);
      startThinkTime();
    }
  }

  function stopAudio() {
    audioElRef.current?.pause();
    audioElRef.current = null;
    window.speechSynthesis?.cancel();
    aiAnalyserRef.current = null;
    setAiSpeaking(false);
  }

  async function previewVoice(voiceId: string) {
    if (previewing) { stopAudio(); setPreviewing(null); return; }
    if (!ttsAvail) { toast.error("ElevenLabs not configured"); return; }
    setPreviewing(voiceId);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const token = await createClient().auth.getSession()
        .then(r => r.data.session?.access_token ?? "");
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/interview/tts`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ text: "Hello! I'll be your interviewer today. Let's get started.", voice_id: voiceId }),
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

  // ── Recording + silence detection ────────────────────────────────────────

  const beginRecording = useCallback(async () => {
    setSessionMode("recording");
    setAnswer("");
    hasSpeechRef.current   = false;
    silenceStartRef.current = null;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setMicActive(true);

      // Frequency analyser for visualizer
      const ctx      = getAudioCtx();
      const src      = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      micAnalyserRef.current = analyser;

      // Speech recognition for transcript
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

      // Silence detection loop
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
      if (!pendingFollowUp) setAllFeedback(prev => [...prev, fb]);
      setSessionMode("feedback");
      startAutoAdvance(fb);
    } catch {
      toast.error("Evaluation failed — moving to next question.");
      advanceQuestion(null);
    }
  }

  // ── Feedback auto-advance ─────────────────────────────────────────────────

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

    // If we were on a follow-up, clear it and don't advance index
    if (pendingFollowUp) {
      setPendingFollowUp(null);
      setAnswer("");
      setFeedback(null);
      speakNextQuestion(qIndex);
      return;
    }

    // Optionally show follow-up
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

  // ── Interview start ───────────────────────────────────────────────────────

  async function startInterview() {
    setPhase("analyzing");
    await new Promise(r => setTimeout(r, 4200));
    try {
      const { data } = await apiClient.post("/interview/hirevue/start", {
        role, company, experience_level: expLevel, interview_type: iType, num_questions: numQ,
      });
      setQuestions(data.questions);
      setCompanyInfo(data.company_profile);
      setResumeLoaded(data.resume_loaded ?? false);
      setQIndex(0);
      setAllFeedback([]);
      setFeedback(null);
      setAnswer("");
      setPendingFollowUp(null);
      setPhase("session");

      // Fullscreen
      try { await document.documentElement.requestFullscreen(); } catch {}

      // Speak first question after a short delay
      setTimeout(() => speakText(data.questions[0].question), 800);
    } catch {
      toast.error("Failed to generate questions. Try again.");
      setPhase("setup");
    }
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
    setPendingFollowUp(null);
    setSessionMode("thinking");
  }

  const overallScore = allFeedback.length
    ? Math.round(allFeedback.reduce((s, f) => s + f.score, 0) / allFeedback.length)
    : 0;

  const currentQuestion = pendingFollowUp ?? questions[qIndex]?.question ?? "";
  const currentType     = pendingFollowUp ? "situational" : questions[qIndex]?.type;
  const displayedCos    = showAllCo ? COMPANIES : COMPANIES.slice(0, 8);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 max-w-3xl mx-auto">

      {/* Header — hidden in fullscreen */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-1 flex-wrap">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">AI Interview</h1>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-[var(--accent-muted)] border-[var(--accent-primary)]/30 text-[var(--accent-hover)]">
            <Brain className="w-2.5 h-2.5" /> HireVue-style
          </span>
        </div>
        <p className="text-[14px] text-[var(--text-secondary)]">
          Personalised interview · voice-driven · auto-advances after your answer.
        </p>
      </motion.div>

      <AnimatePresence mode="wait">

        {/* ── Setup ── */}
        {phase === "setup" && (
          <motion.div key="setup" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-5">
            <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-5">

              {/* Company */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-2">Target Company</label>
                <div className="flex flex-wrap gap-2">
                  {displayedCos.map(co => (
                    <button
                      key={co.name}
                      onClick={() => setCompany(co.name)}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-medium border transition-colors ${
                        company === co.name
                          ? "bg-[var(--accent-muted)] border-[var(--accent-primary)]/40 text-[var(--accent-hover)]"
                          : "bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                      }`}
                    >
                      <span>{co.emoji}</span> {co.name}
                    </button>
                  ))}
                  <button onClick={() => setShowAllCo(v => !v)}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl text-[12px] text-[var(--text-muted)] border border-dashed border-[var(--border-subtle)] transition-colors">
                    {showAllCo ? "Less" : "More"} <ChevronDown className={`w-3 h-3 transition-transform ${showAllCo ? "rotate-180" : ""}`} />
                  </button>
                </div>
              </div>

              {/* Role */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-2">Target Role</label>
                <input list="roles-list" value={role} onChange={e => setRole(e.target.value)}
                  placeholder="e.g. Software Engineer"
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors" />
                <datalist id="roles-list">{ROLES.map(r => <option key={r} value={r} />)}</datalist>
              </div>

              {/* Experience */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-2">Experience Level</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {EXPERIENCE_LEVELS.map(l => (
                    <button key={l.value} onClick={() => setExpLevel(l.value)}
                      className={`px-3 py-2.5 rounded-xl text-[12px] font-medium border transition-colors text-left ${
                        expLevel === l.value ? "bg-[var(--accent-muted)] border-[var(--accent-primary)]/30 text-[var(--accent-hover)]" : "bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)]"
                      }`}>{l.label}</button>
                  ))}
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-2">Interview Type</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {INTERVIEW_TYPES.map(t => (
                    <button key={t.value} onClick={() => setIType(t.value)}
                      className={`p-3 rounded-xl text-left border transition-colors ${
                        iType === t.value ? "bg-[var(--accent-muted)] border-[var(--accent-primary)]/30" : "bg-[var(--bg-elevated)] border-[var(--border-subtle)]"
                      }`}>
                      <div className={`text-[13px] font-medium mb-0.5 ${iType === t.value ? "text-[var(--accent-hover)]" : "text-[var(--text-primary)]"}`}>{t.label}</div>
                      <div className="text-[11px] text-[var(--text-muted)]">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Num questions */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-2">
                  Questions: <span className="text-[var(--accent-hover)] font-bold">{numQ}</span>
                </label>
                <input type="range" min={3} max={10} step={1} value={numQ}
                  onChange={e => setNumQ(Number(e.target.value))}
                  className="w-full accent-[var(--accent-primary)]" />
                <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1"><span>3</span><span>10</span></div>
              </div>

              {/* Voice picker */}
              {ttsAvail && voices.length > 0 && (
                <div>
                  <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-2">
                    Interviewer Voice
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {voices.map(v => (
                      <div key={v.id}
                        onClick={() => setSelectedVoice(v.id)}
                        className={`relative p-3 rounded-xl border cursor-pointer transition-all ${
                          selectedVoice === v.id
                            ? "border-[var(--accent-primary)]/40 bg-[var(--accent-subtle)]"
                            : "border-[var(--border-subtle)] bg-[var(--bg-elevated)] hover:border-[var(--border-default)]"
                        }`}
                      >
                        <div className={`text-[13px] font-semibold mb-0.5 ${selectedVoice === v.id ? "text-[var(--accent-hover)]" : "text-[var(--text-primary)]"}`}>
                          {v.name}
                        </div>
                        <div className="text-[10px] text-[var(--text-muted)]">{v.desc}</div>
                        <button
                          onClick={e => { e.stopPropagation(); previewVoice(v.id); }}
                          className={`mt-2 text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
                            previewing === v.id
                              ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] text-white"
                              : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                          }`}
                        >
                          {previewing === v.id ? "▐▌ Stop" : "▶ Preview"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button onClick={startInterview} disabled={!role.trim()}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white font-medium text-[14px] transition-colors disabled:opacity-50">
                <Maximize2 className="w-4 h-4" />
                Start Interview (Fullscreen)
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <div className="text-[12px] font-semibold text-[var(--text-secondary)] mb-2">How it works</div>
              <ul className="space-y-1 text-[12px] text-[var(--text-muted)]">
                <li>· Interview opens fullscreen — AI reads each question aloud</li>
                <li>· You get 60 seconds to think, then the mic opens automatically</li>
                <li>· Stop speaking for 2.5s → answer auto-submits, next question loads</li>
                <li>· Upload your active resume first for personalised questions</li>
              </ul>
            </div>
          </motion.div>
        )}

        {/* ── Analyzing ── */}
        {phase === "analyzing" && <AnalysisScreen key="analyzing" company={company} />}

        {/* ── Session (fullscreen UI) ── */}
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
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-subtle)] flex-shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--accent-muted)] border border-[var(--accent-primary)]/30 flex items-center justify-center">
                  <Brain className="w-4 h-4 text-[var(--accent-primary)]" />
                </div>
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
                  <div key={i} className={`w-2 h-2 rounded-full transition-colors ${
                    i < qIndex ? "bg-emerald-400"
                      : i === qIndex ? "bg-[var(--accent-primary)]"
                      : "bg-[var(--border-default)]"
                  }`} />
                ))}
              </div>

              <div className="flex items-center gap-2">
                {resumeLoaded && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/10 border border-emerald-400/20 text-emerald-400">
                    ✓ Resume
                  </span>
                )}
                <button onClick={exitSession}
                  className="p-2 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Main content */}
            <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">

              {/* ── AI side (top / left) ── */}
              <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-10 gap-5 border-b lg:border-b-0 lg:border-r border-[var(--border-subtle)]">
                {/* AI avatar */}
                <div className={`relative w-20 h-20 rounded-full border-2 flex items-center justify-center transition-all ${
                  aiSpeaking
                    ? "border-[var(--accent-primary)] bg-[var(--accent-muted)] shadow-[0_0_30px_var(--accent-primary)33]"
                    : "border-[var(--border-default)] bg-[var(--bg-elevated)]"
                }`}>
                  <Brain className="w-9 h-9 text-[var(--accent-primary)]" />
                  {aiSpeaking && (
                    <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-[var(--accent-primary)] flex items-center justify-center">
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

                {/* AI frequency visualizer */}
                <div className="w-full max-w-xs">
                  <FrequencyBars
                    analyser={aiAnalyserRef.current}
                    active={aiSpeaking}
                    color="#6366f1"
                    bars={40}
                    height={56}
                  />
                </div>

                {/* Question text */}
                <div className="w-full max-w-lg bg-[var(--bg-elevated)] rounded-2xl p-5 border border-[var(--border-default)]">
                  <div className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border mb-3 ${
                    currentType === "technical"
                      ? "text-blue-400 bg-blue-400/10 border-blue-400/20"
                      : currentType === "situational"
                        ? "text-purple-400 bg-purple-400/10 border-purple-400/20"
                        : "text-amber-400 bg-amber-400/10 border-amber-400/20"
                  }`}>
                    {pendingFollowUp ? "↳ Follow-up" : currentType}
                  </div>
                  <p className="text-[16px] text-[var(--text-primary)] leading-relaxed font-medium">
                    {currentQuestion}
                  </p>
                </div>
              </div>

              {/* ── User side (bottom / right) ── */}
              <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-10 gap-5">

                <AnimatePresence mode="wait">

                  {/* THINKING */}
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

                  {/* RECORDING */}
                  {sessionMode === "recording" && (
                    <motion.div key="recording" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-5 w-full">

                      {/* Mic pulse */}
                      <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-red-400/20 animate-ping scale-150" />
                        <div className="w-16 h-16 rounded-full bg-red-400/15 border-2 border-red-400/60 flex items-center justify-center relative">
                          <Mic className="w-7 h-7 text-red-400" />
                        </div>
                      </div>

                      {/* User frequency visualizer */}
                      <div className="w-full max-w-xs">
                        <FrequencyBars
                          analyser={micAnalyserRef.current}
                          active={micActive}
                          color="#f43f5e"
                          bars={40}
                          height={64}
                        />
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

                  {/* EVALUATING */}
                  {sessionMode === "evaluating" && (
                    <motion.div key="evaluating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="flex flex-col items-center gap-4">
                      <Loader2 className="w-10 h-10 animate-spin text-[var(--accent-primary)]" />
                      <div className="text-[14px] text-[var(--text-secondary)]">Evaluating your answer…</div>
                    </motion.div>
                  )}

                  {/* FEEDBACK */}
                  {sessionMode === "feedback" && feedback && (
                    <motion.div key="feedback" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                      className="w-full max-w-sm space-y-3">

                      {/* Score */}
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

                      {/* Auto-advance countdown */}
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
          <motion.div key="results" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
            <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-center">
              <div className="text-[11px] font-medium text-[var(--text-muted)] mb-2 uppercase tracking-widest">
                Interview Complete{companyInfo && ` · ${companyInfo.name}`}
              </div>
              <div className="text-6xl font-black mb-2 tabular-nums"
                style={{ color: overallScore >= 7 ? "#10b981" : overallScore >= 5 ? "#f59e0b" : "#ef4444" }}>
                {overallScore}/10
              </div>
              <div className="text-[14px] text-[var(--text-secondary)]">
                {overallScore >= 8 ? "Outstanding — you're interview-ready!" :
                 overallScore >= 6 ? "Good performance with clear areas to polish." :
                 overallScore >= 4 ? "Fair start — keep practising the weaker areas." :
                 "Needs more practice — keep going!"}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Question Breakdown</h3>
              {questions.map((q, i) => {
                const f = allFeedback[i];
                if (!f) return null;
                return (
                  <div key={i} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                    <div className="flex items-start justify-between gap-3 mb-1">
                      <p className="text-[13px] text-[var(--text-primary)] font-medium leading-snug flex-1">{q.question}</p>
                      <div className="text-[15px] font-black flex-shrink-0 tabular-nums"
                        style={{ color: f.score >= 7 ? "#10b981" : f.score >= 5 ? "#f59e0b" : "#ef4444" }}>
                        {f.score}/10
                      </div>
                    </div>
                    <p className="text-[12px] text-[var(--text-muted)]">{f.overall_feedback}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button onClick={() => setPhase("setup")}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--border-default)] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">
                <RotateCcw className="w-3.5 h-3.5" /> New Interview
              </button>
              <button onClick={() => { setQIndex(0); setAllFeedback([]); setFeedback(null); setAnswer(""); setPendingFollowUp(null); setPhase("session"); setTimeout(() => speakText(questions[0]?.question), 400); }}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors">
                <RotateCcw className="w-3.5 h-3.5" /> Retry
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
