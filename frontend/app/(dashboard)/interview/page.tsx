"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { apiClient } from "@/lib/api/client";
import {
  Mic, MicOff, Volume2, VolumeX, ChevronRight,
  CheckCircle2, AlertCircle, RotateCcw, Sparkles, Brain,
  Play, Loader2, ArrowRight,
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

type Phase = "setup" | "loading" | "session" | "results";

// ── Constants ────────────────────────────────────────────────────────────────

const ROLES = [
  "Software Engineer", "Product Manager", "Data Scientist", "ML Engineer",
  "Frontend Engineer", "Backend Engineer", "DevOps Engineer", "UX Designer",
  "Business Analyst", "Marketing Manager", "Data Analyst", "Full Stack Engineer",
];

const EXPERIENCE_LEVELS = [
  { value: "student",  label: "Student / Intern" },
  { value: "entry",    label: "Entry Level (0-2 yrs)" },
  { value: "mid",      label: "Mid Level (2-5 yrs)" },
  { value: "senior",   label: "Senior (5+ yrs)" },
];

const INTERVIEW_TYPES = [
  { value: "behavioral", label: "Behavioural", desc: "STAR-format questions about past experience" },
  { value: "technical",  label: "Technical",   desc: "Problem-solving & domain knowledge" },
  { value: "mixed",      label: "Mixed",        desc: "Both behavioural and technical" },
];

// ── Waveform animation ───────────────────────────────────────────────────────

function Waveform({ active }: { active: boolean }) {
  return (
    <div className="flex items-end gap-[3px] h-8">
      {[...Array(12)].map((_, i) => (
        <motion.div
          key={i}
          className="w-[3px] rounded-full"
          style={{ background: "var(--accent-primary)" }}
          animate={active ? {
            height: [8, 6 + Math.random() * 22, 8],
          } : { height: 4 }}
          transition={active ? {
            duration: 0.4 + (i % 3) * 0.15,
            repeat: Infinity,
            repeatType: "mirror",
            ease: "easeInOut",
            delay: i * 0.06,
          } : { duration: 0.2 }}
        />
      ))}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function InterviewPage() {
  const [phase, setPhase]         = useState<Phase>("setup");
  const [ttsAvailable, setTtsAvailable] = useState(false);

  // Setup form
  const [role,       setRole]       = useState("Software Engineer");
  const [expLevel,   setExpLevel]   = useState("entry");
  const [iType,      setIType]      = useState("mixed");
  const [numQ,       setNumQ]       = useState(5);

  // Session state
  const [questions,  setQuestions]  = useState<Question[]>([]);
  const [qIndex,     setQIndex]     = useState(0);
  const [answer,     setAnswer]     = useState("");
  const [feedback,   setFeedback]   = useState<Feedback | null>(null);
  const [allFeedback, setAllFeedback] = useState<Feedback[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [recording,  setRecording]  = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const recognitionRef = useRef<any>(null);

  // Check TTS availability on mount
  useEffect(() => {
    apiClient.get("/interview/tts/status")
      .then(({ data }) => setTtsAvailable(data.available))
      .catch(() => setTtsAvailable(false));
  }, []);

  // Auto-play question audio when question changes
  useEffect(() => {
    if (phase === "session" && questions[qIndex] && ttsAvailable) {
      playQuestionAudio(questions[qIndex].question);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIndex, phase]);

  async function startInterview() {
    setPhase("loading");
    try {
      const { data } = await apiClient.post("/interview/start", {
        role, experience_level: expLevel, interview_type: iType, num_questions: numQ,
      });
      setQuestions(data.questions);
      setQIndex(0);
      setAllFeedback([]);
      setFeedback(null);
      setAnswer("");
      setPhase("session");
    } catch {
      toast.error("Failed to generate questions. Try again.");
      setPhase("setup");
    }
  }

  async function playQuestionAudio(text: string) {
    if (!ttsAvailable) return;
    try {
      setAudioPlaying(true);
      const resp = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000"}/api/v1/interview/tts`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${(await import("@/lib/supabase/client")).createClient().auth.getSession().then(r => r.data.session?.access_token ?? "")}`,
          },
          body: JSON.stringify({ text }),
        }
      );
      if (!resp.ok) { setAudioPlaying(false); return; }
      const blob = await resp.blob();
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => { setAudioPlaying(false); URL.revokeObjectURL(url); };
      audio.onerror = () => setAudioPlaying(false);
      await audio.play();
    } catch {
      setAudioPlaying(false);
    }
  }

  function stopAudio() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setAudioPlaying(false);
  }

  function toggleRecording() {
    if (recording) {
      recognitionRef.current?.stop();
      setRecording(false);
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { toast.error("Speech recognition not supported in this browser"); return; }

    const recog = new SR();
    recog.lang = "en-US";
    recog.continuous = true;
    recog.interimResults = true;
    recog.onresult = (e: any) => {
      const transcript = Array.from(e.results)
        .map((r: any) => r[0].transcript)
        .join("");
      setAnswer(transcript);
    };
    recog.onerror = () => { setRecording(false); toast.error("Microphone error"); };
    recog.onend   = () => setRecording(false);
    recog.start();
    recognitionRef.current = recog;
    setRecording(true);
  }

  async function submitAnswer() {
    if (!answer.trim()) { toast.error("Please type or speak your answer first"); return; }
    setSubmitting(true);
    try {
      const { data } = await apiClient.post("/interview/evaluate", {
        role,
        question: questions[qIndex].question,
        answer: answer.trim(),
        question_type: questions[qIndex].type,
      });
      setFeedback(data as Feedback);
      setAllFeedback((prev) => [...prev, data as Feedback]);
    } catch {
      toast.error("Evaluation failed. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function nextQuestion() {
    stopAudio();
    if (qIndex + 1 >= questions.length) {
      setPhase("results");
      return;
    }
    setQIndex((i) => i + 1);
    setAnswer("");
    setFeedback(null);
  }

  function restart() {
    stopAudio();
    setPhase("setup");
    setQuestions([]);
    setQIndex(0);
    setAnswer("");
    setFeedback(null);
    setAllFeedback([]);
  }

  const overallScore = allFeedback.length
    ? Math.round(allFeedback.reduce((s, f) => s + f.score, 0) / allFeedback.length)
    : 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-8 max-w-3xl mx-auto">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">AI Interview Practice</h1>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-[var(--accent-muted)] border-[var(--accent-primary)]/30 text-[var(--accent-hover)]">
            <Brain className="w-2.5 h-2.5" /> Powered by JobSync AI
          </span>
          {ttsAvailable && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border bg-emerald-400/10 border-emerald-400/20 text-emerald-400">
              <Volume2 className="w-2.5 h-2.5" /> Voice on
            </span>
          )}
        </div>
        <p className="text-[14px] text-[var(--text-secondary)]">
          Practice real interview questions with AI feedback. {ttsAvailable ? "Questions are spoken aloud via ElevenLabs AI voice." : "Add your ElevenLabs API key to enable voice."}
        </p>
      </motion.div>

      <AnimatePresence mode="wait">

        {/* ── Setup ── */}
        {phase === "setup" && (
          <motion.div
            key="setup"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -16 }}
            className="space-y-6"
          >
            <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-5">
              {/* Role */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-2">Target Role</label>
                <input
                  list="roles-list"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  placeholder="e.g. Software Engineer"
                  className="w-full px-4 py-2.5 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors"
                />
                <datalist id="roles-list">
                  {ROLES.map((r) => <option key={r} value={r} />)}
                </datalist>
              </div>

              {/* Experience */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-2">Experience Level</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {EXPERIENCE_LEVELS.map((l) => (
                    <button
                      key={l.value}
                      onClick={() => setExpLevel(l.value)}
                      className={`px-3 py-2.5 rounded-xl text-[12px] font-medium border transition-colors text-left ${
                        expLevel === l.value
                          ? "bg-[var(--accent-muted)] border-[var(--accent-primary)]/30 text-[var(--accent-hover)]"
                          : "bg-[var(--bg-elevated)] border-[var(--border-subtle)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                      }`}
                    >
                      {l.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Interview type */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-2">Interview Type</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {INTERVIEW_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => setIType(t.value)}
                      className={`p-3 rounded-xl text-left border transition-colors ${
                        iType === t.value
                          ? "bg-[var(--accent-muted)] border-[var(--accent-primary)]/30"
                          : "bg-[var(--bg-elevated)] border-[var(--border-subtle)] hover:border-[var(--border-default)]"
                      }`}
                    >
                      <div className={`text-[13px] font-medium mb-0.5 ${iType === t.value ? "text-[var(--accent-hover)]" : "text-[var(--text-primary)]"}`}>
                        {t.label}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)]">{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Number of questions */}
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-2">
                  Number of questions: <span className="text-[var(--accent-hover)] font-bold">{numQ}</span>
                </label>
                <input
                  type="range" min={3} max={10} step={1}
                  value={numQ}
                  onChange={(e) => setNumQ(Number(e.target.value))}
                  className="w-full accent-[var(--accent-primary)]"
                />
                <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1">
                  <span>3 (quick)</span><span>10 (full)</span>
                </div>
              </div>

              <button
                onClick={startInterview}
                disabled={!role.trim()}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white font-medium text-[14px] transition-colors disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                Start Interview
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Tips */}
            <div className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
              <div className="text-[12px] font-semibold text-[var(--text-secondary)] mb-2">Tips for best results</div>
              <ul className="space-y-1 text-[12px] text-[var(--text-muted)]">
                <li>· Answer out loud or type your full response — AI scores both equally</li>
                <li>· Use the STAR method for behavioural questions (Situation, Task, Action, Result)</li>
                <li>· Be specific — mention technologies, team sizes, and outcomes</li>
                {!ttsAvailable && <li className="text-amber-400">· Add ELEVENLABS_API_KEY to your backend .env for voice interviewer</li>}
              </ul>
            </div>
          </motion.div>
        )}

        {/* ── Loading ── */}
        {phase === "loading" && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-24 gap-4"
          >
            <Loader2 className="w-8 h-8 animate-spin text-[var(--accent-primary)]" />
            <div className="text-[14px] text-[var(--text-secondary)]">Generating your personalised interview…</div>
          </motion.div>
        )}

        {/* ── Session ── */}
        {phase === "session" && questions.length > 0 && (
          <motion.div
            key="session"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-5"
          >
            {/* Progress */}
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-[var(--text-muted)]">
                Question {qIndex + 1} of {questions.length}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-[var(--bg-overlay)] overflow-hidden">
                <motion.div
                  className="h-full rounded-full bg-[var(--accent-primary)]"
                  animate={{ width: `${((qIndex + (feedback ? 1 : 0)) / questions.length) * 100}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${
                questions[qIndex]?.type === "technical"
                  ? "text-blue-400 bg-blue-400/10 border-blue-400/20"
                  : questions[qIndex]?.type === "situational"
                    ? "text-purple-400 bg-purple-400/10 border-purple-400/20"
                    : "text-amber-400 bg-amber-400/10 border-amber-400/20"
              }`}>
                {questions[qIndex]?.type}
              </span>
            </div>

            {/* AI interviewer card */}
            <div className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)]">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full bg-[var(--accent-muted)] border border-[var(--accent-primary)]/30 flex items-center justify-center">
                    <Brain className="w-4.5 h-4.5 text-[var(--accent-primary)]" />
                  </div>
                  <div>
                    <div className="text-[12px] font-semibold text-[var(--text-primary)]">JobSync AI Interviewer</div>
                    {audioPlaying && <div className="text-[10px] text-[var(--accent-hover)]">Speaking…</div>}
                  </div>
                </div>
                {ttsAvailable && (
                  <div className="flex items-center gap-2">
                    <Waveform active={audioPlaying} />
                    <button
                      onClick={audioPlaying ? stopAudio : () => playQuestionAudio(questions[qIndex].question)}
                      className="p-1.5 rounded-lg hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
                    >
                      {audioPlaying ? <VolumeX className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </button>
                  </div>
                )}
              </div>

              <p className="text-[15px] text-[var(--text-primary)] leading-relaxed font-medium">
                {questions[qIndex]?.question}
              </p>
            </div>

            {/* Answer area — only show if no feedback yet */}
            <AnimatePresence mode="wait">
              {!feedback ? (
                <motion.div
                  key="answer"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="space-y-3"
                >
                  <label className="block text-[12px] font-medium text-[var(--text-secondary)]">Your Answer</label>
                  <div className="relative">
                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      placeholder="Type your answer here, or use the microphone button below…"
                      rows={5}
                      className="w-full px-4 py-3 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] transition-colors resize-none"
                    />
                    {recording && (
                      <div className="absolute top-2 right-3 flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-red-400 animate-pulse" />
                        <span className="text-[10px] text-red-400 font-medium">Recording</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={toggleRecording}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-[12px] font-medium transition-colors ${
                        recording
                          ? "bg-red-400/10 border-red-400/30 text-red-400"
                          : "bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-secondary)] hover:border-[var(--border-default)]"
                      }`}
                    >
                      {recording ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      {recording ? "Stop Recording" : "Record Answer"}
                    </button>

                    <button
                      onClick={submitAnswer}
                      disabled={submitting || !answer.trim()}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors disabled:opacity-50"
                    >
                      {submitting
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Evaluating…</>
                        : <><ChevronRight className="w-3.5 h-3.5" /> Submit Answer</>
                      }
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* Feedback panel */
                <motion.div
                  key="feedback"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="p-5 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] space-y-4"
                >
                  {/* Score bar */}
                  <div className="flex items-center gap-3">
                    <div
                      className="text-2xl font-black tabular-nums"
                      style={{
                        color: feedback.score >= 7 ? "#10b981" : feedback.score >= 5 ? "#f59e0b" : "#ef4444",
                      }}
                    >
                      {feedback.score}/10
                    </div>
                    <div className="flex-1 h-2 rounded-full bg-[var(--bg-overlay)] overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          background: feedback.score >= 7 ? "#10b981" : feedback.score >= 5 ? "#f59e0b" : "#ef4444",
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${(feedback.score / 10) * 100}%` }}
                        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                      />
                    </div>
                  </div>

                  <p className="text-[13px] text-[var(--text-secondary)] leading-relaxed">
                    {feedback.overall_feedback}
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Strengths */}
                    {feedback.strengths.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400 mb-2">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Strengths
                        </div>
                        <ul className="space-y-1">
                          {feedback.strengths.map((s, i) => (
                            <li key={i} className="text-[12px] text-[var(--text-secondary)] flex gap-2">
                              <span className="text-emerald-400 mt-0.5 flex-shrink-0">·</span> {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Improvements */}
                    {feedback.improvements.length > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-400 mb-2">
                          <AlertCircle className="w-3.5 h-3.5" /> To Improve
                        </div>
                        <ul className="space-y-1">
                          {feedback.improvements.map((s, i) => (
                            <li key={i} className="text-[12px] text-[var(--text-secondary)] flex gap-2">
                              <span className="text-amber-400 mt-0.5 flex-shrink-0">·</span> {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>

                  {feedback.follow_up && (
                    <div className="p-3 rounded-xl bg-[var(--accent-subtle)] border border-[var(--accent-primary)]/10">
                      <div className="text-[10px] font-semibold text-[var(--accent-primary)] uppercase tracking-wider mb-1">
                        Follow-up probe
                      </div>
                      <p className="text-[12px] text-[var(--text-secondary)]">{feedback.follow_up}</p>
                    </div>
                  )}

                  <button
                    onClick={nextQuestion}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
                  >
                    {qIndex + 1 >= questions.length ? "See Results" : "Next Question"}
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}

        {/* ── Results ── */}
        {phase === "results" && (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Overall score */}
            <div className="p-6 rounded-2xl border border-[var(--border-default)] bg-[var(--bg-surface)] text-center">
              <div className="text-[12px] font-medium text-[var(--text-muted)] mb-2 uppercase tracking-widest">Interview Complete</div>
              <div
                className="text-6xl font-black mb-2"
                style={{
                  color: overallScore >= 7 ? "#10b981" : overallScore >= 5 ? "#f59e0b" : "#ef4444",
                }}
              >
                {overallScore}/10
              </div>
              <div className="text-[14px] text-[var(--text-secondary)]">
                {overallScore >= 8 ? "Outstanding — you're well-prepared!" :
                 overallScore >= 6 ? "Good performance with room to improve." :
                 overallScore >= 4 ? "Fair — focus on the feedback to level up." :
                 "Needs more practice — keep going!"}
              </div>
            </div>

            {/* Per-question breakdown */}
            <div className="space-y-3">
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Question Breakdown</h3>
              {questions.map((q, i) => {
                const f = allFeedback[i];
                if (!f) return null;
                return (
                  <div key={i} className="p-4 rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <p className="text-[13px] text-[var(--text-primary)] font-medium leading-snug flex-1">{q.question}</p>
                      <div
                        className="text-[15px] font-black flex-shrink-0 tabular-nums"
                        style={{ color: f.score >= 7 ? "#10b981" : f.score >= 5 ? "#f59e0b" : "#ef4444" }}
                      >
                        {f.score}/10
                      </div>
                    </div>
                    <p className="text-[12px] text-[var(--text-muted)]">{f.overall_feedback}</p>
                  </div>
                );
              })}
            </div>

            <div className="flex gap-3">
              <button
                onClick={restart}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-[var(--border-default)] text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> New Interview
              </button>
              <button
                onClick={() => { setPhase("session"); setQIndex(0); setAllFeedback([]); setFeedback(null); setAnswer(""); }}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-[var(--accent-primary)] hover:bg-[var(--accent-hover)] text-white text-[13px] font-medium transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" /> Retry Same Questions
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  );
}
