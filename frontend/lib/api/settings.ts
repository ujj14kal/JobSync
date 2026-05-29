import { apiClient } from "./client";

export interface UserSettings {
  user_id: string;
  email_notifications: boolean;
  analysis_notifications: boolean;
  mentor_notifications: boolean;
  weekly_digest: boolean;
  marketing_emails: boolean;
  default_resume_id?: string;
  career_stage: string;
  target_roles: string[];
  target_companies: string[];
  preferred_job_types: string[];
  preferred_work_modes: string[];
  preferred_locations: string[];
  salary_expectation_min?: number;
  salary_expectation_max?: number;
  salary_currency: string;
  scoring_weights: {
    ats: number;
    technical: number;
    semantic: number;
    recruiter: number;
    projects: number;
  };
  profile_public: boolean;
  share_analytics: boolean;
  theme: string;
  language: string;
  timezone: string;
}

export const settingsApi = {
  get: async (): Promise<UserSettings> => {
    const { data } = await apiClient.get("/settings");
    return data;
  },

  update: async (body: Partial<UserSettings>): Promise<UserSettings> => {
    const { data } = await apiClient.patch("/settings", body);
    return data;
  },

  getProfile: async () => {
    const { data } = await apiClient.get("/settings/profile");
    return data;
  },

  updateProfile: async (body: { full_name?: string; career_stage?: string; target_role?: string; target_company?: string; industry?: string }) => {
    const { data } = await apiClient.patch("/settings/profile", body);
    return data;
  },

  deleteAccount: async () => {
    const { data } = await apiClient.delete("/settings/account");
    return data;
  },
};
