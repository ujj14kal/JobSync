// ─── User ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  full_name: string;
  avatar_url?: string;
  career_stage: "student" | "entry" | "mid" | "senior";
  target_role?: string;
  target_company?: string;
  industry?: string;
  created_at: string;
  updated_at: string;
}

// ─── Resume ──────────────────────────────────────────────────────────────────

export interface ParsedResume {
  contact: {
    name?: string;
    email?: string;
    phone?: string;
    location?: string;
    linkedin?: string;
    github?: string;
    portfolio?: string;
  };
  summary?: string;
  skills: string[];
  experience: WorkExperience[];
  education: Education[];
  projects: Project[];
  certifications: Certification[];
  languages?: string[];
  raw_sections: Record<string, string>;
}

export interface WorkExperience {
  title: string;
  company: string;
  location?: string;
  start_date: string;
  end_date?: string;
  is_current: boolean;
  bullets: string[];
}

export interface Education {
  degree: string;
  institution: string;
  location?: string;
  start_date?: string;
  end_date?: string;
  gpa?: string;
  relevant_courses?: string[];
}

export interface Project {
  name: string;
  description: string;
  tech_stack: string[];
  url?: string;
  bullets: string[];
}

export interface Certification {
  name: string;
  issuer: string;
  date?: string;
  url?: string;
}

export interface Resume {
  id: string;
  user_id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  raw_text: string;
  parsed_data: ParsedResume;
  is_active: boolean;
  created_at: string;
}

// ─── Job ─────────────────────────────────────────────────────────────────────

export interface ParsedJob {
  title: string;
  company: string;
  location?: string;
  job_type?: string;
  experience_level?: string;
  salary_range?: string;
  requirements: string[];
  responsibilities: string[];
  required_skills: string[];
  preferred_skills: string[];
  qualifications: string[];
  tech_stack: string[];
  keywords: string[];
  about_company?: string;
}

export interface JobDescription {
  id: string;
  company_name: string;
  job_title: string;
  job_id_external?: string;
  source_url?: string;
  raw_text: string;
  parsed_data: ParsedJob;
  scraped_at: string;
  created_at: string;
}

export interface JobSearchInput {
  company_name?: string;
  job_title?: string;
  job_id?: string;
  job_url?: string;
}

// ─── Analysis ────────────────────────────────────────────────────────────────

export interface ScoreBreakdown {
  overall_score: number;
  ats_score: number;
  technical_fit_score: number;
  semantic_match_score: number;
  recruiter_impression_score: number;
  project_relevance_score: number;
}

export interface Strength {
  title: string;
  description: string;
  impact: "high" | "medium" | "low";
}

export interface Weakness {
  title: string;
  description: string;
  severity: "critical" | "major" | "minor";
  section: string;
}

export interface MissingKeyword {
  keyword: string;
  importance: "required" | "preferred" | "nice_to_have";
  context: string;
  category: string;
}

export interface SkillGap {
  skill: string;
  importance: "critical" | "important" | "nice_to_have";
  how_to_acquire: string;
  time_to_learn: string;
  resources: string[];
}

export interface BulletRewrite {
  original: string;
  rewritten: string;
  improvement_reason: string;
  section: string;
  metrics_added: boolean;
}

export interface ImprovementSuggestion {
  category: string;
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
  action: string;
}

export interface Analysis {
  id: string;
  user_id: string;
  resume_id: string;
  job_id: string;
  resume?: Resume;
  job?: JobDescription;

  scores: ScoreBreakdown;
  strengths: Strength[];
  weaknesses: Weakness[];
  missing_keywords: MissingKeyword[];
  skill_gaps: SkillGap[];
  improvement_suggestions: ImprovementSuggestion[];
  rewritten_bullets: BulletRewrite[];
  recruiter_summary: string;

  status: "pending" | "processing" | "complete" | "failed";
  created_at: string;
}

// ─── Mentor ──────────────────────────────────────────────────────────────────

export interface Mentor {
  id: string;
  name: string;
  title: string;
  company: string;
  platform: "unstop" | "adplist" | "linkedin" | "mentorcruise" | "toptal" | "other";
  profile_url: string;
  avatar_url?: string;
  specializations: string[];
  industries: string[];
  career_stages: string[];
  availability: string;
  session_format: string;
  bio: string;
  rating?: number;
  review_count?: number;
  is_verified: boolean;
  // Pricing
  is_free: boolean;
  price_per_session?: number;
  currency?: string;
  pricing_model?: "free" | "per_session" | "subscription";
  price_display?: string;
  // Matching
  match_score?: number;
  match_reasons?: string[];
}

// ─── Career Insights ─────────────────────────────────────────────────────────

export interface CareerInsight {
  role: string;
  industry: string;
  trending_skills: TrendingSkill[];
  salary_range: SalaryRange;
  job_market: JobMarketData;
  growth_projection: string;
  top_companies: string[];
  career_paths: CareerPath[];
}

export interface TrendingSkill {
  skill: string;
  trend: "rising" | "stable" | "declining";
  demand_score: number;
  yoy_change: number;
}

export interface SalaryRange {
  currency: string;
  entry: { min: number; max: number };
  mid: { min: number; max: number };
  senior: { min: number; max: number };
  location?: string;
}

export interface JobMarketData {
  openings_count: number;
  competition_level: "low" | "medium" | "high";
  avg_response_rate: number;
  top_ats_systems: string[];
}

export interface CareerPath {
  from: string;
  to: string;
  avg_transition_time: string;
  required_skills: string[];
}

// ─── Service Status ──────────────────────────────────────────────────────────

export interface ServiceStatus {
  active_analyses: number;
  max_concurrent: number;
  slots_available: number;
  at_capacity: boolean;
  utilization_pct: number;
  daily_limit_per_user: number;
  message: string;
  slots: { analysis_id: string; running_for_s: number }[];
}

// ─── API Responses ───────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
  has_more: boolean;
}

// ─── UI State ────────────────────────────────────────────────────────────────

export interface UploadState {
  file: File | null;
  progress: number;
  status: "idle" | "uploading" | "parsing" | "success" | "error";
  error?: string;
  result?: Resume;
}

export interface AnalysisState {
  status: "idle" | "searching_job" | "analyzing" | "complete" | "error";
  progress: number;
  step: string;
  error?: string;
}
