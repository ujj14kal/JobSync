"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";

// ── Geometry ────────────────────────────────────────────────────────────────
const W = 480;
const H = 260;
const CX = 240;       // pivot x (center of needle base)
const CY = 240;       // pivot y (near bottom so the arc has room above)
const R  = 190;       // gauge arc radius
const NEEDLE_LEN = 162;
const NEEDLE_BASE = 14; // small base indicator radius

// Score 0 → angle 180° (pointing left)
// Score 100 → angle 0° (pointing right)
// Needle drawn pointing LEFT, rotated by -(score/100)*180 degrees
const targetRot = (score: number) => -(score / 100) * 180;

function polarPt(angleDeg: number, r: number = R) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: CX + r * Math.cos(rad), y: CY - r * Math.sin(rad) };
}

// Arc from score `from` to score `to` (both going left→right through top)
function arcPath(from: number, to: number, r: number = R) {
  const aFrom = 180 - (from / 100) * 180;
  const aTo   = 180 - (to   / 100) * 180;
  const s = polarPt(aFrom, r);
  const e = polarPt(aTo,   r);
  const span = Math.abs(aFrom - aTo);
  return `M ${s.x} ${s.y} A ${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${e.x} ${e.y}`;
}

const ZONES = [
  { from: 0,  to: 40,  color: "#ef4444", label: "Needs Work" },
  { from: 40, to: 65,  color: "#f59e0b", label: "Fair"       },
  { from: 65, to: 100, color: "#10b981", label: "Strong"     },
] as const;

const ALL_TICKS  = [0,10,20,30,40,50,60,70,80,90,100];
const LABEL_TICKS = [0, 25, 50, 75, 100];

// ── Engine Sounds ────────────────────────────────────────────────────────────
function playFerrariRev(score: number) {
  try {
    const ctx = new AudioContext();
    const revs = score >= 80 ? 3 : 2;

    for (let i = 0; i < revs; i++) {
      const t0 = ctx.currentTime + 0.25 + i * 0.82;
      const baseHz = 72 + i * 22;
      const peakHz = 155 + (score / 100) * 130 + i * 45;

      // Main sawtooth (engine fundamental)
      const osc  = ctx.createOscillator();
      const filt = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type  = "sawtooth";
      filt.type = "lowpass";
      filt.frequency.value = 900 + i * 180;
      filt.Q.value = 1.2;

      osc.frequency.setValueAtTime(baseHz, t0);
      osc.frequency.exponentialRampToValueAtTime(peakHz, t0 + 0.42);
      osc.frequency.exponentialRampToValueAtTime(baseHz * 1.15, t0 + 0.66);

      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(0.30, t0 + 0.04);
      gain.gain.linearRampToValueAtTime(0.34, t0 + 0.42);
      gain.gain.linearRampToValueAtTime(0,    t0 + 0.70);

      osc.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + 0.75);

      // Second harmonic for richness
      const osc2  = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "sawtooth";
      osc2.frequency.setValueAtTime(baseHz * 2.4, t0);
      osc2.frequency.exponentialRampToValueAtTime(peakHz * 2.4, t0 + 0.42);
      osc2.frequency.exponentialRampToValueAtTime(baseHz * 2.4, t0 + 0.66);
      gain2.gain.setValueAtTime(0, t0);
      gain2.gain.linearRampToValueAtTime(0.08, t0 + 0.04);
      gain2.gain.linearRampToValueAtTime(0,    t0 + 0.70);
      osc2.connect(gain2); gain2.connect(ctx.destination);
      osc2.start(t0); osc2.stop(t0 + 0.75);
    }
    setTimeout(() => ctx.close(), 6000);
  } catch { /* Safari / blocked — silent fallback */ }
}

function playFailedStart() {
  try {
    const ctx = new AudioContext();
    // 4 attempts that sputter and die
    [
      { delay: 0.10, dur: 0.20, peak: 68,  vol: 0.20 },
      { delay: 0.48, dur: 0.18, peak: 64,  vol: 0.16 },
      { delay: 0.84, dur: 0.26, peak: 74,  vol: 0.19 },
      { delay: 1.28, dur: 0.42, peak: 88,  vol: 0.24 }, // almost catches
    ].forEach(({ delay, dur, peak, vol }) => {
      const t0 = ctx.currentTime + delay;
      const osc  = ctx.createOscillator();
      const filt = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type  = "sawtooth";
      filt.type = "lowpass";
      filt.frequency.value = 380;

      osc.frequency.setValueAtTime(50, t0);
      osc.frequency.exponentialRampToValueAtTime(peak, t0 + dur * 0.4);
      osc.frequency.exponentialRampToValueAtTime(36, t0 + dur); // engine dies

      gain.gain.setValueAtTime(0, t0);
      gain.gain.linearRampToValueAtTime(vol, t0 + 0.03);
      gain.gain.linearRampToValueAtTime(0,   t0 + dur);

      osc.connect(filt); filt.connect(gain); gain.connect(ctx.destination);
      osc.start(t0); osc.stop(t0 + dur + 0.06);
    });
    setTimeout(() => ctx.close(), 5000);
  } catch { /* silent fallback */ }
}

// ── Component ────────────────────────────────────────────────────────────────
interface SpeedometerRevealProps {
  score: number;
  analysisId: string;
  onComplete: () => void;
}

type Phase = "intro" | "revving" | "collapsing" | "done";

