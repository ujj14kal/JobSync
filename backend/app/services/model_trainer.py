"""
Proprietary Model Trainer — recruiter-fit prediction.

Evolution path (matches data accumulation):
  Phase 1 (0–200 outcomes):   Rule-based cold-start (current default)
  Phase 2 (200–2000):         LogisticRegression on 16 features
  Phase 3 (2000–10000):       XGBoost with tuned hyperparameters
  Phase 4 (10000+):           XGBoost + calibration + A/B testing

Training data source: application_events table
  - Every time a user records an outcome (interviewed, rejected, ghosted)
    the 16-feature vector + label is stored
  - The trained model is serialized to disk and loaded at startup

Usage:
  # Trigger manually or run as a weekly cron via scheduler.py
  from app.services.model_trainer import run_training_cycle
  await run_training_cycle()

Model file locations:
  backend/models/recruiter_fit_v{VERSION}.joblib
  backend/models/feature_scaler_v{VERSION}.joblib
  backend/models/training_metadata.json
"""
from __future__ import annotations

import asyncio
import json
import os
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional
import structlog

logger = structlog.get_logger()

# ─── Paths ────────────────────────────────────────────────────────────────────

MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

METADATA_PATH = MODELS_DIR / "training_metadata.json"

# ─── Constants ────────────────────────────────────────────────────────────────

MIN_SAMPLES_LOGREG = 200     # need at least this many to train LR
MIN_SAMPLES_XGBOOST = 2000   # need this many for XGBoost to generalize
FEATURE_NAMES = [
    "semantic_similarity",
    "skill_overlap_ratio",
    "metric_density",
    "years_of_experience",
    "seniority_alignment",
    "keyword_coverage",
    "verb_strength",
    "career_progression",
    "company_tier_avg",
    "education_tier",
    "has_relevant_projects",
    "certification_value",
    "career_gaps",
    "cohort_percentile",
    "keyword_success_rate",
    "experience_role_fit",
]

# Label: 1 = got_interview, 0 = rejected/ghosted
POSITIVE_OUTCOMES = {"interviewed", "offer", "hired"}


# ─── Metadata I/O ─────────────────────────────────────────────────────────────

def _load_metadata() -> dict:
    if METADATA_PATH.exists():
        try:
            return json.loads(METADATA_PATH.read_text())
        except Exception:
            pass
    return {
        "version": 0,
        "model_type": "cold_start",
        "training_samples": 0,
        "last_trained_at": None,
        "test_accuracy": None,
        "test_auc": None,
        "feature_importances": {},
    }


def _save_metadata(meta: dict) -> None:
    meta["updated_at"] = datetime.utcnow().isoformat()
    METADATA_PATH.write_text(json.dumps(meta, indent=2))


# ─── Model load / save ─────────────────────────────────────────────────────────

def _model_path(version: int, suffix: str = "model") -> Path:
    return MODELS_DIR / f"recruiter_fit_{suffix}_v{version}.joblib"


def load_current_model() -> Optional[tuple[Any, Any, dict]]:
    """
    Load (model, scaler, metadata) or return None if no trained model exists.
    The caller falls back to the cold-start rule-based predictor when None.
    """
    try:
        import joblib
    except ImportError:
        logger.warning("joblib not installed — no trained model loading")
        return None

    meta = _load_metadata()
    version = meta.get("version", 0)
    if version == 0:
        return None  # never trained

    model_path = _model_path(version, "model")
    scaler_path = _model_path(version, "scaler")

    if not model_path.exists() or not scaler_path.exists():
        logger.warning("Model files missing", version=version)
        return None

    try:
        model = joblib.load(model_path)
        scaler = joblib.load(scaler_path)
        logger.info("Loaded trained model", version=version, type=meta.get("model_type"))
        return model, scaler, meta
    except Exception as e:
        logger.error("Failed to load model", error=str(e))
        return None


# ─── Data fetching ─────────────────────────────────────────────────────────────

async def _fetch_training_data() -> tuple[list[list[float]], list[int]]:
    """
    Pull feature vectors + labels from application_events table.
    Returns (X, y) — lists of equal length.
    """
    try:
        from app.db.database import get_db_connection
        async with get_db_connection() as conn:
            rows = await conn.fetch(
                """
                SELECT
                    training_features,
                    outcome
                FROM application_events
                WHERE
                    training_features IS NOT NULL
                    AND outcome IN ('interviewed','offer','hired','rejected','ghosted')
                ORDER BY created_at DESC
                LIMIT 50000
                """
            )
    except Exception as e:
        logger.error("Failed to fetch training data", error=str(e))
        return [], []

    X: list[list[float]] = []
    y: list[int] = []

    for row in rows:
        try:
            features_raw = row["training_features"]
            if isinstance(features_raw, str):
                features_raw = json.loads(features_raw)

            # Build feature vector in canonical order
            vec = [float(features_raw.get(f, 0.0)) for f in FEATURE_NAMES]
            label = 1 if row["outcome"] in POSITIVE_OUTCOMES else 0

            X.append(vec)
            y.append(label)
        except Exception:
            continue

    logger.info("Loaded training data", samples=len(X), positives=sum(y))
    return X, y


