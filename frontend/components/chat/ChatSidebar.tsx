"use client";

/**
 * "Ask Claude" chat sidebar — Pro only, locked behind payment.
 * Slides in from the right over the dashboard content.
 * Shows token usage. Warns at 80% token budget.
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, X, Send, Loader2, AlertTriangle,
  ChevronRight, RotateCcw, Lock,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { chatApi } from "@/lib/api/chat";
import { cn } from "@/lib/utils";
import { useUpsell } from "@/components/billing/UpsellModal";

interface Message {
  role:    "user" | "assistant";
  content: string;
}

// ── Claude logo mark (Anthropic's horizontal-bars symbol) ─────────────────────
function ClaudeLogo({ size = 14, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 41 41"
      fill="currentColor" xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Anthropic / Claude logomark — the radiating-bars mark */}
      <path d="M23.5688 6L31.9999 35H27.8181L25.6817 27.7273H16.3635L14.2272 35H10.0454L18.4999 6H23.5688ZM21.0226 11.1591L17.477 24.4545H24.568L21.0226 11.1591Z"/>
    </svg>
  );
}

// ── Token meter ───────────────────────────────────────────────────────────────
function TokenMeter({ used, limit, warning }: { used: number; limit: number; warning: boolean }) {
  const pct   = Math.min((used / limit) * 100, 100);
  const color = warning ? "#d4aa30" : pct > 50 ? "#C05800" : "#7ab840";

  return (
    <div className="px-3 py-2 rounded-xl text-[11px]" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[var(--text-muted)]">Chat tokens this month</span>
        <span className="font-semibold" style={{ color }}>
          {(used / 1000).toFixed(1)}k / {(limit / 1000).toFixed(0)}k
        </span>
      </div>
      <div className="h-1 rounded-full bg-[var(--bg-overlay)] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      {warning && (
        <div className="flex items-center gap-1 mt-1.5 text-[#d4aa30]">
          <AlertTriangle className="w-3 h-3" />
          <span>Less than 5,000 tokens remaining this month</span>
        </div>
      )}
    </div>
  );
}

// ── Message bubble ────────────────────────────────────────────────────────────
function Bubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <motion.div
      className={cn("flex", isUser ? "justify-end" : "justify-start")}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
    >
      {!isUser && (
        <div className="w-6 h-6 rounded-full flex items-center justify-center mr-2 flex-shrink-0 mt-1"
          style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}>
          <ClaudeLogo size={12} className="text-white" />
        </div>
      )}
      <div
        className={cn(
          "max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed",
          isUser ? "rounded-br-sm text-white" : "rounded-bl-sm text-[var(--text-primary)]",
        )}
        style={
          isUser
            ? { background: "linear-gradient(135deg,#C05800,#8c4400)" }
            : { background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }
        }
      >
        {msg.content.split("\n").map((line, i, arr) => (
          <span key={i}>{line}{i < arr.length - 1 && <br />}</span>
        ))}
      </div>
    </motion.div>
  );
}

// ── Paywall panel (shown when non-pro user somehow opens the sidebar) ─────────
function PaywallPanel({ onUpgrade, onClose }: { onUpgrade: () => void; onClose: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-10 text-center">
      <div className="w-16 h-16 rounded-2xl mx-auto mb-5 flex items-center justify-center"
        style={{ background: "linear-gradient(135deg,rgba(192,88,0,0.12),rgba(113,54,0,0.06))", border: "1px solid rgba(192,88,0,0.2)" }}>
        <Lock className="w-7 h-7 text-[#C05800]" />
      </div>
      <h3 className="text-[16px] font-bold text-[var(--text-primary)] mb-2">Pro feature</h3>
      <p className="text-[13px] text-[var(--text-muted)] leading-relaxed mb-6 max-w-[260px]">
        Ask Claude is powered by <strong className="text-[var(--text-secondary)]">Claude Sonnet by Anthropic</strong>. Upgrade to Pro to unlock it and 50,000 chat tokens/month.
      </p>
      <button
        onClick={onUpgrade}
        className="w-full py-3 rounded-xl text-[14px] font-bold text-white mb-3"
        style={{ background: "linear-gradient(135deg,#C05800,#713600)", boxShadow: "0 4px 20px rgba(192,88,0,0.35)" }}
      >
        Upgrade to Pro — ₹299/mo
      </button>
      <button onClick={onClose} className="text-[12px] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors">
        Maybe later
      </button>
      <div className="mt-6 flex items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
        <ClaudeLogo size={11} className="text-[#C05800]" />
        <span>Powered by Claude Sonnet · by Anthropic</span>
      </div>
    </div>
  );
}

