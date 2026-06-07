#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# JobSync — Deploy script
#
# Usage:
#   cd ~/Documents/GitHub/JobSync && ./deploy.sh
#   ./deploy.sh --dry-run
#
# ⚠️  NEVER use `gcloud run deploy --source` directly.
#     It bypasses cloudbuild.yaml, disables layer caching, and causes a full
#     550 MB cross-region image push (~₹5-8 in network charges per deploy).
#     This script is the only safe way to deploy.
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

run() {
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY RUN] $*"
  else
    "$@"
  fi
}

# ─── Pre-flight: billing + build count check ─────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  JobSync → Cloud Run deploy                  ║"
echo "╠══════════════════════════════════════════════╣"
echo "║  Commit  : ${SHORT_TAG}                      ║"
echo "║  Project : ${PROJECT_ID}      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "🔍  Checking billing state before building..."
echo ""

TODAY=$(date -u +%Y-%m-%d)
MONTH=$(date -u +%Y-%m)

BUILDS_TODAY=$(gcloud builds list \
  --project="${PROJECT_ID}" \
  --limit=50 \
  --filter="createTime>=${TODAY}T00:00:00Z" \
  --format="value(id)" 2>/dev/null | wc -l | tr -d ' ')

BUILDS_MONTH=$(gcloud builds list \
  --project="${PROJECT_ID}" \
  --limit=200 \
  --filter="createTime>=${MONTH}-01T00:00:00Z" \
  --format="value(id)" 2>/dev/null | wc -l | tr -d ' ')

BUILD_MINS_TODAY=$(gcloud builds list \
  --project="${PROJECT_ID}" \
  --limit=50 \
  --filter="createTime>=${TODAY}T00:00:00Z" \
  --format="json(timing.BUILD)" 2>/dev/null | python3 -c "
import json, sys
from datetime import datetime
try:
    data = json.load(sys.stdin)
    total = 0
    for b in data:
        t = b.get('timing', {}).get('BUILD', {})
        if t.get('startTime') and t.get('endTime'):
            s = datetime.fromisoformat(t['startTime'].replace('Z','+00:00'))
            e = datetime.fromisoformat(t['endTime'].replace('Z','+00:00'))
            total += (e - s).total_seconds() / 60
    print(f'{total:.1f}')
except:
    print('0.0')
" 2>/dev/null)

AR_SIZE_MB=$(gcloud artifacts docker images list \
  asia-south1-docker.pkg.dev/jobsync-497608/jobsync \
  --include-tags \
  --format="json(metadata.imageSizeBytes)" 2>/dev/null | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
    total = sum(int(i.get('metadata',{}).get('imageSizeBytes',0)) for i in data)
    print(f'{total/1024/1024:.0f}')
except:
    print('unknown')
" 2>/dev/null)

FREE_MINS_LEFT=$(python3 -c "used=${BUILD_MINS_TODAY}; left=max(0,120-used); print(f'{left:.0f}')" 2>/dev/null)
OVER_FREE=$(python3 -c "print('yes' if ${BUILD_MINS_TODAY} > 120 else 'no')" 2>/dev/null)

echo "  📦 Artifact Registry  : ${AR_SIZE_MB} MB stored (free tier: 512 MB)"
echo "  🏗️  Builds today       : ${BUILDS_TODAY}  |  This month: ${BUILDS_MONTH}"
echo "  ⏱️  Build mins today   : ${BUILD_MINS_TODAY} min  (free tier: 120 min/day)"
if [[ "$OVER_FREE" == "yes" ]]; then
  echo "  ⚠️  OVER free tier — extra mins charged at ~₹0.25/min"
else
  echo "  ✅ Free mins remaining : ${FREE_MINS_LEFT} min"
fi
echo ""
echo "  💸 Estimated cost of THIS deploy:"
echo "     • Cloud Build    : ~5-9 min build time"
if [[ "$OVER_FREE" == "yes" ]]; then
  echo "       → ₹1.25-2.25 (over free tier)"
else
  echo "       → ₹0.00 (within free tier)"
fi
echo "     • Network push   : ~₹0.10 if layer cache hits  /  ~₹5-7 if full push"
echo "       (cache hits when only source code changed, not dependencies)"
echo ""
echo "  🔗 Exact rupee spend:"
echo "     console.cloud.google.com/billing/017689-3C91A6-DD1903/reports?project=jobsync-497608"
echo ""

# Warn loudly on repeated deploys
if [[ "${BUILDS_TODAY}" -ge 2 ]]; then
  echo "  ⚠️  You've already deployed ${BUILDS_TODAY}x today."
  echo "     Each deploy = 1 Cloud Build + 1 image push."
  echo "     Have you tested this change locally with uvicorn first?"
  echo ""
fi

if [[ "${BUILDS_TODAY}" -ge 3 ]]; then
  echo "  🚨 3+ deploys today — network push costs are adding up."
  echo "     Consider batching changes before next deploy."
  echo ""
fi

# ─── Confirmation ────────────────────────────────────────────────────────────
read -rp "Type 'deploy' to confirm (Ctrl+C to abort): " CONFIRM
if [[ "$CONFIRM" != "deploy" ]]; then
  echo "Aborted."
  exit 0
fi
echo ""

# ─── Build & deploy ──────────────────────────────────────────────────────────
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
echo "  Build logs : console.cloud.google.com/cloud-build/builds?project=${PROJECT_ID}"
echo "  Service    : https://jobsync-329097420297.asia-south1.run.app"
echo ""
