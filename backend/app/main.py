"""
JobSync FastAPI Backend — Cloud Run production entry point
"""
from contextlib import asynccontextmanager
import asyncio
import time
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api.v1.router import api_router

logger = structlog.get_logger()

# Track startup time for health reporting
_startup_time = time.time()
_ready = False


async def _warm_start_services() -> None:
    """Load optional heavy services after Cloud Run can route to the app."""
    # Pre-load embedding model without blocking container port binding.
    try:
        from app.services.embedding_service import _load_model
        await asyncio.to_thread(_load_model)
        logger.info("Embedding model loaded")
    except Exception as e:
        logger.warning("Embedding model load failed", error=str(e))

    # Try loading trained ML predictor (non-blocking).
    try:
        from app.services.model_trainer import get_trained_predictor
        predictor = await asyncio.to_thread(get_trained_predictor)
        if predictor:
            logger.info("Trained predictor loaded", type=predictor.model_type)
        else:
            logger.info("Using cold-start rule-based predictor")
    except Exception as e:
        logger.warning("Predictor load failed", error=str(e))


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown lifecycle."""
    global _ready
    logger.info("Starting JobSync API", version=settings.APP_VERSION)

    # 1. Configure concurrency slots
    from app.services import active_tracker
    active_tracker.configure(settings.MAX_CONCURRENT_ANALYSES)

    _ready = True
    asyncio.create_task(_warm_start_services())
    logger.info(
        "JobSync API ready",
        startup_secs=round(time.time() - _startup_time, 1),
        version=settings.APP_VERSION,
    )

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

# ─── Middleware ───────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Queue-Position", "X-Request-ID"],
)

# ─── Routes ───────────────────────────────────────────────────────────────────

app.include_router(api_router)


# ─── Health & root ────────────────────────────────────────────────────────────

@app.get("/health", include_in_schema=False)
async def health_check():
    """
    Cloud Run startup + liveness probe.
    Returns 503 while model is still loading (forces probe retry).
    """
    if not _ready:
        return JSONResponse(
            status_code=503,
            content={"status": "starting", "message": "Loading models..."},
        )

    from app.services.concurrency_manager import current_load
    from app.services.model_trainer import training_status

    load = current_load()
    training = training_status()

    return {
        "status": "ok",
        "version": settings.APP_VERSION,
        "uptime_secs": round(time.time() - _startup_time),
        "load": {
            "active": load["active_analyses"],
            "max": load["max_analyses"],
            "utilization_pct": load["utilization_pct"],
        },
        "model": {
            "inference": "ollama" if settings.OLLAMA_BASE_URL else "groq",
            "training_phase": training["phase"],
        },
    }


@app.get("/", include_in_schema=False)
async def root():
    return {
        "name": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "ok",
        "docs": "/docs" if settings.DEBUG else "disabled in production",
    }
