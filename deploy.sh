#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# JobSync — Google Cloud Run deploy script
#
# Usage:
#   ./deploy.sh                    # deploy to production
#   ./deploy.sh --project my-proj  # override GCP project
#   ./deploy.sh --dry-run          # print commands without running
#
# Prerequisites (one-time setup):
#   1. gcloud auth login
#   2. gcloud config set project YOUR_PROJECT_ID
#   3. Run ./deploy.sh --setup  to create all GCP resources
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
SERVICE_NAME="jobsync-api"
REGION="asia-south1"              # Mumbai — closest to Supabase ap-south-1
REPO_NAME="jobsync"
IMAGE_BASE="asia-south1-docker.pkg.dev"
DRY_RUN=false
SETUP=false

# Parse args
while [[ $# -gt 0 ]]; do
  case $1 in
    --project) PROJECT_ID="$2"; shift 2;;
    --dry-run) DRY_RUN=true; shift;;
    --setup)   SETUP=true; shift;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

# Resolve project ID
PROJECT_ID="${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null)}"
if [[ -z "$PROJECT_ID" ]]; then
  echo "❌  No GCP project set. Run: gcloud config set project YOUR_PROJECT_ID"
  exit 1
fi

IMAGE="${IMAGE_BASE}/${PROJECT_ID}/${REPO_NAME}/${SERVICE_NAME}"
TAG=$(git rev-parse --short HEAD 2>/dev/null || echo "latest")

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  JobSync → Google Cloud Run                  ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Project : ${PROJECT_ID}"
echo "║  Region  : ${REGION}"
echo "║  Service : ${SERVICE_NAME}"
echo "║  Tag     : ${TAG}"
echo "╚══════════════════════════════════════════════╝"
echo ""

run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY RUN] $*"
  else
    "$@"
  fi
}

# ── One-time setup ────────────────────────────────────────────────────────────
if [[ "$SETUP" == "true" ]]; then
  echo "🔧  Running one-time GCP setup..."

  # Enable required APIs
  run gcloud services enable \
    run.googleapis.com \
    artifactregistry.googleapis.com \
    cloudbuild.googleapis.com \
    secretmanager.googleapis.com \
    --project="${PROJECT_ID}"

  # Create Artifact Registry repository
  run gcloud artifacts repositories create "${REPO_NAME}" \
    --repository-format=docker \
    --location="${REGION}" \
    --description="JobSync Docker images" \
    --project="${PROJECT_ID}" 2>/dev/null || echo "  Repo already exists"

  # Create service account
  SA_EMAIL="${SERVICE_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
  run gcloud iam service-accounts create "${SERVICE_NAME}" \
    --display-name="JobSync API Service Account" \
    --project="${PROJECT_ID}" 2>/dev/null || echo "  SA already exists"

  # Grant permissions
  for role in \
    "roles/secretmanager.secretAccessor" \
    "roles/cloudtrace.agent" \
    "roles/logging.logWriter"; do
    run gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
      --member="serviceAccount:${SA_EMAIL}" \
      --role="${role}" --quiet
  done

  # Create secrets (you fill in the values interactively)
  echo ""
  echo "📋  Creating secrets in Secret Manager..."
  echo "    You'll be prompted for each value."
  echo ""

  # Read secrets from backend/.env.production (gitignored, never committed)
  ENV_FILE="backend/.env.production"
  if [[ ! -f "$ENV_FILE" ]]; then
    echo "❌  $ENV_FILE not found. Run from repo root after setting up env files."
    exit 1
  fi
  GROQ_KEY=$(grep '^GROQ_API_KEY=' "$ENV_FILE" | cut -d= -f2-)
  SB_KEY=$(grep '^SUPABASE_SERVICE_ROLE_KEY=' "$ENV_FILE" | cut -d= -f2-)

  if [[ -z "$GROQ_KEY" || "$GROQ_KEY" == "<"* ]]; then
    read -rsp "Enter GROQ_API_KEY: " GROQ_KEY; echo
  fi
  if [[ -z "$SB_KEY" || "$SB_KEY" == "<"* ]]; then
    read -rsp "Enter SUPABASE_SERVICE_ROLE_KEY: " SB_KEY; echo
  fi

  echo -n "${GROQ_KEY}" | run gcloud secrets create JOBSYNC_GROQ_API_KEY \
    --data-file=- --project="${PROJECT_ID}" 2>/dev/null || \
    echo -n "${GROQ_KEY}" | run gcloud secrets versions add JOBSYNC_GROQ_API_KEY \
    --data-file=- --project="${PROJECT_ID}"

  echo -n "${SB_KEY}" | run gcloud secrets create JOBSYNC_SUPABASE_SERVICE_KEY \
    --data-file=- --project="${PROJECT_ID}" 2>/dev/null || \
    echo -n "${SB_KEY}" | run gcloud secrets versions add JOBSYNC_SUPABASE_SERVICE_KEY \
    --data-file=- --project="${PROJECT_ID}"

  echo ""
  echo "✅  Setup complete! Re-run ./deploy.sh to deploy."
  exit 0
