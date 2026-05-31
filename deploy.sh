#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# JobSync — Deploy script
# Builds via Cloud Build (E2_MEDIUM, 120 free min/day) and deploys to Cloud Run.
#
# Usage:
#   cd ~/Documents/GitHub/JobSync && ./deploy.sh
#   ./deploy.sh --dry-run
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_ID="jobsync-497608"
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true; shift;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

TAG=$(git rev-parse HEAD)
SHORT_TAG=$(git rev-parse --short HEAD)

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  JobSync → Cloud Run deploy                  ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Commit  : ${SHORT_TAG}"
echo "║  Project : ${PROJECT_ID}"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "  Build : Cloud Build E2_MEDIUM (120 free min/day)"
echo "  Store : Artifact Registry (max 2 images, ~Rs10/month)"
echo "  Run   : Cloud Run (scale-to-zero, free tier)"
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

echo "🚀  Submitting to Cloud Build..."
run gcloud builds submit \
  --config cloudbuild.yaml \
  --project="${PROJECT_ID}" \
  --substitutions=COMMIT_SHA="${TAG}"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  Done! Backend is live.                      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
