"""
JobSync FastAPI Backend
"""
from contextlib import asynccontextmanager
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import settings
from app.api.v1.router import api_router

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("Starting JobSync API", version=settings.APP_VERSION)

    # Pre-load embedding model to avoid cold start on first request
    try:
        from app.services.embedding_service import _load_model
        _load_model()
        logger.info("Embedding model pre-loaded successfully")
    except Exception as e:
        logger.warning("Could not pre-load embedding model", error=str(e))

    # Install Playwright browsers if not present
    try:
        import subprocess
        subprocess.run(
            ["playwright", "install", "chromium", "--with-deps"],
            check=False,
            capture_output=True,
            timeout=60,
        )
    except Exception:
        pass

    yield
    logger.info("Shutting down JobSync API")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    description="AI-powered career platform API",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan,
)

# ─── Middleware ──────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routes ──────────────────────────────────────────────────────────────────

app.include_router(api_router)


@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "version": settings.APP_VERSION,
        "model": settings.GROQ_MODEL,
    }


@app.get("/")
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "docs": "/docs",
    }
