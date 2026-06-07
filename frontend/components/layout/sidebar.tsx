"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Zap,
  LayoutDashboard,
  BarChart2,
  FileText,
  Users,
  Sparkles,
  TrendingUp,
  ChevronLeft,
  LogOut,
  Settings,
  Briefcase,
  Mic,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppStore } from "@/lib/stores/app-store";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

const navItems = [
  {
    href: "/dashboard",
    icon: LayoutDashboard,
    label: "Dashboard",
  },
  {
    href: "/analysis",
    icon: BarChart2,
    label: "ATS Analysis",
  },
  {
    href: "/resume",
    icon: FileText,
    label: "My Resume",
  },
  {
    href: "/resume/build",
    icon: Wand2,
    label: "Resume Builder",
  },
  {
    href: "/improve",
    icon: Sparkles,
    label: "Improve",
  },
  {
    href: "/mentors",
    icon: Users,
    label: "Mentors",
  },
  {
    href: "/jobs",
    icon: Briefcase,
    label: "Job Tracker",
  },
  {
    href: "/insights",
    icon: TrendingUp,
    label: "Career Insights",
  },
  {
    href: "/interview",
    icon: Mic,
    label: "AI Interview",
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, toggleSidebar, user } = useAppStore();
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <motion.aside
      animate={{ width: sidebarCollapsed ? 64 : 220 }}
      transition={{ duration: 0.2, ease: [0.25, 0.4, 0.25, 1] }}
      className="relative flex flex-col h-screen flex-shrink-0 overflow-hidden z-20"
      style={{
        background: "linear-gradient(180deg, rgba(20,19,18,0.97) 0%, rgba(15,14,13,0.99) 100%)",
        borderRight: "1px solid rgba(255,255,255,0.07)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      }}
    >
      {/* Sidebar ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 100% 60% at 50% -10%, rgba(192,88,0,0.10) 0%, transparent 70%)",
        }}
      />

      {/* Logo */}
      <div className="relative flex items-center gap-3 px-4 h-14 border-b border-[rgba(255,255,255,0.06)]">
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{
            background: "linear-gradient(135deg, #C05800 0%, #713600 100%)",
            boxShadow: "0 0 16px rgba(192,88,0,0.45), 0 2px 8px rgba(0,0,0,0.4)",
          }}
        >
          <Zap className="w-4 h-4 text-white" fill="white" />
        </div>
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.span
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.15 }}
              className="text-[14px] font-semibold text-[var(--text-primary)] whitespace-nowrap"
            >
              JobSynk
            </motion.span>
          )}
        </AnimatePresence>
        <AnimatePresence>
          {!sidebarCollapsed && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={toggleSidebar}
              className="ml-auto p-1 rounded-md hover:bg-[var(--bg-elevated)] text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </motion.button>
          )}
        </AnimatePresence>
        {sidebarCollapsed && (
          <button
            onClick={toggleSidebar}
            className="ml-auto p-1 rounded-md hover:bg-[var(--bg-elevated)] text-[var(--text-muted)]"
          >
            <ChevronLeft className="w-3.5 h-3.5 rotate-180" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="relative flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all group",
                isActive
                  ? "text-white"
                  : "text-[var(--text-secondary)] hover:bg-[rgba(255,255,255,0.04)] hover:text-[var(--text-primary)]"
              )}
              style={isActive ? {
                background: "linear-gradient(135deg, rgba(192,88,0,0.22) 0%, rgba(113,54,0,0.12) 100%)",
                border: "1px solid rgba(192,88,0,0.28)",
                boxShadow: "0 0 16px rgba(192,88,0,0.12), inset 0 1px 0 rgba(253,251,212,0.06)",
              } : undefined}
              title={sidebarCollapsed ? item.label : undefined}
            >
              {isActive && (
                <div
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-4 rounded-full"
                  style={{ background: "linear-gradient(180deg, #C05800, #713600)" }}
                />
              )}
              <item.icon className={cn(
                "w-4 h-4 flex-shrink-0",
                isActive
                  ? "text-[#e89848]"
                  : "text-[var(--text-muted)] group-hover:text-[var(--text-secondary)]"
              )} />
              <AnimatePresence>
                {!sidebarCollapsed && (
                  <motion.span
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="whitespace-nowrap font-medium"
                  >
                    {item.label}
                  </motion.span>
                )}
              </AnimatePresence>
            </Link>
          );
        })}
      </nav>

      {/* Bottom user area */}
      <div className="border-t border-[var(--border-subtle)] p-2 space-y-0.5">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-colors"
          title={sidebarCollapsed ? "Settings" : undefined}
        >
          <Settings className="w-4 h-4 flex-shrink-0" />
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                Settings
              </motion.span>
            )}
          </AnimatePresence>
        </Link>

        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--error)] transition-colors"
          title={sidebarCollapsed ? "Sign out" : undefined}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          <AnimatePresence>
            {!sidebarCollapsed && (
              <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                Sign out
              </motion.span>
            )}
          </AnimatePresence>
        </button>

        {!sidebarCollapsed && user && (
          <div className="px-3 py-2 flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-[var(--accent-muted)] flex items-center justify-center flex-shrink-0">
              <span className="text-[11px] font-semibold text-[var(--accent-hover)]">
                {user.full_name?.charAt(0) ?? "U"}
              </span>
            </div>
            <div className="min-w-0">
              <div className="text-[12px] font-medium text-[var(--text-primary)] truncate">
                {user.full_name}
              </div>
              <div className="text-[10px] text-[var(--text-muted)] truncate">
                {user.email}
              </div>
            </div>
          </div>
        )}
      </div>
    </motion.aside>
  );
}
