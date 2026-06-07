"use client";

import { motion } from "framer-motion";

interface BorderBeamProps {
  colorFrom?: string;
  colorTo?: string;
  duration?: number;
  borderWidth?: number;
  className?: string;
}

export function BorderBeam({
  colorFrom = "#3b82f6",
  colorTo = "#8b5cf6",
  duration = 5,
  borderWidth = 1.5,
  className = "",
}: BorderBeamProps) {
  return (
    <motion.div
      aria-hidden
      className={`pointer-events-none absolute rounded-[inherit] ${className}`}
      style={{
        inset: 0,
        background: `conic-gradient(from 0deg, transparent 20%, transparent 30%, ${colorFrom} 45%, ${colorTo} 60%, transparent 70%, transparent 100%)`,
        WebkitMask: `linear-gradient(#fff, #fff) content-box, linear-gradient(#fff, #fff)`,
        WebkitMaskComposite: "xor",
        maskComposite: "exclude",
        padding: borderWidth,
      }}
      animate={{ rotate: [0, 360] }}
      transition={{ duration, repeat: Infinity, ease: "linear" }}
    />
  );
}
