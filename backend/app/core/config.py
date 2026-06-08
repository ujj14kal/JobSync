from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import List
import json


class Settings(BaseSettings):
    # App
    APP_NAME: str = "JobSync API"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False

    # Security
    SECRET_KEY: str = "change-me-in-production-minimum-32-chars"
    ALGORITHM: str = "HS256"

    # CORS
    BACKEND_CORS_ORIGINS: str = '["http://localhost:3000"]'

    @property
    def cors_origins(self) -> List[str]:
        return json.loads(self.BACKEND_CORS_ORIGINS)

    # Supabase
    SUPABASE_URL: str = "https://dzdziagugdcbkictslrt.supabase.co"
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_ANON_KEY: str = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6ZHppYWd1Z2RjYmtpY3RzbHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTcwMjYsImV4cCI6MjA5NTQzMzAyNn0.1nf7Um3PDSZMzHaBmf2bIzgEqzwpClEp1i_leRnLBYE"

    # Firebase (phone auth)
    FIREBASE_SERVICE_ACCOUNT_JSON: str = ""  # JSON string of service account key

    # Groq (free LLM)
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_FAST_MODEL: str = "llama-3.1-8b-instant"

    # HuggingFace (optional)
    HUGGINGFACE_API_KEY: str = ""

    # Google OAuth (Gmail sync — free)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/v1/gmail/callback"
    FRONTEND_URL: str = "http://localhost:3000"

    # ElevenLabs (paid-tier TTS for AI voice interviews)
    # Creator plan: $11/month = ₹918 for 100K chars. Per-call capped at 300 chars (server-enforced).
    # A full voice session (~10 questions × 300 chars) = 3,000 chars ≈ ₹28 cost.
    # Access requires Pro plan OR a purchased voice interview credit (₹349).
    ELEVENLABS_API_KEY: str = ""
    ELEVENLABS_VOICE_ID: str = "9BWtsMINqrJLrRacOk9x"  # Aria — conversational, natural American female

    # Anthropic Claude (paid features only — Sonnet for all Pro tier)
    ANTHROPIC_API_KEY: str = ""
    CLAUDE_MODEL: str = "claude-sonnet-4-5"      # Pro tier: all features
    CLAUDE_MODEL_FAST: str = "claude-haiku-4-5"  # reserved for future lightweight tasks

    # Razorpay (Indian payments — 2% per txn, no monthly fee)
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""
    # Plan IDs created once in Razorpay dashboard:
    RAZORPAY_PLAN_MONTHLY: str = ""   # ₹299/month
    RAZORPAY_PLAN_YEARLY: str = ""    # ₹2499/year

    # INR/USD rate for cost tracking
    USD_TO_INR: float = 83.5

    # Pro tier monthly limits (enforced server-side)
    # Cost breakdown per Pro user worst-case (₹299/month revenue):
    #   Resume × 5  : Claude Sonnet ~₹27.50  (5 × 4K output + 2K input)
    #   Chat 50K tok: Claude Sonnet ~₹25.00
    #   Voice × 1   : ElevenLabs   ~₹28.00  (1 session × 3K chars)
    #   Everything else (ATS, interviews, covers): Groq = ₹0.00 (free tier)
    #   ─────────────────────────────────────────────────────
    #   Total worst-case AI cost: ~₹80   →  margin ~73% on ₹299
    PRO_MONTHLY_ATS: int = 15           # Groq → free; limit is fair-use cap only
    PRO_MONTHLY_RESUMES: int = 5        # Claude → ~₹27.50 total
    PRO_MONTHLY_COVERS: int = 5         # Groq → free; bumped from 3 (more generous)
    PRO_MONTHLY_INTERVIEWS: int = 10    # Groq → free; bumped from 2 (more generous)
    PRO_MONTHLY_VOICE: int = 2          # ElevenLabs → ~₹56 total; bumped from 1
    PRO_MONTHLY_CHAT_TOKENS: int = 50000   # Claude → ~₹25 worst-case (~35-40 msgs)

    # Embeddings
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION: int = 384

    # Local inference (Ollama)
    OLLAMA_BASE_URL: str = "http://localhost:11434"  # set to "" to disable Ollama

    # Rate limiting & concurrency
    MAX_ANALYSES_PER_DAY: int = 10
    MAX_CONCURRENT_ANALYSES: int = 8        # global slot cap across all users
    MAX_CONCURRENT_LLM_CALLS: int = 3       # LLM sub-slot cap
    MAX_QUEUE_DEPTH: int = 50               # reject at this queue depth
    USER_ANALYSIS_TIMEOUT: float = 120.0    # seconds before queued request times out
    GROQ_SEMAPHORE_LIMIT: int = 5           # max concurrent Groq requests
    GROQ_RPM_LIMIT: int = 25                # requests/min ceiling (hard limit is 30)
    SCRAPING_TIMEOUT: int = 30

    # Cache TTLs (hours)
    JOB_CACHE_TTL_HOURS: int = 24
    INSIGHTS_CACHE_TTL_HOURS: int = 24   # insights rarely change; was 6
    MENTOR_CACHE_TTL_HOURS: int = 48     # mentor profiles are stable

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
