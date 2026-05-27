"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { GitBranch, Clock, ArrowRight, CheckCircle2, Circle, Zap } from "lucide-react";

const SKILL_NODES = [
  { skill: "Python",       have: true,  color: "#3b82f6",  x: 10, y: 40 },
  { skill: "Docker",       have: true,  color: "#3b82f6",  x: 10, y: 70 },
  { skill: "React",        have: true,  color: "#3b82f6",  x: 10, y: 55 },
  { skill: "Kubernetes",   have: false, color: "#8b5cf6",  x: 50, y: 30 },
  { skill: "PyTorch",      have: false, color: "#8b5cf6",  x: 50, y: 55 },
  { skill: "LangChain",    have: false, color: "#06b6d4",  x: 50, y: 80 },
  { skill: "MLflow",       have: false, color: "#06b6d4",  x: 85, y: 42 },
  { skill: "AWS EKS",      have: false, color: "#06b6d4",  x: 85, y: 68 },
];

const CONNECTIONS = [
  { from: "Docker", to: "Kubernetes", weight: 0.9 },
  { from: "Python", to: "PyTorch", weight: 0.95 },
  { from: "Python", to: "LangChain", weight: 0.9 },
  { from: "Kubernetes", to: "AWS EKS", weight: 0.85 },
  { from: "PyTorch", to: "MLflow", weight: 0.75 },
  { from: "LangChain", to: "MLflow", weight: 0.7 },
];

const ROADMAP_STEPS = [
  { step: 1, skill: "PyTorch",    hours: 10, category: "AI/ML",    color: "#8b5cf6", quick: true,  desc: "You know Python + NumPy → fast ramp" },
  { step: 2, skill: "Kubernetes", hours: 20, category: "DevOps",   color: "#3b82f6", quick: false, desc: "You have Docker → K8s is the next step" },
  { step: 3, skill: "LangChain",  hours: 12, category: "LLM/AI",   color: "#06b6d4", quick: true,  desc: "Python + PyTorch prereqs already met" },
  { step: 4, skill: "MLflow",     hours: 8,  category: "ML Ops",   color: "#10b981", quick: true,  desc: "PyTorch knowledge transfers directly" },
  { step: 5, skill: "AWS EKS",    hours: 15, category: "Cloud",    color: "#f59e0b", quick: false, desc: "Kubernetes + AWS basics required first" },
];

