"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, animate } from "framer-motion";

// ── Geometry ────────────────────────────────────────────────────────────────
const W = 480;
const H = 260;
const CX = 240;       // pivot x (center of needle base)
const CY = 240;       // pivot y (near bottom so the arc has room above)
const R  = 190;       // gauge arc radius
const NEEDLE_LEN = 182; // extends close to arc face for clean alignment
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


function playSportsCar(score: number) {
  try {
    const ctx = new AudioContext();
    const t0  = ctx.currentTime + 0.15;

    // Frequency ramp: idle → scream → settle
    const idleHz  = 65;
    const peakHz  = 95 + (score / 100) * 195;   // 95–290 Hz fundamental at peak
    const rampDur = 1.9;
    const holdDur = 0.55;
    const fallDur = 0.45;
    const total   = rampDur + holdDur + fallDur;

    const master = ctx.createGain();
    master.gain.setValueAtTime(0, t0);
    master.gain.linearRampToValueAtTime(0.7, t0 + 0.06);
    master.gain.setValueAtTime(0.7, t0 + rampDur + holdDur);
    master.gain.exponentialRampToValueAtTime(0.001, t0 + total);
    master.connect(ctx.destination);

    // ── Layer 1: Deep bass rumble (fundamental) ──
    const rumble = ctx.createOscillator();
    const rumbleFilter = ctx.createBiquadFilter();
    const rumbleGain   = ctx.createGain();
    rumble.type = "sawtooth";
    rumbleFilter.type = "lowpass";
    rumbleFilter.frequency.setValueAtTime(600, t0);
    rumbleFilter.frequency.linearRampToValueAtTime(2200, t0 + rampDur);
    rumbleFilter.Q.value = 1.8;

    rumble.frequency.setValueAtTime(idleHz, t0);
    rumble.frequency.exponentialRampToValueAtTime(peakHz, t0 + rampDur);
    rumble.frequency.setValueAtTime(peakHz, t0 + rampDur + holdDur);
    rumble.frequency.exponentialRampToValueAtTime(idleHz * 1.3, t0 + total);

    rumbleGain.gain.setValueAtTime(0.55, t0);
    rumble.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(master);
    rumble.start(t0); rumble.stop(t0 + total + 0.1);

    // ── Layer 2: Mid growl — 2nd harmonic with slight detune for "bite" ──
    const growl = ctx.createOscillator();
    const growlFilter = ctx.createBiquadFilter();
    const growlGain   = ctx.createGain();
    growl.type = "sawtooth";
    growl.detune.value = 8; // slight detune adds organic warmth
    growlFilter.type = "bandpass";
    growlFilter.frequency.setValueAtTime(1400, t0);
    growlFilter.frequency.linearRampToValueAtTime(5800, t0 + rampDur);
    growlFilter.Q.value = 0.7;

    growl.frequency.setValueAtTime(idleHz * 2, t0);
    growl.frequency.exponentialRampToValueAtTime(peakHz * 2, t0 + rampDur);
    growl.frequency.setValueAtTime(peakHz * 2, t0 + rampDur + holdDur);
    growl.frequency.exponentialRampToValueAtTime(idleHz * 2.6, t0 + total);

    growlGain.gain.setValueAtTime(0.28, t0);
    growlGain.gain.linearRampToValueAtTime(0.38, t0 + rampDur);
    growl.connect(growlFilter);
    growlFilter.connect(growlGain);
    growlGain.connect(master);
    growl.start(t0); growl.stop(t0 + total + 0.1);

    // ── Layer 3: Exhaust "whine" — high-pitched sine (intake/exhaust resonance) ──
    const whine = ctx.createOscillator();
    const whineFilter = ctx.createBiquadFilter();
    const whineGain   = ctx.createGain();
    whine.type = "sine";
    whineFilter.type = "highpass";
    whineFilter.frequency.value = 800;

    whine.frequency.setValueAtTime(idleHz * 3.2, t0);
    whine.frequency.exponentialRampToValueAtTime(peakHz * 3.8, t0 + rampDur);
    whine.frequency.setValueAtTime(peakHz * 3.8, t0 + rampDur + holdDur);
    whine.frequency.exponentialRampToValueAtTime(idleHz * 4, t0 + total);

    whineGain.gain.setValueAtTime(0, t0 + 0.4); // whine comes in as RPM rises
    whineGain.gain.linearRampToValueAtTime(0.18, t0 + rampDur);
    whineGain.gain.setValueAtTime(0.18, t0 + rampDur + holdDur);
    whineGain.gain.exponentialRampToValueAtTime(0.001, t0 + total);
    whine.connect(whineFilter);
    whineFilter.connect(whineGain);
    whineGain.connect(master);
    whine.start(t0); whine.stop(t0 + total + 0.1);

    // ── Layer 4: Cylinder burst pulses (amplitude modulation for "brap" texture) ──
    const pulse = ctx.createOscillator();
    const pulseGain = ctx.createGain();
    pulse.type = "square";
    pulse.frequency.setValueAtTime(idleHz * 4, t0); // ~4 firing events per cycle
    pulse.frequency.exponentialRampToValueAtTime(peakHz * 4, t0 + rampDur);

    pulseGain.gain.setValueAtTime(0.06, t0);
    pulseGain.gain.linearRampToValueAtTime(0.10, t0 + rampDur);
    pulseGain.gain.exponentialRampToValueAtTime(0.001, t0 + total);
    pulse.connect(pulseGain);
    pulseGain.connect(master);
    pulse.start(t0); pulse.stop(t0 + total + 0.1);

    setTimeout(() => ctx.close(), (total + 1) * 1000);
  } catch { /* Safari / blocked — silent fallback */ }
}

function playFailedStart() {
  try {
    const ctx = new AudioContext();
    [
      { delay: 0.10, dur: 0.22, peak: 62,  vol: 0.22 },
      { delay: 0.50, dur: 0.18, peak: 58,  vol: 0.17 },
      { delay: 0.88, dur: 0.28, peak: 70,  vol: 0.20 },
      { delay: 1.34, dur: 0.48, peak: 84,  vol: 0.26 }, // almost catches
    ].forEach(({ delay, dur, peak, vol }) => {
      const t0 = ctx.currentTime + delay;
      const osc  = ctx.createOscillator();
      const filt = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      osc.type  = "sawtooth";
      filt.type = "lowpass";
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
        if (isGood) playSportsCar(score);
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
          {/* Dark background track */}
          <path
            d={fullArc}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth={24}
          />

          {/* Zone bands — vivid red / yellow / green */}
          {ZONES.map((z) => (
            <g key={z.from}>
              {/* Glow layer */}
              <path
                d={arcPath(z.from, z.to)}
                fill="none"
                stroke={z.color}
                strokeWidth={28}
                opacity={0.12}
                style={{ filter: `blur(6px)` }}
              />
              {/* Solid colour band */}
              <path
                d={arcPath(z.from, z.to)}
                fill="none"
                stroke={z.color}
                strokeWidth={20}
                opacity={0.55}
              />
            </g>
          ))}

          {/* Active progress arc — animated via pathLength */}
          <motion.path
            d={fullArc}
            fill="none"
            stroke={scoreColor}
            strokeWidth={20}
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 14px ${scoreColor}cc)` }}
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