export function SpeedometerReveal({ score, analysisId, onComplete }: SpeedometerRevealProps) {
  const [phase, setPhase] = useState<Phase>("intro");
  const needleRot = useMotionValue(0);
  const [displayScore, setDisplayScore] = useState(0);
  const soundFired = useRef(false);

  const isGood     = score >= 65;
  const scoreColor = score >= 65 ? "#10b981" : score >= 40 ? "#f59e0b" : "#ef4444";
  const scoreLabel = score >= 75 ? "Excellent" : score >= 65 ? "Good" : score >= 40 ? "Fair" : "Needs Work";

  useEffect(() => {
    // Phase 1 → 2: reveal the gauge face (0.9s), then rev
    const t1 = setTimeout(() => {
      setPhase("revving");

      if (!soundFired.current) {
        soundFired.current = true;
        if (isGood) playFerrariRev(score);
        else        playFailedStart();
      }

      const rot = targetRot(score);

      if (isGood) {
        animate(needleRot, rot, {
          duration: 2.3,
          ease: [0.16, 1, 0.3, 1],
          onUpdate: (v) => setDisplayScore(Math.round(Math.abs(v / 180) * 100)),
        });
      } else {
        // Stutter animation
        animate(needleRot,
          [0, rot * 0.38, rot * 0.09, rot * 0.68, rot * 0.28, rot],
          {
            duration: 2.6,
            times: [0, 0.20, 0.35, 0.60, 0.73, 1],
            ease: "easeInOut",
            onUpdate: (v) => setDisplayScore(Math.round(Math.abs(v / 180) * 100)),
          }
        );
      }
    }, 900);

    // Phase 2 → 3: collapse after showing the score
    const t2 = setTimeout(() => {
      setPhase("collapsing");
    }, 4200);

    // Phase 3 → done: unmount
    const t3 = setTimeout(() => {
      setPhase("done");
      onComplete();
    }, 5000);

    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === "done") return null;

  const fullArc  = arcPath(0, 100);

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center select-none"
      style={{ background: "rgba(4, 4, 10, 0.97)" }}
      animate={
        phase === "collapsing"
          ? { opacity: 0, scale: 0.25, y: -200 }
          : { opacity: 1, scale: 1, y: 0 }
      }
      transition={{ duration: 0.75, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {/* ── Ambient glow behind gauge ── */}
      <div
        className="absolute rounded-full blur-[80px] opacity-30"
        style={{
          width: 320, height: 180,
          background: `radial-gradient(ellipse, ${scoreColor}, transparent 70%)`,
        }}
      />

      {/* ── Speedometer SVG ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.85 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <svg
          width={W}
          height={H}
          viewBox={`0 0 ${W} ${H}`}
          style={{ overflow: "visible" }}
        >
          {/* Grey background track */}
          <path
            d={fullArc}
            fill="none"
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={22}
          />

          {/* Zone bands (dim) */}
          {ZONES.map((z) => (
            <path
              key={z.from}
              d={arcPath(z.from, z.to)}
              fill="none"
              stroke={z.color}
              strokeWidth={22}
              opacity={0.18}
            />
          ))}

          {/* Active progress arc — animated via pathLength */}
          <motion.path
            d={fullArc}
            fill="none"
            stroke={scoreColor}
            strokeWidth={22}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 10px ${scoreColor}aa)` }}
            initial={{ pathLength: 0 }}
            animate={phase !== "intro" ? { pathLength: score / 100 } : { pathLength: 0 }}
            transition={{ duration: isGood ? 2.3 : 2.6, ease: isGood ? [0.16, 1, 0.3, 1] : "easeInOut", delay: 0 }}
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
                x1={inner.x} y1={inner.y}
                x2={outer.x} y2={outer.y}
                stroke={major ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.18)"}
                strokeWidth={major ? 2 : 1}
              />
            );
          })}

          {/* Score labels */}
          {LABEL_TICKS.map((tick) => {
            const angle = 180 - (tick / 100) * 180;
            const pos   = polarPt(angle, R + 28);
            return (
              <text
                key={tick}
                x={pos.x} y={pos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="rgba(148,163,184,0.7)"
                fontSize={12}
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
                textAnchor="middle"
                dominantBaseline="middle"
                fill={z.color}
                fontSize={9}
                fontFamily="system-ui, sans-serif"
                opacity={0.55}
                fontWeight={600}
              >
                {z.label}
              </text>
            );
          })}

          {/* ── Needle (rotates from pivot at CX, CY) ── */}
          <motion.g
            style={{
              transformOrigin: `${CX}px ${CY}px`,
              rotate: needleRot,
            }}
          >
            {/* Needle stem */}
            <line
              x1={CX} y1={CY}
              x2={CX - NEEDLE_LEN} y2={CY}
              stroke={scoreColor}
              strokeWidth={3.5}
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 6px ${scoreColor})` }}
            />
            {/* Counter-weight (small tail) */}
            <line
              x1={CX} y1={CY}
              x2={CX + 22} y2={CY}
              stroke={scoreColor}
              strokeWidth={5}
              strokeLinecap="round"
              opacity={0.6}
            />
          </motion.g>

          {/* Center hub */}
          <circle
            cx={CX} cy={CY} r={NEEDLE_BASE}
            fill={scoreColor}
            style={{ filter: `drop-shadow(0 0 10px ${scoreColor})` }}
          />
          <circle cx={CX} cy={CY} r={6} fill="#08080f" />
        </svg>

        {/* ── Score number (below gauge) ── */}
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
          <div
            className="text-xl font-bold tracking-wide"
            style={{ color: scoreColor }}
          >
            {scoreLabel}
          </div>
          <div className="text-sm text-gray-500 tracking-widest uppercase font-medium">
            ATS Score
          </div>
        </motion.div>
      </motion.div>

      {/* Skip hint */}
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
