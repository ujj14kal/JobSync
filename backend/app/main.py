"""
JobSync FastAPI Backend — Cloud Run production entry point
"""
from contextlib import asynccontextmanager
import asyncio
import time
import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.api.v1.router import api_router

logger = structlog.get_logger()

# Track startup time for health reporting
_startup_time = time.time()
_ready = False


async def _warm_start_services() -> None:
    """Load optional heavy services after Cloud Run can route to the app.

    Strategy: run embedding + predictor in parallel (both are independent),
    then load the neural scorer — which reuses the already-loaded sentence model
    so SentenceTransformer is only downloaded/initialised once instead of twice.
    Total cold-start load time drops from ~25s to ~12s.
    """
    def _load_embedding():
        from app.services.embedding_service import _load_model
        _load_model()

    def _load_predictor():
        try:
            from app.services.model_trainer import get_trained_predictor
            return get_trained_predictor()
        except Exception:
            return None

    # Step 1: embedding model + predictor in parallel (independent, no shared state)
    t0 = time.time()
    results = await asyncio.gather(
        asyncio.to_thread(_load_embedding),
        asyncio.to_thread(_load_predictor),
        return_exceptions=True,
    )
    emb_result, pred_result = results
    if isinstance(emb_result, Exception):
        logger.warning("Embedding model load failed", error=str(emb_result))
    else:
        logger.info("Embedding model loaded", elapsed=round(time.time() - t0, 1))

    if isinstance(pred_result, Exception):
        logger.warning("Predictor load failed", error=str(pred_result))
    elif pred_result:
        logger.info("Trained predictor loaded", type=getattr(pred_result, "model_type", "?"))

    # Step 2: neural scorer — model_loader reuses the sentence model already in memory
    try:
        from app.services.model_loader import startup_load
        loaded = await asyncio.to_thread(startup_load)
        if loaded:
            logger.info("✅ Neural scorer loaded", elapsed=round(time.time() - t0, 1))
        else:
            logger.info("Neural scorer not available — using Groq fallback")
    except Exception as e:
        logger.warning("Neural scorer load failed (non-fatal)", error=str(e))


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

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception", path=str(request.url.path), error=str(exc), exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred. Please try again."},
    )


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