# ─── Training ─────────────────────────────────────────────────────────────────

def _train_logistic_regression(X_train, y_train, X_test, y_test) -> tuple[Any, Any, dict]:
    """Phase 2 model: LogisticRegression with L2 regularization."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import accuracy_score, roc_auc_score

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    model = LogisticRegression(
        C=1.0,
        max_iter=1000,
        class_weight="balanced",
        random_state=42,
    )
    model.fit(X_train_s, y_train)

    y_pred = model.predict(X_test_s)
    y_prob = model.predict_proba(X_test_s)[:, 1]

    acc = accuracy_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_prob)

    # Feature importances (abs of coefficients)
    importances = {
        f: abs(float(c))
        for f, c in zip(FEATURE_NAMES, model.coef_[0])
    }

    logger.info("LogReg trained", accuracy=round(acc, 4), auc=round(auc, 4))
    return model, scaler, {
        "model_type": "logistic_regression",
        "test_accuracy": round(acc, 4),
        "test_auc": round(auc, 4),
        "feature_importances": importances,
    }


def _train_xgboost(X_train, y_train, X_test, y_test) -> tuple[Any, Any, dict]:
    """Phase 3 model: XGBoost with scale_pos_weight for imbalanced data."""
    try:
        import xgboost as xgb
    except ImportError:
        logger.warning("xgboost not installed — falling back to LogReg")
        return _train_logistic_regression(X_train, y_train, X_test, y_test)

    from sklearn.preprocessing import StandardScaler
    from sklearn.metrics import accuracy_score, roc_auc_score
    import numpy as np

    scaler = StandardScaler()
    X_train_s = scaler.fit_transform(X_train)
    X_test_s = scaler.transform(X_test)

    neg = sum(1 for v in y_train if v == 0)
    pos = sum(1 for v in y_train if v == 1)
    scale_pos = neg / pos if pos > 0 else 1.0

    model = xgb.XGBClassifier(
        n_estimators=300,
        max_depth=4,
        learning_rate=0.05,
        subsample=0.8,
        colsample_bytree=0.8,
        scale_pos_weight=scale_pos,
        use_label_encoder=False,
        eval_metric="logloss",
        random_state=42,
        n_jobs=-1,
    )
    model.fit(
        X_train_s, y_train,
        eval_set=[(X_test_s, y_test)],
        verbose=False,
    )

    y_pred = model.predict(X_test_s)
    y_prob = model.predict_proba(X_test_s)[:, 1]

    acc = accuracy_score(y_test, y_pred)
    auc = roc_auc_score(y_test, y_prob)

    importances = {
        f: float(v)
        for f, v in zip(FEATURE_NAMES, model.feature_importances_)
    }

    logger.info("XGBoost trained", accuracy=round(acc, 4), auc=round(auc, 4))
    return model, scaler, {
        "model_type": "xgboost",
        "test_accuracy": round(acc, 4),
        "test_auc": round(auc, 4),
        "feature_importances": importances,
    }


async def run_training_cycle(force: bool = False) -> dict:
    """
    Full training pipeline. Run this weekly (or whenever you have new data).

    Args:
        force: Retrain even if sample count hasn't grown since last training.

    Returns:
        dict with training results and next recommended phase.
    """
    import numpy as np

    meta = _load_metadata()
    last_count = meta.get("training_samples", 0)

    # Fetch data
    X, y = await _fetch_training_data()
    n_samples = len(X)

    if n_samples == 0:
        logger.info("No training data yet — staying with cold-start rules")
        return {"status": "no_data", "samples": 0, "model_type": "cold_start"}

    if not force and n_samples <= last_count + 50:
        logger.info(
            "Not enough new data to retrain",
            current=n_samples,
            last_trained_on=last_count,
        )
        return {"status": "skipped", "reason": "insufficient_new_data", "samples": n_samples}

    if n_samples < MIN_SAMPLES_LOGREG:
        logger.info(
            "Not enough data for ML yet",
            have=n_samples,
            need=MIN_SAMPLES_LOGREG,
        )
        return {
            "status": "insufficient_data",
            "samples": n_samples,
            "need": MIN_SAMPLES_LOGREG,
            "model_type": "cold_start",
        }

    try:
        from sklearn.model_selection import train_test_split
        import joblib
    except ImportError as e:
        logger.error("scikit-learn or joblib not installed", error=str(e))
        return {"status": "error", "error": str(e)}

    # Train/test split
    X_arr = np.array(X)
    y_arr = np.array(y)
    X_train, X_test, y_train, y_test = train_test_split(
        X_arr, y_arr, test_size=0.2, random_state=42, stratify=y_arr
    )

    # Choose algorithm based on sample count
    t0 = time.monotonic()
    if n_samples >= MIN_SAMPLES_XGBOOST:
        model, scaler, stats = await asyncio.to_thread(
            _train_xgboost, X_train, y_train, X_test, y_test
        )
    else:
        model, scaler, stats = await asyncio.to_thread(
            _train_logistic_regression, X_train, y_train, X_test, y_test
        )
    elapsed = time.monotonic() - t0

    # Save model
    new_version = meta.get("version", 0) + 1
    joblib.dump(model, _model_path(new_version, "model"))
    joblib.dump(scaler, _model_path(new_version, "scaler"))

    # Clean up old version
    old_version = new_version - 1
    for suffix in ["model", "scaler"]:
        old_path = _model_path(old_version, suffix)
        if old_path.exists():
            old_path.unlink()

    # Update metadata
    new_meta = {
        **meta,
        "version": new_version,
        "model_type": stats["model_type"],
        "training_samples": n_samples,
        "last_trained_at": datetime.utcnow().isoformat(),
        "test_accuracy": stats["test_accuracy"],
        "test_auc": stats["test_auc"],
        "feature_importances": stats["feature_importances"],
        "training_time_secs": round(elapsed, 2),
    }
    _save_metadata(new_meta)

    logger.info(
        "Training cycle complete",
        version=new_version,
        model_type=stats["model_type"],
        accuracy=stats["test_accuracy"],
        auc=stats["test_auc"],
        samples=n_samples,
    )

    return {
        "status": "trained",
        "version": new_version,
        "model_type": stats["model_type"],
        "samples": n_samples,
        "accuracy": stats["test_accuracy"],
        "auc": stats["test_auc"],
        "top_features": sorted(
            stats["feature_importances"].items(),
            key=lambda x: x[1],
            reverse=True,
        )[:5],
    }


# ─── Inference using trained model ────────────────────────────────────────────

class TrainedModelPredictor:
    """
    Drop-in replacement for the cold-start rule-based predictor
    once a trained model is available.

    Usage (in recruiter_fit.py):
        predictor = TrainedModelPredictor.load()
        if predictor:
            prob = predictor.predict(feature_dict)
        else:
            # fall back to cold-start rules
    """

    def __init__(self, model: Any, scaler: Any, meta: dict):
        self.model = model
        self.scaler = scaler
        self.meta = meta
        self._model_type = meta.get("model_type", "unknown")

    @classmethod
    def load(cls) -> Optional["TrainedModelPredictor"]:
        result = load_current_model()
        if result is None:
            return None
        model, scaler, meta = result
        return cls(model, scaler, meta)

    def predict(self, features: dict) -> float:
        """
        Returns interview probability 0.0–1.0.

        Args:
            features: dict with FEATURE_NAMES keys (0–1 normalized values)
        """
        import numpy as np

        vec = np.array([[features.get(f, 0.0) for f in FEATURE_NAMES]])
        vec_scaled = self.scaler.transform(vec)
        prob = float(self.model.predict_proba(vec_scaled)[0][1])
        return max(0.0, min(1.0, prob))

    @property
    def model_type(self) -> str:
        return self._model_type

    @property
    def accuracy(self) -> Optional[float]:
        return self.meta.get("test_accuracy")

    @property
    def auc(self) -> Optional[float]:
        return self.meta.get("test_auc")

    def feature_importances(self) -> dict:
        return self.meta.get("feature_importances", {})


# ─── Lazy singleton (loaded once at app startup) ──────────────────────────────

_predictor_instance: Optional[TrainedModelPredictor] = None
_predictor_loaded_at: float = 0.0
_RELOAD_INTERVAL = 3600.0  # reload from disk every hour


def get_trained_predictor() -> Optional[TrainedModelPredictor]:
    """
    Returns a cached TrainedModelPredictor or None (cold start).
    Auto-reloads from disk every hour so the running server picks up
    newly trained models without a restart.
    """
    global _predictor_instance, _predictor_loaded_at
    now = time.monotonic()

    if now - _predictor_loaded_at > _RELOAD_INTERVAL:
        _predictor_instance = TrainedModelPredictor.load()
        _predictor_loaded_at = now
        if _predictor_instance:
            logger.info(
                "Trained predictor loaded",
                model_type=_predictor_instance.model_type,
                accuracy=_predictor_instance.accuracy,
            )
        else:
            logger.debug("No trained model — using cold-start rules")

    return _predictor_instance


def training_status() -> dict:
    """Returns current training metadata — used by /health endpoint."""
    meta = _load_metadata()
    predictor = get_trained_predictor()
    return {
        "phase": _phase_label(meta.get("training_samples", 0)),
        "model_type": meta.get("model_type", "cold_start"),
        "version": meta.get("version", 0),
        "training_samples": meta.get("training_samples", 0),
        "last_trained_at": meta.get("last_trained_at"),
        "test_accuracy": meta.get("test_accuracy"),
        "test_auc": meta.get("test_auc"),
        "loaded_in_memory": predictor is not None,
        "next_threshold": MIN_SAMPLES_LOGREG if meta.get("training_samples", 0) < MIN_SAMPLES_LOGREG else MIN_SAMPLES_XGBOOST,
    }


def _phase_label(n: int) -> str:
    if n < MIN_SAMPLES_LOGREG:
        return f"phase_1_cold_start (need {MIN_SAMPLES_LOGREG - n} more samples)"
    if n < MIN_SAMPLES_XGBOOST:
        return f"phase_2_logistic_regression ({n} samples)"
    return f"phase_3_xgboost ({n} samples)"
