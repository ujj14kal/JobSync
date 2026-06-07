"use client";

import { useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";

interface MagicCardProps {
  children: React.ReactNode;
  className?: string;
  gradientRgb?: string;
  gradientOpacity?: number;
  gradientSize?: number;
}

export function MagicCard({
  children,
  className = "",
  gradientRgb = "139,92,246",
  gradientOpacity = 0.10,
  gradientSize = 280,
}: MagicCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  }, []);

  return (
    <div
      ref={cardRef}
      onMouseMove={onMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`relative overflow-hidden ${className}`}
    >
      <motion.div
        aria-hidden
        className="absolute pointer-events-none rounded-full z-0"
        style={{
          width: gradientSize,
          height: gradientSize,
          top: pos.y - gradientSize / 2,
          left: pos.x - gradientSize / 2,
          background: `radial-gradient(circle, rgba(${gradientRgb},${gradientOpacity}) 0%, transparent 70%)`,
        }}
        animate={{ opacity: hovered ? 1 : 0 }}
        transition={{ duration: 0.25 }}
      />
      {children}
    </div>
  );
}
