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

// Custom error class so callers can distinguish credit warnings
export class CreditWarningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditWarningError";
  }
}

// Custom error class that preserves the HTTP status code
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Session expired or unauthorized — redirect to login
    if (error.response?.status === 401 && typeof window !== "undefined") {
      window.location.href = "/login?reason=session_expired";
      return Promise.reject(new Error("Session expired. Redirecting to login…"));
    }

    // 403 from Claude quota check → show credit warning toast globally
    if (error.response?.status === 403 && typeof window !== "undefined") {
      const detail =
        error.response?.data?.detail ||
        error.response?.data?.message ||
        "";
      // Detect the "credits for different service" message from check_feature_quota
      const isCreditWarning =
        typeof detail === "string" &&
        detail.includes("credit") &&
        detail.includes("Claude is available only for");

      if (isCreditWarning) {
        window.dispatchEvent(
          new CustomEvent("jobsync:credit-warning", { detail })
        );
        return Promise.reject(new CreditWarningError(detail));
      }
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

    return Promise.reject(new ApiError(message, error.response.status));
  }
);
