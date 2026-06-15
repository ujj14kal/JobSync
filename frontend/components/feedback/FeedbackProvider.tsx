"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { FeedbackModal } from "./FeedbackModal";

export interface FeedbackOpts {
  feature: string;
  analysisId?: string;
}

interface FeedbackContextValue {
  markServiceUsed: (opts: FeedbackOpts) => void;
  hasDenied: (feature: string) => boolean;
  hasSubmitted: (feature: string) => boolean;
  submitFeedback: (opts: FeedbackOpts & { rating: number; feedback: string }) => Promise<void>;
}

const FeedbackContext = createContext<FeedbackContextValue>({
  markServiceUsed: () => {},
  hasDenied: () => false,
  hasSubmitted: () => false,
  submitFeedback: async () => {},
});

export function useFeedback() {
  return useContext(FeedbackContext);
}

function ls(op: "get", key: string): string | null;
function ls(op: "set", key: string, value: string): null;
function ls(op: "get" | "set", key: string, value?: string): string | null {
  try {
    if (op === "get") return localStorage.getItem(key);
    localStorage.setItem(key, value!);
    return null;
  } catch { return null; }
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [modalOpen, setModalOpen]   = useState(false);
  const [modalOpts, setModalOpts]   = useState<FeedbackOpts>({ feature: "general" });
  const pendingRef   = useRef<FeedbackOpts | null>(null);
  const pathname     = usePathname();
  const prevPathname = useRef(pathname);

  // Intercept navigation: when the route changes after a service was used, show modal
  useEffect(() => {
    if (prevPathname.current === pathname) return;
    prevPathname.current = pathname;

    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;

    if (ls("get", `fb_submitted_${pending.feature}`)) return; // already reviewed

    setModalOpts(pending);
    setModalOpen(true);
  }, [pathname]);

  const markServiceUsed = useCallback((opts: FeedbackOpts) => {
    if (ls("get", `fb_submitted_${opts.feature}`)) return;
    ls("set", `fb_used_${opts.feature}`, "1");
    pendingRef.current = opts;
  }, []);

  const hasDenied = useCallback((feature: string) =>
    !!ls("get", `fb_denied_${feature}`) && !ls("get", `fb_submitted_${feature}`)
  , []);

  const hasSubmitted = useCallback((feature: string) =>
    !!ls("get", `fb_submitted_${feature}`)
  , []);

  const submitFeedback = useCallback(async (
    opts: FeedbackOpts & { rating: number; feedback: string }
  ) => {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(opts),
    });
    ls("set", `fb_submitted_${opts.feature}`, "1");
  }, []);

  function handleClose() {
    ls("set", `fb_denied_${modalOpts.feature}`, "1");
    setModalOpen(false);
  }

  function handleSubmitted() {
    ls("set", `fb_submitted_${modalOpts.feature}`, "1");
    setModalOpen(false);
  }

  return (
    <FeedbackContext.Provider value={{ markServiceUsed, hasDenied, hasSubmitted, submitFeedback }}>
      {children}
      <FeedbackModal
        open={modalOpen}
        feature={modalOpts.feature}
        analysisId={modalOpts.analysisId}
        onClose={handleClose}
        onSubmitted={handleSubmitted}
      />
    </FeedbackContext.Provider>
  );
}