export default function SkillGapSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section ref={ref} className="section relative overflow-hidden">
      {/* Background orb */}
      <div
        className="absolute left-0 top-1/2 w-[500px] h-[500px] rounded-full pointer-events-none -translate-y-1/2 -translate-x-1/3"
        style={{
          background: "radial-gradient(circle, rgba(6,182,212,0.07) 0%, transparent 70%)",
          filter: "blur(60px)",
        }}
      />

      <div className="container-xl relative">
        {/* ── Heading ── */}
        <div className="text-center mb-16">
          <motion.div
            className="chip-cyan mb-4 inline-flex"
            initial={{ opacity: 0, y: 10 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
          >
            <GitBranch size={12} />
            Skill Gap Intelligence
          </motion.div>
          <motion.h2
            className="text-4xl sm:text-5xl font-bold text-primary mb-4"
            initial={{ opacity: 0, y: 20 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.1, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            Knows what you need.{" "}
            <span className="gradient-cyan-blue">Shows you the path.</span>
          </motion.h2>
          <motion.p
            className="text-secondary text-lg max-w-2xl mx-auto"
            initial={{ opacity: 0, y: 16 }}
            animate={isInView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            Our 300+ node skill graph understands that React developers can learn Vue faster,
            Docker knowledge transfers to Kubernetes. Get partial credit for what you know.
          </motion.p>
        </div>

        <div className="grid lg:grid-cols-2 gap-12 items-start">
          {/* ── Skill graph visualization ── */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <div
              className="relative rounded-3xl p-6 overflow-hidden"
              style={{
                background: "rgba(255,255,255,0.025)",
                border: "1px solid rgba(255,255,255,0.07)",
                aspectRatio: "4/3",
              }}
            >
              <div className="text-xs text-muted mb-4 font-medium">Skill Graph · Senior ML Engineer</div>

              {/* SVG graph */}
              <svg
                viewBox="0 0 100 90"
                className="w-full h-full"
                style={{ overflow: "visible" }}
              >
                {/* Connections */}
                {CONNECTIONS.map((conn, i) => {
                  const from = SKILL_NODES.find(n => n.skill === conn.from)!;
                  const to = SKILL_NODES.find(n => n.skill === conn.to)!;
                  return (
                    <motion.line
                      key={i}
                      x1={from.x} y1={from.y}
                      x2={to.x}   y2={to.y}
                      stroke={to.have ? "rgba(59,130,246,0.5)" : `${to.color}50`}
                      strokeWidth={conn.weight * 0.8}
                      strokeDasharray="2 2"
                      initial={{ pathLength: 0, opacity: 0 }}
                      animate={isInView ? { pathLength: 1, opacity: 1 } : {}}
                      transition={{ delay: 0.5 + i * 0.1, duration: 0.8 }}
                    />
                  );
                })}

                {/* Nodes */}
                {SKILL_NODES.map((node, i) => (
                  <motion.g key={i}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={isInView ? { opacity: 1, scale: 1 } : {}}
                    transition={{ delay: 0.3 + i * 0.08, duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
                    style={{ transformOrigin: `${node.x}% ${node.y}%` }}
                  >
                    {/* Glow */}
                    <circle cx={node.x} cy={node.y} r={4} fill={`${node.color}15`} />
                    {/* Node */}
                    <circle
                      cx={node.x} cy={node.y} r={2.5}
                      fill={node.have ? node.color : "transparent"}
                      stroke={node.color}
                      strokeWidth={1}
                    />
                    {/* Label */}
                    <text
                      x={node.x}
                      y={node.y + 5.5}
                      textAnchor="middle"
                      fontSize={2.5}
                      fill={node.have ? "rgba(241,245,249,0.9)" : "rgba(148,163,184,0.7)"}
                    >
                      {node.skill}
                    </text>
                    {/* Have/missing indicator */}
                    {node.have && (
                      <circle cx={node.x + 3} cy={node.y - 2.5} r={1}
                        fill="#10b981" />
                    )}
                  </motion.g>
                ))}

                {/* Legend */}
                <g>
                  <circle cx={8} cy={85} r={2} fill="#3b82f6" />
                  <text x={12} y={86.5} fontSize={2.5} fill="rgba(148,163,184,0.8)">You have this</text>
                  <circle cx={35} cy={85} r={2} fill="transparent" stroke="#8b5cf6" strokeWidth={0.8} />
                  <text x={39} y={86.5} fontSize={2.5} fill="rgba(148,163,184,0.8)">Gap to fill</text>
                </g>
              </svg>

              {/* Stats overlay */}
              <div className="absolute top-4 right-4 flex flex-col gap-2 text-right">
                <div className="text-xs">
                  <div className="text-secondary">Matched</div>
                  <div className="font-bold" style={{ color: "#10b981" }}>3/8 skills</div>
                </div>
                <div className="text-xs">
                  <div className="text-secondary">Transferable</div>
                  <div className="font-bold" style={{ color: "#3b82f6" }}>4 skills</div>
                </div>
                <div className="text-xs">
                  <div className="text-secondary">Gap score</div>
                  <div className="font-bold" style={{ color: "#f59e0b" }}>54.9</div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Learning roadmap ── */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-xl font-bold text-primary">Learning Roadmap</h3>
                <div
                  className="px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{ background: "rgba(99,102,241,0.15)", color: "#a78bfa", border: "1px solid rgba(99,102,241,0.25)" }}
                >
                  12 weeks total
                </div>
              </div>
              <p className="text-sm text-secondary">Ordered by dependency. Prerequisites met first.</p>
            </div>

            <div className="flex flex-col gap-3">
              {ROADMAP_STEPS.map((step, i) => (
                <motion.div
                  key={i}
                  className="relative flex items-start gap-4 p-4 rounded-xl"
                  style={{
                    background: "rgba(255,255,255,0.02)",
                    border: "1px solid rgba(255,255,255,0.06)",
                  }}
                  initial={{ opacity: 0, y: 16 }}
                  animate={isInView ? { opacity: 1, y: 0 } : {}}
                  transition={{ delay: 0.2 + i * 0.08, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  whileHover={{ backgroundColor: "rgba(255,255,255,0.04)" }}
                >
                  {/* Step number */}
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: `${step.color}20`, color: step.color, border: `1px solid ${step.color}30` }}
                  >
                    {step.step}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-primary">{step.skill}</span>
                      <span
                        className="text-[10px] px-1.5 py-0.5 rounded-full"
                        style={{ background: `${step.color}15`, color: step.color }}
                      >
                        {step.category}
                      </span>
                      {step.quick && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full flex items-center gap-1"
                          style={{ background: "rgba(16,185,129,0.1)", color: "#10b981" }}>
                          <Zap size={8} /> Quick win
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted mb-1">{step.desc}</div>
                    <div className="flex items-center gap-1 text-[10px]" style={{ color: `${step.color}99` }}>
                      <Clock size={9} />
                      {step.hours} hours · {step.quick ? "~1 week" : "~2-3 weeks"}
                    </div>
                  </div>

                  {/* Right arrow */}
                  {i < ROADMAP_STEPS.length - 1 && (
                    <div
                      className="absolute -bottom-1.5 left-[22px] w-px h-3"
                      style={{ background: "rgba(255,255,255,0.08)" }}
                    />
                  )}
                </motion.div>
              ))}
            </div>

            {/* Total time card */}
            <motion.div
              className="mt-4 p-4 rounded-xl flex items-center gap-3"
              style={{
                background: "rgba(99,102,241,0.06)",
                border: "1px solid rgba(99,102,241,0.15)",
              }}
              initial={{ opacity: 0 }}
              animate={isInView ? { opacity: 1 } : {}}
              transition={{ delay: 0.8, duration: 0.5 }}
            >
              <CheckCircle2 size={18} className="text-purple-400 flex-shrink-0" />
              <div>
                <div className="text-sm font-semibold text-primary">65 total hours · ready in 12 weeks</div>
                <div className="text-xs text-muted">at 10hrs/week focused learning</div>
              </div>
              <ArrowRight size={14} className="text-purple-400 ml-auto flex-shrink-0" />
            </motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
