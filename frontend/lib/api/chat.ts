import { apiClient } from "./client";

export const chatApi = {
  getStatus: async () => {
    const { data } = await apiClient.get("/chat/status");
    return data as {
      plan: string;
      is_pro: boolean;
      chat_tokens_used: number;
      chat_tokens_limit: number;
      chat_tokens_remaining: number;
      pct_used: number;
      warning: boolean;
      interview_credits: number;
    };
  },

  getSessions: async () => {
    const { data } = await apiClient.get("/chat/sessions");
    return data as { session_id: string; preview: string; created_at: string }[];
  },

  getHistory: async (sessionId: string) => {
    const { data } = await apiClient.get(`/chat/history/${sessionId}`);
    return data as { role: "user" | "assistant"; content: string; created_at: string }[];
  },

  /** Returns a fetch Response with a ReadableStream body (SSE). */
  sendMessage: async (
    message: string,
    history: { role: "user" | "assistant"; content: string }[],
    sessionId?: string,
  ): Promise<Response> => {
    const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    // Get auth token
    const { createBrowserClient } = await import("@supabase/ssr");
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";

    return fetch(`${API_BASE}/api/v1/chat/send`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ message, history, session_id: sessionId }),
    });
  },
};
