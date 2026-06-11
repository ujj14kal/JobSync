import { apiClient } from "./client";

export type AppStatus = "saved" | "applied" | "screening" | "interviewing" | "offer" | "rejected" | "withdrawn";

export interface StatusHistoryEntry {
  status: AppStatus;
  timestamp: string;
  note?: string;
}

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
  status_history?: StatusHistoryEntry[];
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
  weekly_activity?: { week: string; count: number }[];
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

// ── Gmail sync API ─────────────────────────────────────────────────────────────

export interface GmailStatus {
  connected: boolean;
  gmail_email?: string;
  last_synced_at?: string;
}

export interface GmailSyncUpdate {
  company: string;
  old_status: AppStatus;
  new_status: AppStatus;
  subject: string;
}

export interface GmailNewApplication {
  id?: string;
  company: string;
  job_title: string;
  new_status: AppStatus;
  subject: string;
}

export interface GmailSyncResult {
  updates: GmailSyncUpdate[];
  new_applications: GmailNewApplication[];
  emails_checked: number;
  message: string;
}

export const gmailApi = {
  status: async (): Promise<GmailStatus> => {
    const { data } = await apiClient.get("/gmail/status");
    return data;
  },

  getAuthUrl: async (): Promise<{ url: string }> => {
    const { data } = await apiClient.get("/gmail/auth-url");
    return data;
  },

  sync: async (): Promise<GmailSyncResult> => {
    const { data } = await apiClient.post("/gmail/sync");
    return data;
  },

  disconnect: async (): Promise<void> => {
    await apiClient.delete("/gmail/disconnect");
  },
};
