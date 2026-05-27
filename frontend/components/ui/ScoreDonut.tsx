"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";

interface ScoreSegment {
  label: string;
  value: number;       // 0-100
  color: string;       // CSS color or gradient id
  shortLabel?: string;
}

interface ScoreDonutProps {
  segments: ScoreSegment[];
  overallScore: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  showLegend?: boolean;
  showLabel?: boolean;
  animationDelay?: number;
}

// Convert score 0-100 + accumulated offset to SVG arc path
function getArcPath(
  cx: number,
  cy: number,
  r: number,
  startAngle: number,
  endAngle: number
): string {
  const toRad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const x1 = cx + r * Math.cos(toRad(startAngle));
  const y1 = cy + r * Math.sin(toRad(startAngle));
  const x2 = cx + r * Math.cos(toRad(endAngle));
  const y2 = cy + r * Math.sin(toRad(endAngle));
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`;
}

// Animated counter that counts up from 0
function AnimatedNumber({ value, duration = 1.4 }: { value: number; duration?: number }) {
  const motionValue = useMotionValue(0);
  const rounded = useTransform(motionValue, (v) => Math.round(v));
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const unsubscribe = rounded.on("change", setDisplay);
    return unsubscribe;
  }, [rounded]);

  useEffect(() => {
    const controls = animate(motionValue, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
    });
    return controls.stop;
  }, [value, duration, motionValue]);

  return <>{display}</>;
}

const SEGMENT_COLORS: Record<string, { stroke: string; glow: string; bg: string }> = {
  blue:   { stroke: "#3b82f6", glow: "rgba(59,130,246,0.5)",  bg: "rgba(59,130,246,0.1)" },
  purple: { stroke: "#8b5cf6", glow: "rgba(139,92,246,0.5)", bg: "rgba(139,92,246,0.1)" },
  cyan:   { stroke: "#06b6d4", glow: "rgba(6,182,212,0.5)",  bg: "rgba(6,182,212,0.1)" },
  green:  { stroke: "#10b981", glow: "rgba(16,185,129,0.5)", bg: "rgba(16,185,129,0.1)" },
  amber:  { stroke: "#f59e0b", glow: "rgba(245,158,11,0.5)", bg: "rgba(245,158,11,0.1)" },
  rose:   { stroke: "#f43f5e", glow: "rgba(244,63,94,0.5)",  bg: "rgba(244,63,94,0.1)" },
};

const COLOR_SEQUENCE = ["blue", "purple", "cyan", "green", "amber"] as const;

export default function ScoreDonut({
  segments,
  overallScore,
  size = 240,
  strokeWidth = 18,
  className = "",
  showLegend = true,
  showLabel = true,
  animationDelay = 0,
}: ScoreDonutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-50px" });
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (isInView && !animated) {
      const t = setTimeout(() => setAnimated(true), animationDelay);
      return () => clearTimeout(t);
    }
  }, [isInView, animated, animationDelay]);

  const cx = size / 2;
  const cy = size / 2;
  const outerR = (size - strokeWidth) / 2;
  const innerR = outerR - strokeWidth;
  const gapAngle = 2; // small gap between segments in degrees

  // Total "used" so we can show unused gray
  const totalScore = segments.reduce((sum, s) => sum + s.value, 0);
  const totalSegments = segments.length;

  // Convert each segment value to degrees (out of 360)
  // Each segment gets a proportional arc
  const totalDegrees = 360 - gapAngle * totalSegments;
  const segmentArcs = segments.map((s) => ({
    ...s,
    degrees: (s.value / 100) * (totalDegrees / totalSegments),
  }));

  let currentAngle = 0;
  const arcs = segmentArcs.map((seg, i) => {
    const start = currentAngle + (i * gapAngle);
    const end = start + seg.degrees;
    currentAngle = end;
    const colorKey = COLOR_SEQUENCE[i % COLOR_SEQUENCE.length];
    const color = SEGMENT_COLORS[colorKey];
    return { ...seg, start, end, colorKey, color };
  });

  const getScoreColor = (score: number) => {
    if (score >= 75) return "#10b981";
    if (score >= 50) return "#3b82f6";
    if (score >= 30) return "#f59e0b";
    return "#ef4444";
  };

  const scoreColor = getScoreColor(overallScore);

  return (
    <div ref={containerRef} className={`flex flex-col items-center gap-8 ${className}`}>
      {/* ── SVG Donut ── */}
      <div className="relative" style={{ width: size, height: size }}>
        {/* Ambient background glow */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${scoreColor}18 0%, transparent 70%)`,
            filter: "blur(20px)",
          }}
        />

        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="relative z-10">
          <defs>
            {arcs.map((arc, i) => (
              <filter key={i} id={`glow-${i}`} x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            ))}
          </defs>

          {/* Background track */}
          <circle
            cx={cx} cy={cy} r={outerR}
            fill="none"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={strokeWidth}
          />

          {/* Score arcs */}
          {arcs.map((arc, i) => {
            const circumference = 2 * Math.PI * outerR;
            const segAngle = arc.end - arc.start;
            const segLength = (segAngle / 360) * circumference;
            const offset = ((360 - arc.start) / 360) * circumference;

            return (
              <motion.circle
                key={i}
                cx={cx}
                cy={cy}
                r={outerR}
                fill="none"
                stroke={arc.color.stroke}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={circumference - segLength}
                style={{
                  transformOrigin: `${cx}px ${cy}px`,
                  rotate: `${arc.start}deg`,
                  filter: `drop-shadow(0 0 6px ${arc.color.glow})`,
                }}
                initial={{ strokeDashoffset: circumference }}
                animate={animated ? { strokeDashoffset: circumference - segLength } : { strokeDashoffset: circumference }}
                transition={{
                  duration: 1.2,
                  delay: 0.15 * i,
                  ease: [0.16, 1, 0.3, 1],
                }}
              />
            );
          })}

          {/* Inner ring */}
          <circle
            cx={cx} cy={cy} r={innerR}
            fill="rgba(5,5,10,0.8)"
            stroke="rgba(255,255,255,0.04)"
            strokeWidth={1}
          />

          {/* Decorative inner ring tick marks */}
          {Array.from({ length: 36 }).map((_, i) => {
            const angle = (i * 10 - 90) * (Math.PI / 180);
            const r1 = innerR - 6;
            const r2 = innerR - 12;
            return (
              <line
                key={i}
                x1={cx + r1 * Math.cos(angle)}
                y1={cy + r1 * Math.sin(angle)}
                x2={cx + r2 * Math.cos(angle)}
                y2={cy + r2 * Math.sin(angle)}
                stroke="rgba(255,255,255,0.06)"
                strokeWidth={i % 9 === 0 ? 1.5 : 0.75}
              />
            );
          })}
        </svg>

        {/* Center content */}
        {showLabel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <div
              className="text-5xl font-bold tabular-nums leading-none"
              style={{ color: scoreColor }}
            >
              {animated ? <AnimatedNumber value={overallScore} /> : 0}
            </div>
            <div className="text-xs font-medium mt-1" style={{ color: "rgba(148,163,184,0.8)" }}>
              Overall Score
            </div>
            {/* Score label */}
            <div
              className="mt-2 px-2 py-0.5 rounded-full text-[10px] font-semibold"
              style={{
                background: `${scoreColor}18`,
                color: scoreColor,
                border: `1px solid ${scoreColor}30`,
              }}
            >
              {overallScore >= 75 ? "Excellent" : overallScore >= 55 ? "Good" : overallScore >= 35 ? "Fair" : "Needs Work"}
            </div>
          </div>
        )}
      </div>

      {/* ── Legend ── */}
      {showLegend && (
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 w-full max-w-sm">
          {arcs.map((arc, i) => (
            <motion.div
              key={i}
              className="flex items-center gap-3"
              initial={{ opacity: 0, x: -10 }}
              animate={animated ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: 0.2 + i * 0.1, duration: 0.4 }}
            >
              {/* Color dot */}
              <div className="relative flex-shrink-0">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{
                    background: arc.color.stroke,
                    boxShadow: `0 0 8px ${arc.color.glow}`,
                  }}
                />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-secondary truncate">{arc.shortLabel || arc.label}</span>
                  <span className="text-xs font-semibold tabular-nums flex-shrink-0" style={{ color: arc.color.stroke }}>
                    {arc.value}
                  </span>
                </div>
                {/* Mini bar */}
                <div className="mt-1 h-1 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ background: arc.color.stroke }}
                    initial={{ width: 0 }}
                    animate={animated ? { width: `${arc.value}%` } : { width: 0 }}
                    transition={{ delay: 0.3 + i * 0.1, duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
                  />
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Simpler radial variant for dashboard cards ────────────────────────────────
export function ScoreRing({
  score,
  size = 80,
  strokeWidth = 7,
  label,
  className = "",
}: {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true });
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    if (isInView) setAnimated(true);
  }, [isInView]);

  const r = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * r;
  const cx = size / 2;
  const cy = size / 2;

  const getColor = (s: number) =>
    s >= 75 ? "#10b981" : s >= 55 ? "#3b82f6" : s >= 35 ? "#f59e0b" : "#ef4444";

  const color = getColor(score);

  return (
    <div ref={containerRef} className={`relative inline-flex items-center justify-center ${className}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={strokeWidth} />
        <motion.circle
          cx={cx} cy={cy} r={r}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference - (score / 100) * circumference}
          style={{ transformOrigin: `${cx}px ${cy}px`, rotate: "-90deg", filter: `drop-shadow(0 0 4px ${color}88)` }}
          initial={{ strokeDashoffset: circumference }}
          animate={animated ? { strokeDashoffset: circumference - (score / 100) * circumference } : {}}
          transition={{ duration: 1.0, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-sm font-bold tabular-nums" style={{ color }}>
          {animated ? <AnimatedNumber value={score} duration={0.9} /> : 0}
        </span>
        {label && <span className="text-[9px] text-muted mt-0.5">{label}</span>}
      </div>
    </div>
  );
}
