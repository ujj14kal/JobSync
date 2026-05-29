"""
JobSync Neural Scorer — Custom PyTorch AI model for ATS scoring.

Architecture: Bi-encoder + Cross-interaction + Multi-head scoring network.

The model takes resume and JD embeddings (from fine-tuned sentence-transformer),
computes rich cross-interaction features, then predicts all 5 ATS dimension
scores simultaneously via shared trunk + independent prediction heads.

No external API calls. Runs 100% locally after training.

Interaction features (3082-dim input):
  - resume_emb          (768d) — direct resume representation
  - jd_emb              (768d) — direct JD representation
  - |resume - jd|       (768d) — absolute difference (captures gaps)
  - resume * jd         (768d) — hadamard product (captures alignment)
  - handcrafted_feats   (10d)  — skills overlap, cosine_sim, exp_match, etc.

Architecture:
  Input(3082) → SharedTrunk → 5 independent heads → [0, 100] scores

Training data: backend/data/training_pairs.jsonl
Model output:  backend/models/jobsync-scorer-v{N}/
"""
from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Optional
import structlog

logger = structlog.get_logger()

# ─── Paths ─────────────────────────────────────────────────────────────────────
MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models"
MODELS_DIR.mkdir(exist_ok=True)

SCORER_META_PATH = MODELS_DIR / "scorer_metadata.json"

DIMENSION_NAMES = [
    "ats_score",
    "technical_fit_score",
    "semantic_match_score",
    "recruiter_impression_score",
    "project_relevance_score",
]

EMBEDDING_DIM = 768
HANDCRAFTED_DIM = 10
INPUT_DIM = EMBEDDING_DIM * 4 + HANDCRAFTED_DIM  # 3082


# ─── Model definition ──────────────────────────────────────────────────────────

def _build_model():
    """Build the JobSyncScorer PyTorch model."""
    import torch
    import torch.nn as nn

    class JobSyncScorer(nn.Module):
        """
        Multi-task ATS scoring model.

        Input: [resume_emb ‖ jd_emb ‖ |res-jd| ‖ res*jd ‖ handcrafted] (3082d)
        Output: 5 scores in [0, 100]
        """

        def __init__(self, input_dim: int = INPUT_DIM, n_dims: int = 5):
            super().__init__()

            # Shared trunk: deep feature extraction
            self.trunk = nn.Sequential(
                nn.Linear(input_dim, 1024),
                nn.LayerNorm(1024),
                nn.GELU(),
                nn.Dropout(0.35),
                nn.Linear(1024, 512),
                nn.LayerNorm(512),
                nn.GELU(),
                nn.Dropout(0.25),
                nn.Linear(512, 256),
                nn.LayerNorm(256),
                nn.GELU(),
                nn.Dropout(0.2),
            )

            # Independent head per dimension — lets the model specialise
            self.heads = nn.ModuleList([
                nn.Sequential(
                    nn.Linear(256, 128),
                    nn.GELU(),
                    nn.Dropout(0.1),
                    nn.Linear(128, 64),
                    nn.GELU(),
                    nn.Linear(64, 1),
                    nn.Sigmoid(),
                )
                for _ in range(n_dims)
            ])

        def forward(self, x):
            shared = self.trunk(x)
            # Each head outputs [0, 1], multiply by 100 to get score
            scores = [head(shared) * 100.0 for head in self.heads]
            return torch.cat(scores, dim=1)  # (batch, 5)

    return JobSyncScorer()


# ─── Feature engineering ───────────────────────────────────────────────────────

def build_interaction_tensor(
    resume_emb: list[float],
    jd_emb: list[float],
    handcrafted: Optional[list[float]] = None,
):
    """
    Convert embeddings into the 3082-dim interaction tensor.

    Args:
        resume_emb: 768-dim embedding
        jd_emb: 768-dim embedding
        handcrafted: 10 optional handcrafted features

    Returns:
        torch.Tensor of shape (1, 3082)
    """
    import torch
    import numpy as np

    r = np.array(resume_emb, dtype=np.float32)
    j = np.array(jd_emb, dtype=np.float32)

    # Normalize embeddings
    r = r / (np.linalg.norm(r) + 1e-8)
    j = j / (np.linalg.norm(j) + 1e-8)

    diff = np.abs(r - j)          # absolute difference
    prod = r * j                   # hadamard product (alignment)

    if handcrafted is None:
        handcrafted = [0.0] * HANDCRAFTED_DIM

    hc = np.array(handcrafted[:HANDCRAFTED_DIM], dtype=np.float32)
    # Pad if short
    if len(hc) < HANDCRAFTED_DIM:
        hc = np.pad(hc, (0, HANDCRAFTED_DIM - len(hc)))

    combined = np.concatenate([r, j, diff, prod, hc])
    return torch.tensor(combined, dtype=torch.float32).unsqueeze(0)


