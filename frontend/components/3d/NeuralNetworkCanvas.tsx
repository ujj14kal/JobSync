"use client";

import { useEffect, useRef, useCallback } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  opacity: number;
  pulsePhase: number;
  color: [number, number, number]; // r, g, b
  layer: number; // 0=far, 1=mid, 2=near (depth)
}

const COLORS: Array<[number, number, number]> = [
  [59, 130, 246],   // blue-500
  [96, 165, 250],   // blue-400
  [139, 92, 246],   // purple-500
  [167, 139, 250],  // purple-400
  [6, 182, 212],    // cyan-500
  [34, 211, 238],   // cyan-400
];

export default function NeuralNetworkCanvas({
  className = "",
}: {
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const mouseRef = useRef({ x: 0, y: 0 });
  const rafRef = useRef<number>(0);
  const timeRef = useRef(0);

  const initNodes = useCallback((w: number, h: number) => {
    const nodeCount = Math.min(Math.floor((w * h) / 14000), 90);
    const nodes: Node[] = [];
    for (let i = 0; i < nodeCount; i++) {
      const layer = Math.floor(Math.random() * 3) as 0 | 1 | 2;
      const speed = 0.12 + layer * 0.06; // near nodes move slightly faster
      nodes.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * speed,
        vy: (Math.random() - 0.5) * speed,
        radius: 1.5 + layer * 0.8 + Math.random() * 0.8,
        opacity: 0.3 + layer * 0.2 + Math.random() * 0.2,
        pulsePhase: Math.random() * Math.PI * 2,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        layer,
      });
    }
    nodesRef.current = nodes;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d")!;
    let w = 0, h = 0;

    const resize = () => {
      const parent = canvas.parentElement!;
      w = parent.offsetWidth;
      h = parent.offsetHeight;
      // Use device pixel ratio for sharp rendering
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width  = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width  = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.scale(dpr, dpr);
      initNodes(w, h);
    };

    const onMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouseRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    };

    const MAX_DIST = 140; // max distance for drawing a connection

    const draw = () => {
      timeRef.current += 0.008;
      const t = timeRef.current;
      const nodes = nodesRef.current;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;

      ctx.clearRect(0, 0, w, h);

      // ── Update positions ──────────────────────────────────────────
      for (const n of nodes) {
        // Mouse repulsion (gentle)
        const dx = n.x - mx;
        const dy = n.y - my;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120 && dist > 0) {
          const force = (120 - dist) / 120 * 0.015;
          n.vx += (dx / dist) * force;
          n.vy += (dy / dist) * force;
        }

        // Speed cap
        const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
        const maxSpeed = 0.4;
        if (speed > maxSpeed) {
          n.vx = (n.vx / speed) * maxSpeed;
          n.vy = (n.vy / speed) * maxSpeed;
        }

        n.x += n.vx;
        n.y += n.vy;

        // Soft boundary bounce
        const padding = 60;
        if (n.x < -padding) n.x = w + padding;
        else if (n.x > w + padding) n.x = -padding;
        if (n.y < -padding) n.y = h + padding;
        else if (n.y > h + padding) n.y = -padding;
      }

      // ── Draw connections ──────────────────────────────────────────
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const a = nodes[i], b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > MAX_DIST) continue;

          const alpha = (1 - dist / MAX_DIST) * 0.25;
          const [r, g, bb] = a.color;

          // Gradient connection line
          const grad = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
          grad.addColorStop(0, `rgba(${r},${g},${bb},${alpha})`);
          grad.addColorStop(0.5, `rgba(${r},${g},${bb},${alpha * 1.6})`);
          grad.addColorStop(1, `rgba(${b.color[0]},${b.color[1]},${b.color[2]},${alpha})`);

          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 0.6 + (a.layer + b.layer) * 0.1;
          ctx.stroke();
        }
      }

      // ── Animate data packets along connections ────────────────────
      // Occasionally show a "pulse" moving along a line
      if (Math.floor(t * 10) % 8 === 0) {
        const i = Math.floor(Math.random() * nodes.length);
        const j = Math.floor(Math.random() * nodes.length);
        const a = nodes[i], b = nodes[j];
        if (a && b) {
          const dx = a.x - b.x, dy = a.y - b.y;
          if (Math.sqrt(dx*dx+dy*dy) < MAX_DIST) {
            const progress = (t % 1);
            const px = a.x + (b.x - a.x) * progress;
            const py = a.y + (b.y - a.y) * progress;
            ctx.beginPath();
            ctx.arc(px, py, 2, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(96,165,250,0.8)`;
            ctx.fill();
          }
        }
      }

      // ── Draw nodes ────────────────────────────────────────────────
      for (const n of nodes) {
        const pulse = Math.sin(t * 2 + n.pulsePhase) * 0.3 + 0.7;
        const [r, g, bb] = n.color;
        const finalOpacity = n.opacity * pulse;

        // Outer glow
        const glowGrad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.radius * 4);
        glowGrad.addColorStop(0, `rgba(${r},${g},${bb},${finalOpacity * 0.4})`);
        glowGrad.addColorStop(1, `rgba(${r},${g},${bb},0)`);
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius * 4, 0, Math.PI * 2);
        ctx.fillStyle = glowGrad;
        ctx.fill();

        // Core node
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${bb},${finalOpacity})`;
        ctx.fill();

        // White center highlight
        ctx.beginPath();
        ctx.arc(n.x - n.radius * 0.3, n.y - n.radius * 0.3, n.radius * 0.35, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${finalOpacity * 0.6})`;
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    window.addEventListener("mousemove", onMouseMove, { passive: true });
    rafRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", resize);
      window.removeEventListener("mousemove", onMouseMove);
    };
  }, [initNodes]);

  return (
    <canvas
      ref={canvasRef}
      className={`absolute inset-0 w-full h-full pointer-events-none ${className}`}
      style={{ opacity: 0.65 }}
    />
  );
}
