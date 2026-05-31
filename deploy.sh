#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# JobSync — Zero-cost deploy script
#
# Builds locally (no Cloud Build) and pushes to GitHub Container Registry
# (ghcr.io) which is free. Cloud Run pulls from ghcr.io at no charge.
#
# Usage:
#   cd ~/Documents/GitHub/JobSync && ./deploy.sh
#   ./deploy.sh --dry-run   # print commands without running
#
# One-time prerequisites:
#   1. docker login ghcr.io -u ujj14kal --password-stdin <<< "$GITHUB_TOKEN"
#      (create token at GitHub → Settings → Developer settings → PAT → write:packages)
#   2. gcloud auth login && gcloud config set project jobsync-497608
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
GITHUB_USER="ujj14kal"
IMAGE="ghcr.io/${GITHUB_USER}/jobsync-api"
SERVICE_NAME="jobsync"
REGION="asia-south1"
PROJECT_ID="jobsync-497608"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true; shift;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  JobSync → Google Cloud Run  (₹0 deploy)    ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Image   : ${IMAGE}:${TAG}"
echo "║  Service : ${SERVICE_NAME}  (${REGION})"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Build: local Docker  (no Cloud Build, no cost)"
echo "  Push : ghcr.io       (free GitHub registry)"
echo "  Run  : Cloud Run     (scale-to-zero, free tier)"
echo ""
echo "   cd ~/Documents/GitHub/JobSync && ./deploy.sh"
echo ""
read -rp "Type 'deploy' to confirm: " CONFIRM
if [[ "$CONFIRM" != "deploy" ]]; then
  echo "Aborted."
  exit 0
fi
echo ""

run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY RUN] $*"
  else
    "$@"
  fi
}

# ── Build locally ─────────────────────────────────────────────────────────────
echo "🐳  Building Docker image locally..."
run docker build \
  --file backend/Dockerfile \
  --tag "${IMAGE}:${TAG}" \
  --tag "${IMAGE}:latest" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  backend/

# ── Push to ghcr.io ───────────────────────────────────────────────────────────
echo "📤  Pushing to ghcr.io (free)..."
run docker push "${IMAGE}:${TAG}"
run docker push "${IMAGE}:latest"

# ── Deploy to Cloud Run ───────────────────────────────────────────────────────
echo "🚀  Deploying to Cloud Run (${REGION})..."
run gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE}:${TAG}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --concurrency=8 \
  --min-instances=0 \
  --max-instances=3 \
  --timeout=300 \
  --set-env-vars="APP_VERSION=${TAG},DEBUG=false,SUPABASE_URL=https://dzdziagugdcbkictslrt.supabase.co,SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6ZHppYWd1Z2RjYmtpY3RzbHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTcwMjYsImV4cCI6MjA5NTQzMzAyNn0.1nf7Um3PDSZMzHaBmf2bIzgEqzwpClEp1i_leRnLBYE,MAX_CONCURRENT_ANALYSES=8,MAX_CONCURRENT_LLM_CALLS=3,BACKEND_CORS_ORIGINS=[\"https://job-sync-gilt.vercel.app\",\"https://job-sync-ujj14kals-projects.vercel.app\",\"http://localhost:3000\"]" \
  --set-secrets="GROQ_API_KEY=groq-api-key:latest,SUPABASE_SERVICE_ROLE_KEY=supabase-service-role-key:latest,FIREBASE_SERVICE_ACCOUNT_JSON=firebase-service-account:latest,ELEVENLABS_API_KEY=JOBSYNC_ELEVENLABS_KEY:latest"

# ── Done ──────────────────────────────────────────────────────────────────────
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" --project="${PROJECT_ID}" \
  --format="value(status.url)" 2>/dev/null || echo "")

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✅  Deployed! Cost: ₹0                      ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  URL: ${SERVICE_URL}"
echo "╚══════════════════════════════════════════════╝"
echo ""