def build_handcrafted_features(
    resume_text: str,
    jd_text: str,
    resume_emb: list[float],
    jd_emb: list[float],
) -> list[float]:
    """
    10 handcrafted features that complement the embedding interaction.
    These encode domain knowledge the raw embeddings may miss.
    """
    import numpy as np
    from app.services.skill_normalizer import normalize_skills

    r = np.array(resume_emb, dtype=np.float32)
    j = np.array(jd_emb, dtype=np.float32)

    # 1. Cosine similarity (raw)
    cosine = float(np.dot(r, j) / (np.linalg.norm(r) * np.linalg.norm(j) + 1e-8))

    # 2. Skills overlap ratio
    try:
        resume_words = set(resume_text.lower().split())
        jd_words = set(jd_text.lower().split())
        SKILL_KEYWORDS = {
            "python", "java", "javascript", "typescript", "react", "node", "sql",
            "aws", "docker", "kubernetes", "tensorflow", "pytorch", "git", "linux",
            "fastapi", "django", "flask", "golang", "rust", "scala", "spark",
        }
        resume_skills = resume_words & SKILL_KEYWORDS
        jd_skills = jd_words & SKILL_KEYWORDS
        if jd_skills:
            skills_overlap = len(resume_skills & jd_skills) / len(jd_skills)
        else:
            skills_overlap = 0.5
    except Exception:
        skills_overlap = 0.5

    # 3. Keyword density (% of JD keywords found in resume)
    try:
        jd_tokens = set(jd_text.lower().split())
        resume_tokens = set(resume_text.lower().split())
        jd_important = {w for w in jd_tokens if len(w) > 4}
        if jd_important:
            keyword_density = len(jd_important & resume_tokens) / len(jd_important)
        else:
            keyword_density = 0.5
    except Exception:
        keyword_density = 0.5

    # 4. Resume length ratio (normalized)
    resume_len = min(len(resume_text) / 3000.0, 1.0)

    # 5. JD complexity (longer JDs are more specific)
    jd_complexity = min(len(jd_text) / 2000.0, 1.0)

    # 6. Experience keyword signal
    exp_keywords = ["year", "years", "experience", "yr", "yrs"]
    has_exp = float(any(kw in resume_text.lower() for kw in exp_keywords))

    # 7. Education signal
    edu_keywords = ["bachelor", "master", "phd", "degree", "b.s.", "m.s.", "b.tech", "m.tech"]
    has_edu = float(any(kw in resume_text.lower() for kw in edu_keywords))

    # 8. Leadership signal
    leadership_kws = ["led", "managed", "led team", "director", "manager", "head of"]
    has_leadership = float(any(kw in resume_text.lower() for kw in leadership_kws))

    # 9. Quantified achievements signal
    import re
    metrics_pattern = re.compile(r'\b\d+[%x]\b|\$\d+|\d+\s*(million|billion|thousand|users|customers)')
    has_metrics = float(bool(metrics_pattern.search(resume_text)))

    # 10. Title alignment (does resume title appear in JD?)
    try:
        # Extract first line / title-like text
        first_line = resume_text.strip().split('\n')[0].lower()
        jd_lower = jd_text.lower()
        title_words = [w for w in first_line.split() if len(w) > 3]
        title_match = sum(1 for w in title_words if w in jd_lower) / max(len(title_words), 1)
    except Exception:
        title_match = 0.5

    return [
        cosine,
        skills_overlap,
        keyword_density,
        resume_len,
        jd_complexity,
        has_exp,
        has_edu,
        has_leadership,
        has_metrics,
        title_match,
    ]


# ─── Inference ─────────────────────────────────────────────────────────────────

