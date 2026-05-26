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
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_ROLE_KEY: str = ""
    SUPABASE_ANON_KEY: str = ""

    # Groq (free LLM)
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_FAST_MODEL: str = "llama-3.1-8b-instant"

    # HuggingFace (optional)
    HUGGINGFACE_API_KEY: str = ""

    # Embeddings
    EMBEDDING_MODEL: str = "sentence-transformers/all-MiniLM-L6-v2"
    EMBEDDING_DIMENSION: int = 384

    # Rate limiting
    MAX_ANALYSES_PER_DAY: int = 10          # per user per day (free-tier safe)
    MAX_CONCURRENT_ANALYSES: int = 5        # global slot cap across all users
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
