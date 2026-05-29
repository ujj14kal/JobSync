import { apiClient } from "./client";

export type AppStatus = "saved" | "applied" | "screening" | "interviewing" | "offer" | "rejected" | "withdrawn";

export interface JobApplication {
  id: string;
  user_id: string;
  job_title: string;
  company: string;
  job_url?: string;
  job_id?: string;
  analysis_id?: string;
  status: AppStatus;
  applied_date?: string;
  notes?: string;
  salary_min?: number;
  salary_max?: number;
  currency: string;
  location?: string;
  job_type: string;
  work_mode: string;
  priority: "low" | "medium" | "high";
  ats_score?: number;
  follow_up_date?: string;
  rejection_reason?: string;
  offer_amount?: number;
  created_at: string;
  updated_at: string;
}

export interface ApplicationStats {
  total: number;
  by_status: Record<string, number>;
  avg_ats_score: number | null;
  response_rate: number;
  offers: number;
  rejections: number;
}

export const jobApplicationsApi = {
  list: async (status?: AppStatus): Promise<JobApplication[]> => {
    const params = status ? { status_filter: status } : {};
    const { data } = await apiClient.get("/jobs/applications", { params });
    return data;
  },

  create: async (body: Partial<JobApplication>): Promise<JobApplication> => {
    const { data } = await apiClient.post("/jobs/applications", body);
    return data;
  },

  update: async (id: string, body: Partial<JobApplication>): Promise<JobApplication> => {
    const { data } = await apiClient.patch(`/jobs/applications/${id}`, body);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/jobs/applications/${id}`);
  },

  stats: async (): Promise<ApplicationStats> => {
    const { data } = await apiClient.get("/jobs/applications/stats");
    return data;
  },
};
