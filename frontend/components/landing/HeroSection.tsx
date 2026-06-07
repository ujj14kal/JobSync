"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  motion,
  useScroll,
  useTransform,
  useMotionValue,
  useSpring,
  MotionValue,
} from "framer-motion";
import { ArrowRight, Sparkles, Zap, Shield } from "lucide-react";
import dynamic from "next/dynamic";
import { ScoreRing } from "@/components/ui/ScoreDonut";
import { Spotlight } from "@/components/ui/spotlight";

/* ── Rotating hero headlines ── */
const HERO_VARIANTS = [
  {
    line1: "Get the interview",
    line2: "your resume",
    line3: "has always deserved",
    sub: "Paste a job URL. Upload your resume. JobSync AI scores it across 5 dimensions, finds every missing keyword, rewrites weak bullets, and shows you exactly what to improve — all in under 30 seconds. Free, always.",
  },
  {
    line1: "Make your resume",
    line2: "impossible",
    line3: "to overlook",
    sub: "JobSync AI reads every job posting like a recruiter, then tells you precisely how to match it — keyword by keyword, bullet by bullet. Stand out before a human even opens your file.",
  },
  {
    line1: "Land your dream role",
    line2: "with AI working",
    line3: "in your corner",
    sub: "Upload your resume. JobSync AI compares it to the job in real time — scoring every section, surfacing skill gaps, and rewriting weak bullets so recruiters see your best self first.",
  },
  {
    line1: "Turn your resume",
    line2: "into your strongest",
    line3: "career asset",
    sub: "JobSync AI does in seconds what recruiters do in years — matching you to the right roles, highlighting your strengths, and giving you a clear path to more interviews.",
  },
  {
    line1: "See exactly how to",
    line2: "make recruiters",
    line3: "say yes",
    sub: "Paste a job link, upload your resume, and get a full AI report in under 30 seconds — score, missing keywords, improved bullets, and the one thing that will move you to the top of the pile.",
  },
  {
    line1: "Beat the ATS and",
    line2: "let your talent",
    line3: "shine through",
    sub: "Most resumes never reach a human. JobSync AI makes sure yours does — by scoring your resume against the actual job requirements and showing you exactly how to clear every filter.",
  },
] as const;

const SESSION_KEY = "hero_variant";
const STORAGE_KEY = "hero_variant_idx";

function pickVariant(): number {
  try {
    const session = sessionStorage.getItem(SESSION_KEY);
    if (session !== null) return Number(session);
    const last = Number(localStorage.getItem(STORAGE_KEY) ?? -1);
    const next = (last + 1) % HERO_VARIANTS.length;
    sessionStorage.setItem(SESSION_KEY, String(next));
    localStorage.setItem(STORAGE_KEY, String(next));
    return next;
  } catch {
    return 0;
  }
}

const NeuralNetworkCanvas = dynamic(
  () => import("@/components/3d/NeuralNetworkCanvas"),
  { ssr: false }
);

/* ── Float card definitions with depth for mouse parallax ── */
const FLOAT_CARDS = [
  {
    id: "score",
    pos: { left: "4%", top: "22%" },
    hidden: "hidden xl:flex",
    delay: 0,
    duration: 5.5,
    depth: 0.022, // subtle depth layer
    content: (
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-2 text-xs text-secondary">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#C05800" }} />
          ATS Analysis
        </div>
        <ScoreRing score={84} size={64} strokeWidth={6} />
        <div className="text-xs text-secondary text-center">Resume Score</div>
      </div>
    ),
  },
  {
    id: "match",
    pos: { right: "4%", top: "28%" },
    hidden: "hidden xl:flex",
    delay: 1.2,
    duration: 6,
    depth: 0.038, // deeper layer — moves more with mouse
    content: (
      <div className="flex flex-col gap-3 p-4 min-w-[180px]">
        <div className="flex items-center gap-2 text-xs text-secondary">
          <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "#d4aa30" }} />
          Skill Match
        </div>
        {[
          { label: "Python", pct: 95, color: "#C05800" },
          { label: "React",  pct: 78, color: "#713600" },
          { label: "AWS",    pct: 62, color: "#d4aa30" },
        ].map((item) => (
          <div key={item.label}>
            <div className="flex justify-between text-[10px] mb-1" style={{ color: "rgba(148,163,184,0.8)" }}>
              <span>{item.label}</span>
              <span style={{ color: item.color }}>{item.pct}%</span>
            </div>
            <div className="h-1 rounded-full bg-white/5 overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: item.color, width: `${item.pct}%` }}
                initial={{ width: 0 }}
                animate={{ width: `${item.pct}%` }}
                transition={{ delay: 2 + 0.15, duration: 1.2, ease: [0.16,1,0.3,1] }}
              />
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "interview",
    pos: { right: "6%", bottom: "24%" },
    hidden: "hidden xl:flex",
    delay: 0.6,
    duration: 5,
    depth: 0.016, // shallowest layer — barely moves
    content: (
      <div className="flex items-center gap-3 p-3">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: "rgba(192,88,0,0.15)", border: "1px solid rgba(192,88,0,0.30)" }}
        >
          <Zap size={16} style={{ color: "#d97020" }} />
        </div>
        <div>
          <div className="text-xs font-semibold text-primary">Analysis Time</div>
          <div className="text-xl font-bold" style={{ color: "#C05800" }}>&lt; 30s</div>
        </div>
      </div>
    ),
  },
] as const;

