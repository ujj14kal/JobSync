"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, Resume, Analysis } from "@/lib/types";

interface AppStore {
  // User
  user: User | null;
  setUser: (user: User | null) => void;

  // Active resume
  activeResume: Resume | null;
  setActiveResume: (resume: Resume | null) => void;

  // Current analysis
  currentAnalysis: Analysis | null;
  setCurrentAnalysis: (analysis: Analysis | null) => void;

  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;

  // Onboarding
  onboardingComplete: boolean;
  setOnboardingComplete: (v: boolean) => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set) => ({
      user: null,
      setUser: (user) => set({ user }),

      activeResume: null,
      setActiveResume: (resume) => set({ activeResume: resume }),

      currentAnalysis: null,
      setCurrentAnalysis: (analysis) => set({ currentAnalysis: analysis }),

      sidebarCollapsed: false,
      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),

      onboardingComplete: false,
      setOnboardingComplete: (v) => set({ onboardingComplete: v }),
    }),
    {
      name: "jobsync-app",
      partialize: (s) => ({
        sidebarCollapsed: s.sidebarCollapsed,
        onboardingComplete: s.onboardingComplete,
      }),
    }
  )
);
