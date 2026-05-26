import { apiClient } from "./client";
import type { Analysis, JobDescription, JobSearchInput, ServiceStatus } from "@/lib/types";

export const analysisApi = {
  // Search and scrape job description
  searchJob: async (input: JobSearchInput): Promise<JobDescription> => {
    const { data } = await apiClient.post("/jobs/search", input);
    return data;
  },

  // Trigger full ATS analysis
  create: async (params: {
    resume_id: string;
    job_id: string;
  }): Promise<Analysis> => {
    const { data } = await apiClient.post("/analysis", params);
    return data;
  },

  // Poll analysis status
  get: async (id: string): Promise<Analysis> => {
    const { data } = await apiClient.get(`/analysis/${id}`);
    return data;
  },

  // List user's analyses
  list: async (): Promise<Analysis[]> => {
    const { data } = await apiClient.get("/analysis");
    return data;
  },

  // Re-trigger analysis
  retry: async (id: string): Promise<Analysis> => {
    const { data } = await apiClient.post(`/analysis/${id}/retry`);
    return data;
  },

  // Get rewritten bullets only
  rewriteBullets: async (params: {
    resume_id: string;
    job_id: string;
  }): Promise<Analysis["rewritten_bullets"]> => {
    const { data } = await apiClient.post("/improve/bullets", params);
    return data;
  },

  // Service capacity status (public, no auth required, poll every 10 s)
  getStatus: async (): Promise<ServiceStatus> => {
    const { data } = await apiClient.get("/analysis/status");
    return data;
  },
};