fi

# ── Build ─────────────────────────────────────────────────────────────────────
echo "🐳  Building Docker image..."
run docker build \
  --file backend/Dockerfile \
  --tag "${IMAGE}:${TAG}" \
  --tag "${IMAGE}:latest" \
  --build-arg BUILDKIT_INLINE_CACHE=1 \
  backend/

# ── Push ──────────────────────────────────────────────────────────────────────
echo "📤  Pushing to Artifact Registry..."
run gcloud auth configure-docker "${IMAGE_BASE}" --quiet
run docker push "${IMAGE}:${TAG}"
run docker push "${IMAGE}:latest"

# ── Deploy ────────────────────────────────────────────────────────────────────
echo "🚀  Deploying to Cloud Run (${REGION})..."
run gcloud run deploy "${SERVICE_NAME}" \
  --image="${IMAGE}:${TAG}" \
  --region="${REGION}" \
  --platform=managed \
  --allow-unauthenticated \
  --memory=2Gi \
  --cpu=2 \
  --concurrency=8 \
  --min-instances=0 \
  --max-instances=5 \
  --timeout=300 \
  --no-cpu-throttling \
  --set-env-vars="APP_VERSION=${TAG},DEBUG=false,OLLAMA_BASE_URL=,SUPABASE_URL=https://dzdziagugdcbkictslrt.supabase.co,SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6ZHppYWd1Z2RjYmtpY3RzbHJ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4NTcwMjYsImV4cCI6MjA5NTQzMzAyNn0.1nf7Um3PDSZMzHaBmf2bIzgEqzwpClEp1i_leRnLBYE,MAX_CONCURRENT_ANALYSES=8,MAX_CONCURRENT_LLM_CALLS=3" \
  --update-secrets="GROQ_API_KEY=JOBSYNC_GROQ_API_KEY:latest,SUPABASE_SERVICE_ROLE_KEY=JOBSYNC_SUPABASE_SERVICE_KEY:latest" \
  --service-account="${SERVICE_NAME}@${PROJECT_ID}.iam.gserviceaccount.com" \
  --project="${PROJECT_ID}"

# ── Get URL ───────────────────────────────────────────────────────────────────
SERVICE_URL=$(gcloud run services describe "${SERVICE_NAME}" \
  --region="${REGION}" \
  --project="${PROJECT_ID}" \
  --format="value(status.url)" 2>/dev/null || echo "")

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  ✅  Deployed successfully!                   ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  URL: ${SERVICE_URL}"
echo "║"
echo "║  Next steps:"
echo "║  1. Copy URL above"
echo "║  2. Set NEXT_PUBLIC_API_URL in Vercel env vars"
echo "║  3. Add Vercel URL to BACKEND_CORS_ORIGINS"
echo "╚══════════════════════════════════════════════╝"
echo ""
