"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, animate, useTransform } from "framer-motion";

// ── Geometry ────────────────────────────────────────────────────────────────
const W = 480;
const H = 260;
const CX = 240;       // pivot x
const CY = 240;       // pivot y (bottom of semicircle)
const R  = 190;       // arc radius
const NEEDLE_LEN  = 182;
const NEEDLE_BASE = 14;

// Score 0 → 0° (needle pointing LEFT, at 9 o'clock)
// Score 100 → +180° CW (pointing RIGHT, at 3 o'clock, sweeping through 12)
const targetRot = (score: number) => (score / 100) * 180;

function polarPt(angleDeg: number, r: number = R) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

function arcPath(from: number, to: number, r: number = R) {
  const aFrom = 180 - (from / 100) * 180;
  const aTo   = 180 - (to   / 100) * 180;
  const s     = polarPt(aFrom, r);
  const e     = polarPt(aTo,   r);
  const span  = Math.abs(aFrom - aTo);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

const ZONES = [
  { from: 0,  to: 40,  color: "#ef4444", label: "Needs Work" },
  { from: 40, to: 65,  color: "#f59e0b", label: "Fair"       },
  { from: 65, to: 100, color: "#10b981", label: "Strong"     },
] as const;

const ALL_TICKS   = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const LABEL_TICKS = [0, 25, 50, 75, 100];

// ── Synthesised sputter for low scores ──────────────────────────────────────
function playFailedStart() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Ctx  = window.AudioContext || (window as any).webkitAudioContext;
    const ctx: AudioContext = new Ctx();
    ctx.resume().then(() => {
      [
        { delay: 0.10, dur: 0.22, peak: 62, vol: 0.22 },
        { delay: 0.50, dur: 0.18, peak: 58, vol: 0.17 },
        { delay: 0.88, dur: 0.28, peak: 70, vol: 0.20 },
        { delay: 1.34, dur: 0.48, peak: 84, vol: 0.26 },
      ].forEach(({ delay, dur, peak, vol }) => {
        const t0   = ctx.currentTime + delay;
        const osc  = ctx.createOscillator();
        const filt = ctx.createBiquadFilter();
        const gain = ctx.createGain();
        osc.type       = "sawtooth";
        filt.type      = "lowpass";
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

// ── Component ────────────────────────────────────────────────────────────────
interface SpeedometerRevealProps {
  score: number;
  analysisId: string;
  onComplete: () => void;
}

type Phase = "intro" | "revving" | "collapsing" | "done";

export function SpeedometerReveal({ score, analysisId, onComplete }: SpeedometerRevealProps) {
  const [phase, setPhase]           = useState<Phase>("intro");
  const needleRot                   = useMotionValue(0);
  const [displayScore, setDisplayScore] = useState(0);
  const soundFired                  = useRef(false);
  const audioRef                    = useRef<HTMLAudioElement | null>(null);

  // ── SVG-native rotate so pivot is always exact ──
  // rotate(angle, cx, cy) is unambiguous — no transform-origin quirks in SVG
  const needleSvgTransform = useTransform(
    needleRot,
    (r) => `rotate(${r}, ${CX}, ${CY})`
  );

  const isGood     = score >= 65;
  const scoreColor = score >= 65 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  const scoreLabel = score >= 75 ? "Excellent" : score >= 65 ? "Good" : score >= 40 ? "Fair" : "Needs Work";

  // Preload audio as soon as the overlay mounts
  useEffect(() => {
    const audio = new Audio("/engine-rev.m4a");
    audio.preload = "auto";
    audioRef.current = audio;
    return () => {
      audio.pause();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const t1 = setTimeout(() => {
      setPhase("revving");

      if (!soundFired.current) {
        soundFired.current = true;
        if (isGood) {
          // Play the real engine-rev audio
          const a = audioRef.current;
          if (a) { a.currentTime = 0; a.play().catch(() => {}); }
        } else {
          playFailedStart();
        }
      }

      const rot = targetRot(score);

      if (isGood) {
        animate(needleRot, rot, {
          duration: 2.3,
          ease: [0.16, 1, 0.3, 1],
          onUpdate: (v) => setDisplayScore(Math.round((v / 180) * 100)),
        });
      } else {
        animate(needleRot,
          [0, rot * 0.38, rot * 0.09, rot * 0.68, rot * 0.28, rot],
          {
            duration: 2.6,
            times: [0, 0.20, 0.35, 0.60, 0.73, 1],
            ease: "easeInOut",
            onUpdate: (v) => setDisplayScore(Math.round((v / 180) * 100)),
          }
        );
      }
    }, 900);

    const t2 = setTimeout(() => setPhase("collapsing"), 4200);
    const t3 = setTimeout(() => { setPhase("done"); onComplete(); }, 5000);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "done") return null;

  const fullArc = arcPath(0, 100);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center select-none"
      style={{ background: "rgba(4, 4, 10, 0.97)" }}
      animate={
        phase === "collapsing"
          ? { opacity: 0, scale: 0.25, y: -200 }
          : { opacity: 1, scale: 1,   y: 0   }
      }
      transition={{ duration: 0.75, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {/* Ambient glow */}
      <div
        className="absolute rounded-full blur-[80px] opacity-30"
        style={{
          width: 320, height: 180,
          background: `radial-gradient(ellipse, ${scoreColor}, transparent 70%)`,
        }}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1,  scale: 1    }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ overflow: "visible" }}>

          {/* Dark track */}
          <path d={fullArc} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={24} />

          {/* Red / Yellow / Green zone bands */}
          {ZONES.map((z) => (
            <g key={z.from}>
              <path
                d={arcPath(z.from, z.to)}
                fill="none" stroke={z.color} strokeWidth={28} opacity={0.12}
                style={{ filter: "blur(6px)" }}
              />
              <path
                d={arcPath(z.from, z.to)}
                fill="none" stroke={z.color} strokeWidth={20} opacity={0.55}
              />
            </g>
          ))}

          {/* Animated progress arc */}
          <motion.path
            d={fullArc}
            fill="none"
            stroke={scoreColor}
            strokeWidth={20}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 14px ${scoreColor}cc)` }}
            initial={{ pathLength: 0 }}
            animate={phase !== "intro" ? { pathLength: score / 100 } : { pathLength: 0 }}
            transition={{
              duration: isGood ? 2.3 : 2.6,
              ease: isGood ? [0.16, 1, 0.3, 1] : "easeInOut",
            }}
          />

          {/* Tick marks */}
          {ALL_TICKS.map((tick) => {
            const angle = 180 - (tick / 100) * 180;
            const major = tick % 25 === 0;
            const inner = polarPt(angle, R - 14);
            const outer = polarPt(angle, R + 10);
            return (
              <line
                key={tick}
                x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
                stroke={major ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.18)"}
                strokeWidth={major ? 2 : 1}
              />
            );
          })}

          {/* Numeric labels */}
          {LABEL_TICKS.map((tick) => {
            const angle = 180 - (tick / 100) * 180;
            const pos   = polarPt(angle, R + 28);
            return (
              <text
                key={tick}
                x={pos.x} y={pos.y}
                textAnchor="middle" dominantBaseline="middle"
                fill="rgba(148,163,184,0.7)" fontSize={12}
                fontFamily="ui-monospace, monospace"
              >
                {tick}
              </text>
            );
          })}

          {/* Zone labels */}
          {ZONES.map((z) => {
            const mid   = (z.from + z.to) / 2;
            const angle = 180 - (mid / 100) * 180;
            const pos   = polarPt(angle, R - 42);
            return (
              <text
                key={z.from}
                x={pos.x} y={pos.y}
                textAnchor="middle" dominantBaseline="middle"
                fill={z.color} fontSize={9}
                fontFamily="system-ui, sans-serif"
                opacity={0.55} fontWeight={600}
              >
                {z.label}
              </text>
            );
          })}

          {/* ── Needle — uses SVG rotate(angle, cx, cy) for exact pivot ── */}
          <motion.g transform={needleSvgTransform}>
            {/* Main stem: starts pointing LEFT from pivot */}
            <line
              x1={CX} y1={CY}
              x2={CX - NEEDLE_LEN} y2={CY}
              stroke="white"
              strokeWidth={3}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 5px white)` }}
            />
            {/* Counter-weight tail */}
            <line
              x1={CX} y1={CY}
              x2={CX + 24} y2={CY}
              stroke="white"
              strokeWidth={5}
              strokeLinecap="round"
              opacity={0.5}
            />
          </motion.g>

          {/* Hub */}
          <circle cx={CX} cy={CY} r={NEEDLE_BASE}
            fill={scoreColor}
            style={{ filter: `drop-shadow(0 0 10px ${scoreColor})` }}
          />
          <circle cx={CX} cy={CY} r={6} fill="#08080f" />
        </svg>

        {/* Score readout */}
        <motion.div
          className="flex flex-col items-center mt-[-24px] gap-2"
          initial={{ opacity: 0 }}
          animate={{ opacity: phase !== "intro" ? 1 : 0 }}
          transition={{ delay: 0.4, duration: 0.5 }}
        >
          <div
            className="text-7xl font-black tabular-nums"
            style={{ color: scoreColor, textShadow: `0 0 40px ${scoreColor}66` }}
          >
            {displayScore}
          </div>
          <div className="text-xl font-bold tracking-wide" style={{ color: scoreColor }}>
            {scoreLabel}
          </div>
          <div className="text-sm text-gray-500 tracking-widest uppercase font-medium">
            ATS Score
          </div>
        </motion.div>
      </motion.div>

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
