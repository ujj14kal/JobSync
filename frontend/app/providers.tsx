"use client";

import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { Toaster } from "sonner";

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
