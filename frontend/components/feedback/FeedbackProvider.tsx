"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { FeedbackModal } from "./FeedbackModal";

interface ShowFeedbackOpts {
  feature: string;
  analysisId?: string;
}

interface FeedbackContextValue {
  showFeedback: (opts: ShowFeedbackOpts) => void;
}

const FeedbackContext = createContext<FeedbackContextValue>({ showFeedback: () => {} });

export function useFeedback() {
  return useContext(FeedbackContext);
}

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen]     = useState(false);
  const [opts, setOpts]     = useState<ShowFeedbackOpts>({ feature: "general" });

  const showFeedback = useCallback((o: ShowFeedbackOpts) => {
    // Don't show again for same analysis id
    const storageKey = o.analysisId
      ? `fb_shown_${o.analysisId}`
      : `fb_shown_${o.feature}_${Math.floor(Date.now() / 86_400_000)}`; // once per day per feature

    try {
      if (typeof localStorage !== "undefined" && localStorage.getItem(storageKey)) return;
      localStorage.setItem(storageKey, "1");
    } catch {}

    setOpts(o);
    setOpen(true);
  }, []);

  return (
    <FeedbackContext.Provider value={{ showFeedback }}>
      {children}
      <FeedbackModal
        open={open}
        feature={opts.feature}
        analysisId={opts.analysisId}
        onClose={() => setOpen(false)}
      />
    </FeedbackContext.Provider>
  );
}
