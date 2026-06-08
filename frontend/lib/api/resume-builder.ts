import { apiClient } from "./client";

export interface ResumeBuilderStatus {
  plan: "free" | "pro";
  model: "jobsynk-ai" | "claude-sonnet";
  uses_used: number;
  uses_limit: number;
  uses_remaining: number;
  locked: boolean;
  requires_pro: boolean;
}

export const resumeBuilderApi = {
  getStatus: async (): Promise<ResumeBuilderStatus> => {
    const { data } = await apiClient.get("/resume-builder/status");
    return data;
  },
};
