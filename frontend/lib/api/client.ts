import axios from "axios";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export const apiClient = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  headers: { "Content-Type": "application/json" },
  timeout: 60000,
});

// Attach Supabase JWT to every request
apiClient.interceptors.request.use(async (config) => {
  if (typeof window !== "undefined") {
    const { createBrowserClient } = await import("@supabase/ssr");
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) {
      config.headers.Authorization = `Bearer ${session.access_token}`;
    }
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Session expired or unauthorized — redirect to login
    if (error.response?.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login?reason=session_expired";
      return Promise.reject(new Error("Session expired. Redirecting to login…"));
    }

    // Network error (no response at all)
    if (!error.response) {
      const isTimeout = error.code === "ECONNABORTED";
      return Promise.reject(
        new Error(
          isTimeout
            ? "Request timed out. The server may be busy — please try again."
            : "Network error. Check your connection and try again."
        )
      );
    }

    // Server sent a meaningful error message
    const message =
      error.response?.data?.detail ||
      error.response?.data?.message ||
      error.message ||
      "An unexpected error occurred";

    return Promise.reject(new Error(message));
  }
);
