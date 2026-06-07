"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface SpotlightProps {
  color?: string;
  size?: number;
  className?: string;
}

export function Spotlight({
  color = "rgba(139,92,246,0.14)",
  size = 700,
  className = "",
}: SpotlightProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const parent = ref.current?.parentElement;
    if (!parent) return;

    function onMove(e: MouseEvent) {
      const rect = parent!.getBoundingClientRect();
      setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    }
    function onLeave() {
      setPos(null);
    }

    parent.addEventListener("mousemove", onMove);
    parent.addEventListener("mouseleave", onLeave);
    return () => {
      parent.removeEventListener("mousemove", onMove);
      parent.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden
      className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}
    >
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          width: size,
          height: size,
          top: pos ? pos.y - size / 2 : "40%",
          left: pos ? pos.x - size / 2 : "50%",
          background: `radial-gradient(circle, ${color} 0%, transparent 60%)`,
          filter: "blur(24px)",
        }}
        animate={{ opacity: pos ? 1 : 0 }}
        initial={{ opacity: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      />
    </div>
  );
}
