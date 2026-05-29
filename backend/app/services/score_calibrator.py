"""
Score Calibrator — corrects systematic LLM scoring bias.

Problem: LLMs tend to cluster scores around 60-70 regardless of actual quality.
Solution: Train an isotonic regression model on (llm_score, actual_outcome) pairs.

Architecture:
  - One calibrator per dimension (5 total)
  - IsotonicRegression: monotone, non-parametric, perfect for score correction
  - Falls back to linear shift correction when not enough data
  - Reloads from disk every hour to pick up freshly trained models

Training data source: scoring_feedback table
  - Every time a user records an outcome (offer/rejected), we get a ground truth signal
  - (ai_score, got_interview: 0/1) → calibration target
  - Needs ~100+ samples per dimension before calibration kicks in

Calibration formula (when trained):
  calibrated_score = isotonic.predict([raw_score])[0] * 100
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Optional, Any
import structlog

logger = structlog.get_logger()

MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models"
MODELS_DIR.mkdir(exist_ok=True)
CALIBRATOR_PATH = MODELS_DIR / "score_calibrator.joblib"
CALIBRATOR_META_PATH = MODELS_DIR / "calibrator_meta.json"

MIN_SAMPLES_FOR_CALIBRATION = 80
_DIMENSIONS = [
    "ats_score", "technical_fit_score", "semantic_match_score",
    "recruiter_impression_score", "project_relevance_score",
]

# ─── Calibrator class ─────────────────────────────────────────────────────────

class ScoreCalibrator:
    """
    Wraps per-dimension isotonic regression models.
    Once loaded, call calibrate_scores(raw_dict) to get corrected scores.
    """

    def __init__(self, models: dict[str, Any], meta: dict):
        self._models = models  # {dimension: IsotonicRegression}
        self._meta = meta

    def calibrate_scores(self, scores: dict) -> dict:
        """Apply calibration to all 5 dimension scores in-place."""
        import numpy as np
        result = dict(scores)
        for dim in _DIMENSIONS:
            raw = scores.get(dim)
            if raw is None:
                continue
            model = self._models.get(dim)
            if model is None:
                continue
            try:
                calibrated = float(model.predict([[raw / 100.0]])[0]) * 100
                result[dim] = max(0, min(100, int(round(calibrated))))
            except Exception:
                pass  # keep raw score if calibration fails
        return result

    @property
    def samples_used(self) -> int:
        return self._meta.get("training_samples", 0)

    @property
    def dimensions_calibrated(self) -> list[str]:
        return list(self._models.keys())


# ─── Training ─────────────────────────────────────────────────────────────────

async def train_calibrator() -> dict:
    """
    Fetch feedback data from DB and train per-dimension isotonic regressors.
    Returns training summary.
    """
    try:
        from app.db.supabase_client import get_supabase
        import numpy as np
        from sklearn.isotonic import IsotonicRegression
        import joblib
    except ImportError as e:
        return {"status": "error", "error": str(e)}

    supabase = get_supabase()
    try:
        result = (
            supabase.table("scoring_feedback")
            .select("dimension_scores, outcome")
            .not_.is_("dimension_scores", "null")
            .execute()
        )
        rows = result.data or []
    except Exception as e:
        logger.error("Failed to fetch calibration data", error=str(e))
        return {"status": "error", "error": str(e)}

    if len(rows) < MIN_SAMPLES_FOR_CALIBRATION:
        return {
            "status": "insufficient_data",
            "samples": len(rows),
            "need": MIN_SAMPLES_FOR_CALIBRATION,
        }

    POSITIVE_OUTCOMES = {"offer", "interviewing", "screening"}

    # Build per-dimension (X, y) arrays
    dim_data: dict[str, list] = {d: [] for d in _DIMENSIONS}
    for row in rows:
        try:
            scores = row["dimension_scores"]
            if isinstance(scores, str):
                scores = json.loads(scores)
            label = 1.0 if row.get("outcome") in POSITIVE_OUTCOMES else 0.0
            for dim in _DIMENSIONS:
                raw = scores.get(dim)
                if raw is not None:
                    dim_data[dim].append((float(raw) / 100.0, label))
        except Exception:
            continue

    calibrators: dict[str, Any] = {}
    for dim, pairs in dim_data.items():
        if len(pairs) < 30:
            continue
        X = np.array([p[0] for p in pairs]).reshape(-1, 1)
        y = np.array([p[1] for p in pairs])
        iso = IsotonicRegression(out_of_bounds="clip")
        iso.fit(X.ravel(), y)
        calibrators[dim] = iso

    if not calibrators:
        return {"status": "insufficient_data_per_dimension", "samples": len(rows)}

    # Save to disk
    try:
        joblib.dump(calibrators, CALIBRATOR_PATH)
        meta = {
            "training_samples": len(rows),
            "dimensions_calibrated": list(calibrators.keys()),
            "trained_at": time.strftime("%Y-%m-%dT%H:%M:%SZ"),
        }
        CALIBRATOR_META_PATH.write_text(json.dumps(meta, indent=2))
        logger.info("Calibrator trained", dimensions=list(calibrators.keys()), samples=len(rows))
        # Reset cached singleton
        global _calibrator_instance, _calibrator_loaded_at
        _calibrator_instance = None
        _calibrator_loaded_at = 0.0
    except Exception as e:
        return {"status": "save_error", "error": str(e)}

    return {
        "status": "trained",
        "samples": len(rows),
        "dimensions": list(calibrators.keys()),
    }


# ─── Singleton loader ──────────────────────────────────────────────────────────

_calibrator_instance: Optional[ScoreCalibrator] = None
_calibrator_loaded_at: float = 0.0
_RELOAD_INTERVAL = 3600.0


def get_calibrator() -> Optional[ScoreCalibrator]:
    """Returns cached ScoreCalibrator or None if not yet trained."""
    global _calibrator_instance, _calibrator_loaded_at
    now = time.monotonic()
    if now - _calibrator_loaded_at > _RELOAD_INTERVAL:
        _calibrator_instance = _load_calibrator()
        _calibrator_loaded_at = now
    return _calibrator_instance


def _load_calibrator() -> Optional[ScoreCalibrator]:
    if not CALIBRATOR_PATH.exists():
        return None
    try:
        import joblib
        models = joblib.load(CALIBRATOR_PATH)
        meta: dict = {}
        if CALIBRATOR_META_PATH.exists():
            meta = json.loads(CALIBRATOR_META_PATH.read_text())
        logger.info("Loaded score calibrator", dimensions=list(models.keys()))
        return ScoreCalibrator(models, meta)
    except Exception as e:
        logger.warning("Failed to load calibrator", error=str(e))
        return None
