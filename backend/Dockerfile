# ─────────────────────────────────────────────────────────────────────────────
# JobSync API — Cloud Run optimised multi-stage Dockerfile
#
# Stage 1 (builder): install Python deps + pre-download ML model
# Stage 2 (runtime): lean image, no build tools, baked-in model
#
# Final image ≈ 2.1 GB  (PyTorch CPU-only + sentence-transformers)
# Cloud Run:  2 GB RAM · 2 vCPU · min-instances=0
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: builder ─────────────────────────────────────────────────────────
FROM python:3.11-slim AS builder

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential libpq-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .

# CPU-only PyTorch first (avoids 3 GB CUDA build)
RUN pip install --no-cache-dir \
    torch==2.3.1 --index-url https://download.pytorch.org/whl/cpu

RUN pip install --no-cache-dir -r requirements.txt

# Pre-bake the sentence-transformer model — eliminates cold-start HF download
RUN python -c "\
from sentence_transformers import SentenceTransformer; \
m = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2'); \
print('Model cached:', m.get_sentence_embedding_dimension(), 'dims')"


# ── Stage 2: runtime ─────────────────────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Runtime libs only (no build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 curl \
    libnss3 libnspr4 libdbus-1-3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 libxdamage1 \
    libxfixes3 libxrandr2 libgbm1 libasound2 \
    && rm -rf /var/lib/apt/lists/*

# Copy installed packages and pre-cached model from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin
COPY --from=builder /root/.cache /root/.cache

# Copy application source
COPY . .

# Install Playwright Chromium (graceful skip if it fails)
RUN playwright install chromium --with-deps 2>/dev/null || \
    echo "Playwright install skipped"

# Trained-model directory
RUN mkdir -p /app/models

# Non-root user (Cloud Run best practice)
RUN useradd -m -u 1000 appuser \
    && chown -R appuser:appuser /app /root/.cache
USER appuser

# Cloud Run injects PORT (default 8080)
ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=90s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

# Single worker — Cloud Run scales via instances, not workers
CMD exec uvicorn app.main:app \
    --host 0.0.0.0 \
    --port ${PORT} \
    --workers 1 \
    --loop uvloop \
    --http h11 \
    --log-level info \
    --timeout-keep-alive 75
