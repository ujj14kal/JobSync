"use client";

import { useEffect } from "react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { Toaster, toast } from "sonner";
import { createClient } from "@/lib/supabase/client";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,       // 5 min — don't refetch if fresh
      gcTime: 30 * 60 * 1000,          // 30 min — keep in memory after unmount
      refetchOnWindowFocus: false,      // don't refetch on tab switch
      refetchOnReconnect: "always",
      retry: 1,
    },
  },
});

// No-op storage for SSR, real localStorage on client
const storage = typeof window !== "undefined"
  ? window.localStorage
  : { getItem: () => null, setItem: () => {}, removeItem: () => {} };

const persister = createSyncStoragePersister({
  storage,
  key: "jobsynk-qc",
  throttleTime: 1000,
});

const CACHE_KEY = "jobsynk-qc";
const UID_KEY   = "jobsynk-uid";

// Clears the React Query cache and its localStorage snapshot.
// Called whenever a different user signs in or any user signs out —
// prevents one user from seeing another's persisted query data.
function AuthCacheBuster() {
  const qc = useQueryClient();

  useEffect(() => {
    const supabase = createClient();

    // On mount: if the stored uid doesn't match the active session, nuke the cache.
    supabase.auth.getUser().then(({ data }) => {
      const currentUid = data.user?.id ?? null;
      const storedUid  = localStorage.getItem(UID_KEY);

      if (!currentUid) {
        // Not signed in — clear any leftover cache from a previous session.
        qc.clear();
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(UID_KEY);
      } else if (storedUid && storedUid !== currentUid) {
        // Different user than what's cached — clear before they see anything.
        qc.clear();
        localStorage.removeItem(CACHE_KEY);
        localStorage.setItem(UID_KEY, currentUid);
      } else if (!storedUid) {
        localStorage.setItem(UID_KEY, currentUid);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        qc.clear();
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(UID_KEY);
        return;
      }

      if (event === "SIGNED_IN" && session?.user) {
        const prevUid = localStorage.getItem(UID_KEY);
        const newUid  = session.user.id;
        if (prevUid && prevUid !== newUid) {
          qc.clear();
          localStorage.removeItem(CACHE_KEY);
        }
        localStorage.setItem(UID_KEY, newUid);
      }
    });

    return () => subscription.unsubscribe();
  }, [qc]);

  return null;
}

// Global listener for Claude credit warning events (fired by apiClient interceptor)
function CreditWarningListener() {
  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<string>).detail;
      toast.warning(msg, {
        duration: 8000,
        style: {
          background: "rgba(234,179,8,0.12)",
          border: "1px solid rgba(234,179,8,0.4)",
          color: "#fef08a",
        },
        icon: "⚡",
      });
    };
    window.addEventListener("jobsync:credit-warning", handler);
    return () => window.removeEventListener("jobsync:credit-warning", handler);
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: 24 * 60 * 60 * 1000, // discard cache older than 24h
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => query.state.status === "success",
        },
      }}
    >
      <AuthCacheBuster />
      <CreditWarningListener />
      {children}
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--bg-elevated)",
            border: "1px solid var(--border-default)",
            color: "var(--text-primary)",
            fontFamily: "var(--font-geist-sans)",
          },
        }}
      />
    </PersistQueryClientProvider>
  );
}
