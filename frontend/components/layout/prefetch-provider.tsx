"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { analysisApi } from "@/lib/api/analysis";
import { resumeApi } from "@/lib/api/resume";
import { jobApplicationsApi } from "@/lib/api/job-applications";

const CORE_STALE = 5 * 60 * 1000;

export function PrefetchProvider() {
  const qc = useQueryClient();

  useEffect(() => {
    // Fire all core queries in parallel the moment the dashboard mounts.
    // prefetchQuery is a no-op if the data is already fresh in cache (from localStorage persistence).
    qc.prefetchQuery({ queryKey: ["analyses"], queryFn: analysisApi.list, staleTime: CORE_STALE });
    qc.prefetchQuery({ queryKey: ["resumes"], queryFn: resumeApi.list, staleTime: CORE_STALE });
    qc.prefetchQuery({ queryKey: ["job-applications"], queryFn: () => jobApplicationsApi.list(), staleTime: CORE_STALE });
    qc.prefetchQuery({ queryKey: ["job-application-stats"], queryFn: jobApplicationsApi.stats, staleTime: CORE_STALE });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
