import { apiClient } from "./client";
import type { Resume } from "@/lib/types";

export const resumeApi = {
  upload: async (file: File, onProgress?: (pct: number) => void): Promise<Resume> => {
    const form = new FormData();
    form.append("file", file);
    const { data } = await apiClient.post("/resume/upload", form, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded * 100) / e.total));
        }
      },
    });
    return data;
  },

  list: async (): Promise<Resume[]> => {
    const { data } = await apiClient.get("/resume");
    return data;
  },

  get: async (id: string): Promise<Resume> => {
    const { data } = await apiClient.get(`/resume/${id}`);
    return data;
  },

  setActive: async (id: string): Promise<Resume> => {
    const { data } = await apiClient.patch(`/resume/${id}/activate`);
    return data;
  },

  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/resume/${id}`);
  },
};
