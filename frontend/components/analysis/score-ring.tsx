"use client";

import { motion } from "framer-motion";
import { getScoreColor, getScoreLabel } from "@/lib/utils";

interface ScoreRingProps {
  score: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  animated?: boolean;
}

export function ScoreRing({
  score,
  size = 120,
  strokeWidth = 8,
  label,
  animated = true,
}: ScoreRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);
  const scoreLabel = getScoreLabel(score);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        className="-rotate-90"
        style={{ position: "absolute" }}
      >
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--bg-overlay)"
          strokeWidth={strokeWidth}
        />
        {/* Progress */}
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={animated ? { strokeDashoffset: circumference } : false}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: [0.25, 0.4, 0.25, 1], delay: 0.2 }}
          style={{
            filter: `drop-shadow(0 0 8px ${color}60)`,
          }}
        />
      </svg>

      {/* Center text */}
      <div className="relative text-center z-10">
        <motion.div
          initial={animated ? { opacity: 0, scale: 0.8 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, delay: 0.8 }}
          className="text-2xl font-bold"
          style={{ color }}
        >
          {score}
        </motion.div>
        {label && (
          <div className="text-[10px] text-[var(--text-muted)] mt-0.5 font-medium">
            {label}
          </div>
        )}
      </div>
    </div>
  );
}

export function ScoreRingLarge({ score }: { score: number }) {
  const color = getScoreColor(score);
  const label = getScoreLabel(score);

  return (
    <div className="flex flex-col items-center gap-3">
      <ScoreRing score={score} size={160} strokeWidth={10} animated />
      <div>
        <div className="text-[14px] font-semibold text-center" style={{ color }}>
          {label}
        </div>
        <div className="text-[12px] text-[var(--text-muted)] text-center">
          Overall ATS Score
        </div>
      </div>
    </div>
  );
}