/* ── FloatCard — each has its own hooks for depth-based mouse parallax ── */
function FloatCard({
  card,
  springX,
  springY,
}: {
  card: (typeof FLOAT_CARDS)[number];
  springX: MotionValue<number>;
  springY: MotionValue<number>;
}) {
  const mx = useTransform(springX, (v) => v * card.depth);
  const my = useTransform(springY, (v) => v * card.depth);

  return (
    <motion.div
      className={`absolute ${card.hidden}`}
      style={{
        ...card.pos,
        x: mx,
        y: my,
      }}
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: card.delay + 1.5, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* Inner — float up/down animation lives here independently */}
      <motion.div
        className="glass-md rounded-2xl"
        style={{
          border: "1px solid rgba(255,255,255,0.08)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.04) inset",
        }}
        animate={{ y: [0, -12, 0] }}
        transition={{
          delay: card.delay + 2.0,
          duration: card.duration,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      >
        {card.content}
      </motion.div>
    </motion.div>
  );
}

/* ── Background orb — moves opposite to mouse for depth illusion ── */
function ParallaxOrb({
  springX,
  springY,
  depth,
  style,
  className,
}: {
  springX: MotionValue<number>;
  springY: MotionValue<number>;
  depth: number;
  style: React.CSSProperties;
  className?: string;
}) {
  const x = useTransform(springX, (v) => -v * depth);
  const y = useTransform(springY, (v) => -v * depth);
  return (
    <motion.div
      className={`absolute rounded-full pointer-events-none ${className ?? ""}`}
      style={{ x, y, ...style }}
    />
  );
}

export default function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);

  /* ── Scroll parallax on the main content block ── */
  const { scrollYProgress } = useScroll({ target: containerRef, offset: ["start start", "end start"] });
  const contentY = useTransform(scrollYProgress, [0, 1], ["0%", "30%"]);
  const contentOpacity = useTransform(scrollYProgress, [0, 0.65], [1, 0]);

  /* ── Mouse parallax ── */
  const rawMouseX = useMotionValue(0);
  const rawMouseY = useMotionValue(0);
  const springX = useSpring(rawMouseX, { stiffness: 55, damping: 22, mass: 0.8 });
  const springY = useSpring(rawMouseY, { stiffness: 55, damping: 22, mass: 0.8 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    rawMouseX.set(e.clientX - rect.left - rect.width / 2);
    rawMouseY.set(e.clientY - rect.top - rect.height / 2);
  };

  const handleMouseLeave = () => {
    rawMouseX.set(0);
    rawMouseY.set(0);
  };

  /* ── Headline text subtle mouse offset ── */
  const textX = useTransform(springX, (v) => v * 0.006);
  const textY = useTransform(springY, (v) => v * 0.006);

  const [variantIdx, setVariantIdx] = useState(0);
  useEffect(() => { setVariantIdx(pickVariant()); }, []);
  const variant = HERO_VARIANTS[variantIdx];

  return (
    <section
      ref={containerRef}
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden pt-20"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {/* ── Spotlight (brand color) ── */}
      <Spotlight color="rgba(192,88,0,0.10)" size={900} />

      {/* ── Neural network background ── */}
      <div className="absolute inset-0">
        <NeuralNetworkCanvas />
      </div>

      {/* ── Ambient gradient orbs (react to mouse — opposite direction) ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <ParallaxOrb
          springX={springX}
          springY={springY}
          depth={0.008}
          className="w-[900px] h-[700px] blur-[140px] animate-aurora-1"
          style={{
            background: "radial-gradient(circle, rgba(192,88,0,0.12) 0%, transparent 65%)",
            top: "0%",
            left: "30%",
            transform: "translate(-50%,-40%)",
          }}
        />
        <ParallaxOrb
          springX={springX}
          springY={springY}
          depth={0.005}
          className="w-[600px] h-[500px] blur-[120px] animate-aurora-3"
          style={{
            background: "radial-gradient(circle, rgba(212,170,48,0.08) 0%, transparent 65%)",
            bottom: "5%",
            left: "45%",
            transform: "translate(-50%,40%)",
          }}
        />
        {/* Extra depth orb — deep background layer */}
        <ParallaxOrb
          springX={springX}
          springY={springY}
          depth={0.003}
          className="w-[400px] h-[400px] blur-[100px]"
          style={{
            background: "radial-gradient(circle, rgba(122,184,64,0.05) 0%, transparent 70%)",
            top: "50%",
            left: "15%",
            transform: "translate(-50%,-50%)",
          }}
        />
      </div>

      {/* ── Floating glass cards (depth-layered mouse parallax) ── */}
      {FLOAT_CARDS.map((card) => (
        <FloatCard
          key={card.id}
          card={card}
          springX={springX}
          springY={springY}
        />
      ))}

      {/* ── Main hero content (scroll + subtle mouse parallax) ── */}
      <motion.div
        className="relative z-10 text-center px-6 max-w-5xl mx-auto"
        style={{ y: contentY, opacity: contentOpacity }}
      >
        {/* Subtle mouse-driven tilt on text */}
        <motion.div style={{ x: textX, y: textY }}>
          {/* Eyebrow badge */}
          <motion.div
            className="inline-flex items-center gap-2 mb-8"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              className="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium"
              style={{
                background: "rgba(192,88,0,0.12)",
                border: "1px solid rgba(192,88,0,0.30)",
                color: "#e89848",
              }}
            >
              <Sparkles size={14} className="text-[#d97020]" />
              <span>JobSync AI — free for students &amp; job seekers</span>
            </div>
          </motion.div>

          {/* Headline */}
          <motion.h1
            className="text-5xl sm:text-6xl lg:text-8xl font-bold tracking-tight leading-[1.05] mb-6"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-primary">{variant.line1}</span>
            <br />
            <span className="gradient-cyan-blue">{variant.line2}</span>
            <br />
            <span className="text-primary">{variant.line3}</span>
          </motion.h1>

          {/* Sub-headline */}
          <motion.p
            className="text-lg sm:text-xl text-secondary max-w-2xl mx-auto mb-10 leading-relaxed"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            {variant.sub}
          </motion.p>

          {/* Trust chips */}
          <motion.div
            className="flex flex-wrap items-center justify-center gap-3 mb-10"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
          >
            {[
              { icon: <Shield size={12} />, text: "Your data is never sold or shared with advertisers" },
              { icon: <Zap size={12} />, text: "Full report in under 30 seconds" },
              { icon: <Sparkles size={12} />, text: "Free forever — no credit card" },
            ].map((chip) => (
              <div
                key={chip.text}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full"
                style={{
                  background: "rgba(192,88,0,0.07)",
                  border: "1px solid rgba(192,88,0,0.18)",
                  color: "rgba(200,168,122,0.9)",
                }}
              >
                <span style={{ color: "#d97020" }}>{chip.icon}</span>
                {chip.text}
              </div>
            ))}
          </motion.div>

          {/* CTAs */}
          <motion.div
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <Link href="/signup">
              <motion.button
                className="btn-primary text-base px-8 py-4"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                Analyze My Resume Free
                <ArrowRight size={18} />
              </motion.button>
            </Link>
            <Link href="/login">
              <motion.button
                className="btn-secondary text-base px-8 py-4"
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                See Live Demo
              </motion.button>
            </Link>
            <EngineTestButton />
          </motion.div>

          {/* Proof points */}
          <motion.div
            className="mt-12 flex flex-wrap items-center justify-center gap-6 text-xs text-muted"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.5 }}
          >
            {[
              { dot: "#7ab840", text: "Free forever — no credit card required" },
              { dot: "#C05800", text: "Your data is never sold or shared" },
              { dot: "#d4aa30", text: "Open source · built in public" },
            ].map(({ dot, text }) => (
              <div key={text} className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />
                <span>{text}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>
      </motion.div>

    </section>
  );
}

/* ── Engine sound test button ── */
function EngineTestButton() {
  const [playing, setPlaying] = useState(false);

  const handleClick = () => {
    if (playing) return;
    setPlaying(true);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) { setPlaying(false); return; }

    const ctx: AudioContext = new AudioCtx();
    ctx.resume().then(() => {
      fetch("/engine-rev.wav")
        .then((r) => r.arrayBuffer())
        .then((ab) => ctx.decodeAudioData(ab))
        .then((buf) => {
          const src = ctx.createBufferSource();
          src.buffer = buf;
          src.connect(ctx.destination);
          src.start(0);
          src.onended = () => { setPlaying(false); ctx.close(); };
        })
        .catch(() => setPlaying(false));
    });
  };

  return (
    <motion.button
      onClick={handleClick}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold
                 border border-white/10 bg-white/5 hover:bg-white/10
                 text-white/70 hover:text-white transition-all"
    >
      {playing ? (
        <>
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          Playing…
        </>
      ) : (
        <>🔊 Test Engine Sound</>
      )}
    </motion.button>
  );
}
