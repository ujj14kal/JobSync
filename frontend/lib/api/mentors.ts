import { apiClient } from "./client";
import type { Mentor } from "@/lib/types";

export const mentorsApi = {
  // Get mentor recommendations for an analysis
  forAnalysis: async (analysisId: string): Promise<Mentor[]> => {
    const { data } = await apiClient.get(`/mentors/recommendations/${analysisId}`);
    return data;
  },

  // Generic mentor search
  search: async (params: {
    role?: string;
    company?: string;
    skills?: string[];
    career_stage?: string;
    platform?: string;
  }): Promise<Mentor[]> => {
    const { data } = await apiClient.post("/mentors/search", params);
    return data;
  },

  // Discover from Unstop
  discoverUnstop: async (params: {
    target_role: string;
    target_company?: string;
    skills: string[];
  }): Promise<Mentor[]> => {
    const { data } = await apiClient.post("/mentors/discover/unstop", params);
    return data;
  },
};