// ── Main sidebar ──────────────────────────────────────────────────────────────
export function ChatSidebar() {
  const [open, setOpen]           = useState(false);
  const [messages, setMessages]   = useState<Message[]>([]);
  const [input, setInput]         = useState("");
  const [streaming, setStreaming] = useState(false);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [streamBuf, setStreamBuf] = useState("");
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);
  const qc         = useQueryClient();
  const { showUpsell } = useUpsell();

  // Always fetch status — not just when sidebar is open — so we can gate the button immediately
  const { data: status } = useQuery({
    queryKey: ["chat-status"],
    queryFn:  chatApi.getStatus,
    staleTime: 60_000,
    retry: false,
  });

  const isPro = status?.is_pro === true;

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamBuf]);

  // Focus input when opened as pro
  useEffect(() => {
    if (open && isPro) setTimeout(() => inputRef.current?.focus(), 200);
  }, [open, isPro]);

  const handleOpen = useCallback(() => {
    // If we have status loaded and user is not pro — strict upsell (no dismiss, no "not this time")
    if (status !== undefined && !isPro) {
      showUpsell({ feature: "Ask Claude Chat", onProceed: () => {}, strict: true });
      return;
    }
    setOpen(true);
  }, [status, isPro, showUpsell]);

  const handleUpgradeFromPanel = useCallback(() => {
    setOpen(false);
    showUpsell({ feature: "Ask Claude Chat", onProceed: () => {}, strict: true });
  }, [showUpsell]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || streaming) return;

    if (!isPro) {
      showUpsell({ feature: "Ask Claude Chat", onProceed: () => {}, strict: true });
      return;
    }

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setStreaming(true);
    setStreamBuf("");

    try {
      const res = await chatApi.sendMessage(text, messages.slice(-8), sessionId);

      if (!res.ok || !res.body) throw new Error("Stream failed");

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buf     = "";
      let   sid     = sessionId;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const lines = decoder.decode(value, { stream: true }).split("\n");
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const raw = line.slice(6);
          if (raw === "[DONE]") {
            setMessages((prev) => [...prev, { role: "assistant", content: buf }]);
            setStreamBuf("");
            buf = "";
            qc.invalidateQueries({ queryKey: ["chat-status"] });
            continue;
          }
          try {
            const data = JSON.parse(raw);
            if (data.content)    { buf += data.content; setStreamBuf(buf); }
            if (data.session_id) { sid = data.session_id; setSessionId(sid); }
            if (data.error)      { setMessages((prev) => [...prev, { role: "assistant", content: `⚠️ ${data.error}` }]); buf = ""; setStreamBuf(""); }
          } catch { /* partial chunk */ }
        }
      }
    } catch {
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, I couldn't connect. Please try again." }]);
    } finally {
      setStreaming(false);
      setStreamBuf("");
    }
  }, [input, streaming, messages, sessionId, isPro, showUpsell, qc]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
  }, [handleSend]);

  const handleReset = () => { setMessages([]); setSessionId(undefined); setStreamBuf(""); };

  return (
    <>
      {/* Floating trigger button */}
      <motion.button
        onClick={handleOpen}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl"
        style={{
          background: isPro
            ? "linear-gradient(135deg,#C05800,#713600)"
            : "linear-gradient(135deg,rgba(192,88,0,0.55),rgba(113,54,0,0.45))",
          boxShadow: "0 8px 32px rgba(192,88,0,0.4), 0 2px 8px rgba(0,0,0,0.3)",
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, type: "spring", stiffness: 260, damping: 22 }}
      >
        {isPro
          ? <MessageSquare className="w-4 h-4 text-white" />
          : <Lock className="w-4 h-4 text-white/80" />
        }
        <span className="text-white text-[13px] font-semibold">Ask Claude</span>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-white/20 text-white/90">
          {isPro ? "Pro" : "🔒 Pro"}
        </span>
      </motion.button>

      {/* Sidebar panel */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-[60] bg-black/40 md:hidden"
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setOpen(false)}
            />

            <motion.div
              className="fixed right-0 top-0 bottom-0 z-[70] w-full md:w-[400px] flex flex-col"
              style={{ background: "var(--bg-surface)", borderLeft: "1px solid var(--border-default)", boxShadow: "-8px 0 40px rgba(0,0,0,0.3)" }}
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 32 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3.5 border-b" style={{ borderColor: "var(--border-subtle)" }}>
                <div className="flex items-center gap-2.5">
                  {/* Claude logo in header */}
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}>
                    <ClaudeLogo size={16} className="text-white" />
                  </div>
                  <div>
                    <div className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                      Ask Claude
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                        style={{ background: "rgba(192,88,0,0.12)", color: "#C05800", border: "1px solid rgba(192,88,0,0.2)" }}>
                        by Anthropic
                      </span>
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)]">Career assistant · Claude Sonnet</div>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {isPro && (
                    <button onClick={handleReset}
                      className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-elevated)] transition-colors"
                      title="New conversation">
                      <RotateCcw className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                    </button>
                  )}
                  <button onClick={() => setOpen(false)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-elevated)] transition-colors">
                    <X className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                  </button>
                </div>
              </div>

              {/* ── Non-pro: show paywall ── */}
              {!isPro ? (
                <PaywallPanel onUpgrade={handleUpgradeFromPanel} onClose={() => setOpen(false)} />
              ) : (
                <>
                  {/* Token meter */}
                  {status && (
                    <div className="px-3 pt-3">
                      <TokenMeter used={status.chat_tokens_used} limit={status.chat_tokens_limit} warning={status.warning} />
                    </div>
                  )}

                  {/* Messages */}
                  <div className="flex-1 overflow-y-auto px-3 py-4 space-y-3">
                    {messages.length === 0 && !streamBuf && (
                      <motion.div className="text-center py-12" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }}>
                        <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                          style={{ background: "linear-gradient(135deg,rgba(192,88,0,0.12),rgba(113,54,0,0.06))", border: "1px solid rgba(192,88,0,0.15)" }}>
                          <ClaudeLogo size={26} className="text-[#C05800]" />
                        </div>
                        <p className="text-[14px] font-semibold text-[var(--text-primary)] mb-1">Ask me anything</p>
                        <p className="text-[12px] text-[var(--text-muted)] max-w-[260px] mx-auto">
                          Resume tips, interview prep, salary negotiation, career pivots — I've got you.
                        </p>
                        <div className="mt-5 flex flex-col gap-2">
                          {[
                            "How do I improve my ATS score?",
                            "Write a cold email to a recruiter",
                            "What salary should I ask for?",
                          ].map((s) => (
                            <button key={s} onClick={() => setInput(s)}
                              className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors text-left"
                              style={{ border: "1px solid var(--border-subtle)" }}>
                              <ChevronRight className="w-3 h-3 text-[#C05800] flex-shrink-0" />
                              {s}
                            </button>
                          ))}
                        </div>
                      </motion.div>
                    )}

                    {messages.map((m, i) => <Bubble key={i} msg={m} />)}

                    {/* Streaming bubble */}
                    {streamBuf && (
                      <motion.div className="flex justify-start">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center mr-2 flex-shrink-0 mt-1"
                          style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}>
                          <ClaudeLogo size={12} className="text-white" />
                        </div>
                        <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-bl-sm text-[13px] leading-relaxed text-[var(--text-primary)]"
                          style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-subtle)" }}>
                          {streamBuf}
                          <span className="inline-block w-1 h-3.5 ml-0.5 bg-[#C05800] animate-pulse rounded-sm" />
                        </div>
                      </motion.div>
                    )}

                    {streaming && !streamBuf && (
                      <div className="flex items-center gap-2 px-3">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center"
                          style={{ background: "linear-gradient(135deg,#C05800,#713600)" }}>
                          <ClaudeLogo size={12} className="text-white" />
                        </div>
                        <div className="flex gap-1">
                          {[0, 1, 2].map((d) => (
                            <motion.div key={d} className="w-1.5 h-1.5 rounded-full bg-[#C05800]"
                              animate={{ opacity: [0.3, 1, 0.3] }}
                              transition={{ repeat: Infinity, duration: 1, delay: d * 0.2 }} />
                          ))}
                        </div>
                      </div>
                    )}

                    <div ref={bottomRef} />
                  </div>

                  {/* Input bar */}
                  <div className="px-3 pb-3 pt-2 border-t" style={{ borderColor: "var(--border-subtle)" }}>
                    {status?.warning && (
                      <div className="flex items-center gap-1.5 mb-2 px-2 py-1.5 rounded-lg text-[11px] text-[#d4aa30]"
                        style={{ background: "rgba(212,170,48,0.08)" }}>
                        <AlertTriangle className="w-3 h-3 flex-shrink-0" />
                        Token budget almost full — each message uses ~500–1,500 tokens
                      </div>
                    )}
                    <div className="flex items-end gap-2 p-2 rounded-2xl"
                      style={{ background: "var(--bg-elevated)", border: "1px solid var(--border-default)" }}>
                      <textarea
                        ref={inputRef}
                        rows={1}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Ask about your career, resume, interviews…"
                        disabled={streaming}
                        className="flex-1 resize-none bg-transparent text-[13px] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] outline-none max-h-32 py-1"
                        style={{ lineHeight: "1.5" }}
                      />
                      <button
                        onClick={handleSend}
                        disabled={!input.trim() || streaming}
                        className="flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                        style={{ background: input.trim() && !streaming ? "linear-gradient(135deg,#C05800,#713600)" : "var(--bg-overlay)" }}
                      >
                        {streaming
                          ? <Loader2 className="w-4 h-4 text-[var(--text-muted)] animate-spin" />
                          : <Send className="w-4 h-4 text-white" />
                        }
                      </button>
                    </div>
                    <div className="flex items-center justify-center gap-1 mt-1.5">
                      <ClaudeLogo size={10} className="text-[var(--text-muted)]" />
                      <p className="text-[10px] text-[var(--text-muted)]">
                        Powered by <span className="font-medium text-[var(--text-secondary)]">Claude Sonnet</span> · Tokens count toward your monthly Pro quota
                      </p>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
