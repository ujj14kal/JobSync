"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";

// ── Geometry ──────────────────────────────────────────────────────────────────
const W            = 560;
const H            = 320;
const CX           = 280;   // pivot X
const CY           = 296;   // pivot Y  (very close to bottom → full semicircle)
const R            = 235;   // arc radius
const BAND_W       = 30;    // coloured zone stroke-width
const NEEDLE_LEN   = 218;   // tip nearly reaches arc face
const NEEDLE_BASE  = 16;    // hub radius
const NUM_R        = R - 44; // radius for number labels (inside arc)
const LABEL_R      = R + 44; // radius for zone labels (outside arc)
const TICK_MAJOR_I = R - 18; // major tick inner
const TICK_MAJOR_O = R + 18; // major tick outer
const TICK_MINOR_I = R -  9; // minor tick inner
const TICK_MINOR_O = R +  9; // minor tick outer

// ── Maths helpers ─────────────────────────────────────────────────────────────
// CSS clockwise: score 0 = LEFT (0°), score 100 = RIGHT (+180°)
const targetRot = (score: number) => (score / 100) * 180;

function polarPt(angleDeg: number, r: number = R) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

// SVG arc path (half-circle) left→right through top
function arcPath(from: number, to: number, r: number = R) {
  const aFrom = 180 - (from / 100) * 180;
  const aTo   = 180 - (to   / 100) * 180;
  const s = polarPt(aFrom, r);
  const e = polarPt(aTo,   r);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${Math.abs(aFrom - aTo) > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

// ── Zones ─────────────────────────────────────────────────────────────────────
const ZONES = [
  { from: 0,  to: 40,  color: "#ef4444", label: "Needs Work" },
  { from: 40, to: 65,  color: "#f59e0b", label: "Fair"       },
  { from: 65, to: 100, color: "#10b981", label: "Strong"     },
] as const;

// ── Tick / label sets ─────────────────────────────────────────────────────────
const MAJOR_TICKS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const MINOR_TICKS = [5, 15, 25, 35, 45, 55, 65, 75, 85, 95];
const NUM_LABELS  = [0, 20, 40, 60, 80, 100];

// ── Low-score sputter (synthesised) ───────────────────────────────────────────
function playFailedStart() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new Ctx();
    ctx.resume().then(() => {
      [
        { delay: 0.10, dur: 0.22, peak: 62, vol: 0.22 },
        { delay: 0.50, dur: 0.18, peak: 58, vol: 0.17 },
        { delay: 0.88, dur: 0.28, peak: 70, vol: 0.20 },
        { delay: 1.34, dur: 0.48, peak: 84, vol: 0.26 },
      ].forEach(({ delay, dur, peak, vol }) => {
        const t0 = ctx.currentTime + delay;
        const osc  = ctx.createOscillator();
        const filt = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type = "sawtooth"; filt.type = "lowpass";
        filt.frequency.setValueAtTime(350, t0);
        filt.frequency.linearRampToValueAtTime(900, t0 + dur * 0.4);
        filt.frequency.exponentialRampToValueAtTime(150, t0 + dur);
        osc.frequency.setValueAtTime(48, t0);
        osc.frequency.exponentialRampToValueAtTime(peak, t0 + dur * 0.4);
        osc.frequency.exponentialRampToValueAtTime(32, t0 + dur);
        gain.gain.setValueAtTime(0, t0);
        gain.gain.linearRampToValueAtTime(vol, t0 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
        osc.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
        osc.start(t0); osc.stop(t0 + dur + 0.08);
      });
      setTimeout(() => ctx.close(), 5000);
    });
  } catch { /* silent */ }
}

// ── Component ─────────────────────────────────────────────────────────────────
interface SpeedometerRevealProps {
  score: number;
  analysisId: string;
  onComplete: () => void;
}

// "gate" = tap-to-reveal screen (user gesture happens here → audio unlocks)
type Phase = "gate" | "intro" | "revving" | "collapsing" | "done";

export function SpeedometerReveal({ score, analysisId, onComplete }: SpeedometerRevealProps) {
  const [phase, setPhase]               = useState<Phase>("gate");
  const needleRot                       = useMotionValue(0);
  const [displayScore, setDisplayScore] = useState(0);
  const needleRef  = useRef<SVGGElement>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const isGood     = score >= 65;
  const scoreColor = score >= 65 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  const scoreLabel = score >= 75 ? "Excellent" : score >= 65 ? "Good" : score >= 40 ? "Fair" : "Needs Work";

  // ── Imperative needle ─────────────────────────────────────────────────────
  useEffect(() => {
    const sync = (v: number) =>
      needleRef.current?.setAttribute("transform", `rotate(${v} ${CX} ${CY})`);
    sync(0);
    return needleRot.on("change", sync);
  }, [needleRot]);

  // ── Tap-to-reveal handler — THIS is the user gesture ─────────────────────
  const handleReveal = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (AudioCtx) {
      const ctx: AudioContext = new AudioCtx();
      audioCtxRef.current = ctx;
      // resume() inside click handler = always unlocked regardless of score
      ctx.resume().then(() => {
        fetch("/engine-rev.wav")
          .then((r) => r.arrayBuffer())
          .then((ab) => ctx.decodeAudioData(ab))
          .then((buf) => {
            const src = ctx.createBufferSource();
            src.buffer = buf;
            src.connect(ctx.destination);
            src.start(0); // play immediately when decoded — no fragile timing
          })
          .catch(() => {});
      });
    }
    setPhase("intro");
  };

  useEffect(() => {
    return () => { audioCtxRef.current?.close().catch(() => {}); };
  }, []);

  // ── Main animation sequence — fires once phase leaves "gate" ────────────
  useEffect(() => {
    if (phase !== "intro") return; // wait until gate is tapped

    const INTRO_DELAY = 900;
    const ANIM_DUR    = 5.4;
    const animTimes   = [0, 0.15, 0.32, 0.54, 0.70, 0.87, 1.0];

    const t1 = setTimeout(() => {
      setPhase("revving");

      if (isGood) {
        const peak1 = Math.max(55, Math.min(score * 0.72, 84));
        const dip1  = Math.max(6,  score * 0.07);
        const peak2 = Math.max(74, Math.min(score * 0.92 + 6, 97));
        const dip2  = Math.max(10, score * 0.13);
        const peak3 = Math.min(score + 6, 100);
        const keyframes = [0, peak1, dip1, peak2, dip2, peak3, score].map(targetRot);
        animate(needleRot, keyframes, {
          duration: ANIM_DUR,
          times: animTimes,
          ease: ["easeOut", "easeIn", "easeOut", "easeIn", "easeOut", [0.16, 1, 0.3, 1]],
          onUpdate: (v) => setDisplayScore(Math.max(0, Math.min(100, Math.round((v / 180) * 100)))),
        });
      } else {
        const rot = targetRot(score);
        animate(needleRot,
          [0, rot * 0.40, rot * 0.08, rot * 0.72, rot * 0.28, rot],
          {
            duration: 2.6,
            times: [0, 0.20, 0.36, 0.62, 0.76, 1],
            ease: "easeInOut",
            onUpdate: (v) => setDisplayScore(Math.max(0, Math.min(100, Math.round((v / 180) * 100)))),
          }
        );
      }
    }, INTRO_DELAY);

    const t2 = setTimeout(() => setPhase("collapsing"), INTRO_DELAY + 7000);
    const t3 = setTimeout(() => { setPhase("done"); onComplete(); }, INTRO_DELAY + 7800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  if (phase === "done") return null;

  const fullArc = arcPath(0, 100);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center select-none"
      style={{ background: "rgba(4, 4, 10, 0.97)" }}
      animate={
        phase === "collapsing"
          ? { opacity: 0, scale: 0.25, y: -220 }
          : { opacity: 1, scale: 1,   y: 0    }
      }
      transition={{ duration: 0.75, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {/* ── Gate screen — tap here to get a fresh user gesture for audio ── */}
      {phase === "gate" && (
        <motion.div
          className="flex flex-col items-center gap-8"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1,  scale: 1  }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="text-center space-y-2">
            <div className="text-slate-400 text-sm tracking-widest uppercase">Analysis Complete</div>
            <div className="text-white text-3xl font-bold">Your ATS Score is Ready</div>
          </div>

          <motion.button
            onClick={handleReveal}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="relative px-12 py-5 rounded-2xl text-xl font-bold text-white
                       bg-gradient-to-r from-emerald-500 to-cyan-500 shadow-2xl
                       shadow-emerald-500/30 cursor-pointer"
          >
            {/* pulse ring */}
            <span className="absolute inset-0 rounded-2xl animate-ping bg-emerald-400 opacity-20" />
            🏎️ &nbsp;Reveal My Score
          </motion.button>

          <div className="text-slate-600 text-xs">Tap to start the reveal</div>
        </motion.div>
      )}

      {/* Ambient colour glow */}
      {phase !== "gate" && (
        <div
          className="absolute rounded-full blur-[90px] opacity-25 pointer-events-none"
          style={{
            width: 400, height: 220,
            background: `radial-gradient(ellipse, ${scoreColor} 0%, transparent 70%)`,
          }}
        />
      )}

      <motion.div
        initial={{ opacity: 0, scale: 0.88 }}
        animate={{ opacity: phase !== "gate" ? 1 : 0, scale: 1 }}
        transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col items-center"
      >
        {/* ── SVG gauge ── */}
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ overflow: "visible" }}
        >
          {/* ── Full-arc dark track ── */}
          <path
            d={fullArc}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={BAND_W + 6}
            strokeLinecap="butt"
          />

          {/* ── Coloured zone bands ── */}
          {ZONES.map((z) => (
            <g key={z.from}>
              {/* outer glow */}
              <path
                d={arcPath(z.from, z.to)}
                fill="none" stroke={z.color}
                strokeWidth={BAND_W + 14} opacity={0.10}
                style={{ filter: "blur(8px)" }}
              />
              {/* solid band */}
              <path
                d={arcPath(z.from, z.to)}
                fill="none" stroke={z.color}
                strokeWidth={BAND_W} opacity={0.65}
                strokeLinecap="butt"
              />
            </g>
          ))}

          {/* ── Animated score-fill arc (on top of zones) ── */}
          <motion.path
            d={fullArc}
            fill="none"
            stroke={scoreColor}
            strokeWidth={BAND_W - 4}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 12px ${scoreColor}bb)` }}
            initial={{ pathLength: 0 }}
            animate={phase !== "intro" ? { pathLength: score / 100 } : { pathLength: 0 }}
            transition={{
              duration: isGood ? 5.4 : 2.6,
              ease: isGood ? [0.16, 1, 0.3, 1] : "easeInOut",
            }}
          />

          {/* ── Zone boundary dividers ── */}
          {[40, 65].map((score) => {
            const angle = 180 - (score / 100) * 180;
            const inner = polarPt(angle, R - BAND_W / 2 - 2);
            const outer = polarPt(angle, R + BAND_W / 2 + 2);
            return (
              <line
                key={score}
                x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
                stroke="rgba(0,0,0,0.7)" strokeWidth={2.5}
              />
            );
          })}

          {/* ── Minor ticks ── */}
          {MINOR_TICKS.map((tick) => {
            const angle = 180 - (tick / 100) * 180;
            const i = polarPt(angle, TICK_MINOR_I);
            const o = polarPt(angle, TICK_MINOR_O);
            return (
              <line
                key={tick}
                x1={i.x} y1={i.y} x2={o.x} y2={o.y}
                stroke="rgba(255,255,255,0.3)" strokeWidth={1}
              />
            );
          })}

          {/* ── Major ticks ── */}
          {MAJOR_TICKS.map((tick) => {
            const angle = 180 - (tick / 100) * 180;
            const i = polarPt(angle, TICK_MAJOR_I);
            const o = polarPt(angle, TICK_MAJOR_O);
            return (
              <line
                key={tick}
                x1={i.x} y1={i.y} x2={o.x} y2={o.y}
                stroke="rgba(255,255,255,0.65)" strokeWidth={2}
              />
            );
          })}

          {/* ── Number labels (inside arc) ── */}
          {NUM_LABELS.map((tick) => {
            const angle = 180 - (tick / 100) * 180;
            const pos   = polarPt(angle, NUM_R);
            return (
              <text
                key={tick}
                x={pos.x} y={pos.y}
                textAnchor="middle" dominantBaseline="middle"
                fill="rgba(226,232,240,0.85)"
                fontSize={13}
                fontWeight={600}
                fontFamily="ui-monospace, monospace"
              >
                {tick}
              </text>
            );
          })}

          {/* ── Zone labels (outside arc) ── */}
          {ZONES.map((z) => {
            const mid   = (z.from + z.to) / 2;
            const angle = 180 - (mid / 100) * 180;
            const pos   = polarPt(angle, LABEL_R);
            return (
              <text
                key={z.from}
                x={pos.x} y={pos.y}
                textAnchor="middle" dominantBaseline="middle"
                fill={z.color}
                fontSize={11}
                fontWeight={700}
                fontFamily="system-ui, sans-serif"
                opacity={0.8}
              >
                {z.label}
              </text>
            );
          })}

          {/* ── Needle: imperative SVG transform → zero-quirk pivot ── */}
          {/* Wrapper g keeps needle drawn LEFT; parent rotate() moves it */}
          <g ref={needleRef}>
            {/* Kite/diamond needle shape — wider at hub, tapers to tip */}
            <polygon
              points={`
                ${CX - NEEDLE_LEN},${CY}
                ${CX - 10},${CY - 6}
                ${CX + 24},${CY - 3}
                ${CX + 24},${CY + 3}
                ${CX - 10},${CY + 6}
              `}
              fill="white"
              opacity={0.95}
              style={{ filter: "drop-shadow(0 0 5px rgba(255,255,255,0.7))" }}
            />
          </g>

          {/* ── Hub ── */}
          <circle cx={CX} cy={CY} r={NEEDLE_BASE + 4}
            fill="rgba(0,0,0,0.6)"
          />
          <circle cx={CX} cy={CY} r={NEEDLE_BASE}
            fill={scoreColor}
            style={{ filter: `drop-shadow(0 0 12px ${scoreColor})` }}
          />
          <circle cx={CX} cy={CY} r={7} fill="#0a0a12" />
        </svg>

        {/* ── Score readout ── */}
        <motion.div
          className="flex flex-col items-center gap-1"
          style={{ marginTop: -28 }}
          initial={{ opacity: 0 }}
          animate={{ opacity: phase !== "intro" ? 1 : 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <div
            className="text-8xl font-black tabular-nums leading-none"
            style={{ color: scoreColor, textShadow: `0 0 50px ${scoreColor}55` }}
          >
            {displayScore}
          </div>
          <div
            className="text-xl font-bold tracking-widest uppercase"
            style={{ color: scoreColor, opacity: 0.9 }}
          >
            {scoreLabel}
          </div>
          <div className="text-xs text-slate-500 tracking-[0.25em] uppercase mt-1">
            ATS Score
          </div>
        </motion.div>
      </motion.div>

      {/* Skip */}
      <motion.button
        className="absolute bottom-8 right-8 text-xs text-gray-600 hover:text-gray-400 transition-colors"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        onClick={onComplete}
      >
        Skip →
      </motion.button>
    </motion.div>
  );
}
