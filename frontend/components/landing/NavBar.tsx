"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X, Sparkles, Zap } from "lucide-react";

const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Analytics", href: "#analytics" },
  { label: "Skill Gap AI", href: "#skillgap" },
  { label: "Pricing", href: "#pricing" },
];

export default function NavBar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <motion.header
        className="fixed top-0 left-0 right-0 z-50 flex justify-center"
        initial={{ y: -60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      >
        <div
          className="mx-auto mt-4 w-full max-w-5xl px-4"
          style={{ maxWidth: "calc(100vw - 32px)" }}
        >
          <motion.nav
            className="flex items-center justify-between px-5 py-3 rounded-2xl"
            animate={{
              background: scrolled ? "rgba(10,10,18,0.85)" : "rgba(10,10,18,0.4)",
              borderColor: scrolled ? "rgba(255,255,255,0.1)" : "rgba(255,255,255,0.05)",
              backdropFilter: scrolled ? "blur(24px) saturate(200%)" : "blur(12px)",
            }}
            style={{
              border: "1px solid rgba(255,255,255,0.07)",
              WebkitBackdropFilter: "blur(24px)",
            }}
            transition={{ duration: 0.3 }}
          >
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2.5">
              <div
                className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                  boxShadow: "0 0 20px rgba(99,102,241,0.4)",
                }}
              >
                <Zap size={15} className="text-white" />
              </div>
              <span className="font-bold text-primary text-base">JobSync</span>
              <span
                className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold"
                style={{ background: "rgba(139,92,246,0.15)", color: "#a78bfa", border: "1px solid rgba(139,92,246,0.25)" }}
              >
                <Sparkles size={9} /> AI
              </span>
            </Link>

            {/* Desktop nav */}
            <div className="hidden md:flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-secondary hover:text-primary transition-colors"
                  style={{ transition: "color 0.2s, background 0.2s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.05)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  {link.label}
                </Link>
              ))}
            </div>

            {/* Desktop CTAs */}
            <div className="hidden md:flex items-center gap-3">
              <Link href="/login">
                <button
                  className="px-4 py-2 rounded-lg text-sm font-medium text-secondary hover:text-primary transition-colors"
                  style={{ transition: "color 0.2s" }}
                >
                  Sign in
                </button>
              </Link>
              <Link href="/signup">
                <motion.button
                  className="px-4 py-2 rounded-xl text-sm font-semibold text-white"
                  style={{
                    background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
                    boxShadow: "0 0 20px rgba(99,102,241,0.35)",
                  }}
                  whileHover={{ scale: 1.03, boxShadow: "0 0 28px rgba(99,102,241,0.5)" }}
                  whileTap={{ scale: 0.97 }}
                >
                  Get Started Free
                </motion.button>
              </Link>
            </div>

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2 rounded-lg text-secondary hover:text-primary"
              onClick={() => setMobileOpen(!mobileOpen)}
            >
              {mobileOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </motion.nav>
        </div>
      </motion.header>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            className="fixed inset-x-0 top-20 z-40 mx-4 rounded-2xl overflow-hidden"
            style={{
              background: "rgba(10,10,18,0.95)",
              border: "1px solid rgba(255,255,255,0.08)",
              backdropFilter: "blur(24px)",
            }}
            initial={{ opacity: 0, y: -10, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex flex-col p-4 gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="px-4 py-3 rounded-xl text-sm font-medium text-secondary hover:text-primary hover:bg-white/5 transition-all"
                  onClick={() => setMobileOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="h-px bg-white/5 my-2" />
              <div className="flex gap-3 px-1">
                <Link href="/login" className="flex-1">
                  <button className="w-full py-2.5 rounded-xl text-sm font-medium text-secondary bg-white/5 hover:bg-white/8 transition-all">
                    Sign in
                  </button>
                </Link>
                <Link href="/signup" className="flex-1">
                  <button
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white"
                    style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}
                  >
                    Get Started
                  </button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
