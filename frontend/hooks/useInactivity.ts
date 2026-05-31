"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseInactivityOptions {
  warningAfterMs: number;
  logoutAfterMs: number;
  onLogout: () => void;
}

interface UseInactivityReturn {
  showWarning: boolean;
  timeRemaining: number;
  resetTimer: () => void;
}

const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "touchstart", "scroll", "click"] as const;

export function useInactivity({
  warningAfterMs,
  logoutAfterMs,
  onLogout,
}: UseInactivityOptions): UseInactivityReturn {
  const [showWarning, setShowWarning] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState(0);

  const warningRef   = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const logoutRef    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const countdownRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const showingRef   = useRef(false);

  const clearAllTimers = useCallback(() => {
    if (warningRef.current)   clearTimeout(warningRef.current);
    if (logoutRef.current)    clearTimeout(logoutRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);
  }, []);

  const resetTimer = useCallback(() => {
    clearAllTimers();
    setShowWarning(false);
    setTimeRemaining(0);
    showingRef.current = false;

    warningRef.current = setTimeout(() => {
      showingRef.current = true;
      const countdownSecs = Math.round((logoutAfterMs - warningAfterMs) / 1000);
      setTimeRemaining(countdownSecs);
      setShowWarning(true);

      countdownRef.current = setInterval(() => {
        setTimeRemaining((t) => {
          if (t <= 1) {
            clearInterval(countdownRef.current);
            return 0;
          }
          return t - 1;
        });
      }, 1000);

      logoutRef.current = setTimeout(() => {
        onLogout();
      }, logoutAfterMs - warningAfterMs);
    }, warningAfterMs);
  }, [warningAfterMs, logoutAfterMs, onLogout, clearAllTimers]);

  useEffect(() => {
    const handleActivity = () => {
      // Only reset when the warning is NOT showing — once warning appears,
      // the user must explicitly click "Stay logged in"
      if (!showingRef.current) {
        resetTimer();
      }
    };

    ACTIVITY_EVENTS.forEach((evt) =>
      window.addEventListener(evt, handleActivity, { passive: true })
    );
    resetTimer();

    return () => {
      ACTIVITY_EVENTS.forEach((evt) => window.removeEventListener(evt, handleActivity));
      clearAllTimers();
    };
  }, [resetTimer, clearAllTimers]);

  return { showWarning, timeRemaining, resetTimer };
}