class NeuralScorerPredictor:
    """
    Wraps the trained JobSyncScorer for inference.
    Loaded once at startup, cached as a singleton.
    """

    def __init__(self, model, meta: dict, model_path: Path):
        self.model = model
        self.meta = meta
        self.model_path = model_path
        self.model.eval()

    @classmethod
    def load(cls, version: Optional[int] = None) -> Optional["NeuralScorerPredictor"]:
        """Load the latest (or specified) trained scorer. Returns None if untrained."""
        import torch

        meta = _load_scorer_meta()
        v = version or meta.get("version", 0)
        if v == 0:
            return None

        model_path = MODELS_DIR / f"jobsync-scorer-v{v}" / "model.pt"
        if not model_path.exists():
            logger.warning("Neural scorer model file missing", version=v, path=str(model_path))
            return None

        try:
            model = _build_model()
            state = torch.load(model_path, map_location="cpu", weights_only=True)
            model.load_state_dict(state)
            model.eval()
            logger.info("Neural scorer loaded", version=v, val_mse=meta.get("val_mse"))
            return cls(model, meta, model_path)
        except Exception as e:
            logger.error("Failed to load neural scorer", error=str(e))
            return None

    def predict(
        self,
        resume_text: str,
        jd_text: str,
        resume_emb: list[float],
        jd_emb: list[float],
    ) -> dict:
        """
        Predict all 5 ATS scores.

        Returns:
            {
              "ats_score": float,
              "technical_fit_score": float,
              "semantic_match_score": float,
              "recruiter_impression_score": float,
              "project_relevance_score": float,
              "overall_score": float,
              "scored_by": "jobsync-neural-v{N}",
            }
        """
        import torch

        handcrafted = build_handcrafted_features(resume_text, jd_text, resume_emb, jd_emb)
        x = build_interaction_tensor(resume_emb, jd_emb, handcrafted)

        with torch.no_grad():
            raw = self.model(x)  # (1, 5)
            scores_list = raw.squeeze(0).tolist()

        result = {
            dim: round(float(s), 1)
            for dim, s in zip(DIMENSION_NAMES, scores_list)
        }

        weights = [0.25, 0.25, 0.20, 0.15, 0.15]
        result["overall_score"] = round(
            sum(result[d] * w for d, w in zip(DIMENSION_NAMES, weights)), 1
        )
        result["scored_by"] = f"jobsync-neural-v{self.meta.get('version', '?')}"
        return result

    @property
    def version(self) -> int:
        return self.meta.get("version", 0)

    @property
    def val_mse(self) -> Optional[float]:
        return self.meta.get("val_mse")


# ─── Metadata I/O ──────────────────────────────────────────────────────────────

def _load_scorer_meta() -> dict:
    if SCORER_META_PATH.exists():
        try:
            return json.loads(SCORER_META_PATH.read_text())
        except Exception:
            pass
    return {"version": 0}


def _save_scorer_meta(meta: dict) -> None:
    SCORER_META_PATH.write_text(json.dumps(meta, indent=2))


# ─── Lazy singleton ─────────────────────────────────────────────────────────────

_scorer_instance: Optional[NeuralScorerPredictor] = None
_scorer_loaded_at: float = 0.0
_RELOAD_INTERVAL = 3600.0


def get_neural_scorer() -> Optional[NeuralScorerPredictor]:
    """
    Returns cached NeuralScorerPredictor or None (untrained / loading).
    Auto-reloads hourly so the server picks up newly trained models.
    """
    global _scorer_instance, _scorer_loaded_at
    now = time.monotonic()

    if now - _scorer_loaded_at > _RELOAD_INTERVAL:
        _scorer_instance = NeuralScorerPredictor.load()
        _scorer_loaded_at = now

    return _scorer_instance


def scorer_status() -> dict:
    meta = _load_scorer_meta()
    scorer = get_neural_scorer()
    return {
        "trained": scorer is not None,
        "version": meta.get("version", 0),
        "training_samples": meta.get("training_samples", 0),
        "val_mse": meta.get("val_mse"),
        "val_mae": meta.get("val_mae"),
        "epochs_trained": meta.get("epochs_trained", 0),
        "last_trained_at": meta.get("last_trained_at"),
        "loaded_in_memory": scorer is not None,
        "architecture": "JobSyncScorer (3082→1024→512→256→5heads)",
        "input_features": "768d_resume_emb + 768d_jd_emb + interaction + 10_handcrafted",
    }
