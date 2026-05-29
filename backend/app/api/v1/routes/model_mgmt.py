"""
Model Management API — trigger training, view status, generate data.
These endpoints power the JobSync AI model improvement loop.

Model priority order (highest to lowest):
  1. JobSync Neural Scorer  — custom PyTorch model, local inference, no API
  2. Groq LLM-as-Judge      — bootstrap while neural model is training
  3. Rule-based engine       — always-available fallback

Training pipeline:
  Step 1: POST /model/generate-training-data?pairs=600  (10 min, uses Groq once)
  Step 2: POST /model/train/neural-scorer               (45-90 min, pure PyTorch)
  Step 3: Use the app — collect real feedback
  Step 4: POST /model/train/neural-scorer?fine_tune=true (30 min, improves on feedback)
  Step 5: POST /model/train/calibrator                  (2 min, after 80+ feedback samples)
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from app.core.security import get_current_user_id
from app.services.model_trainer import run_training_cycle, training_status
from app.services.score_calibrator import train_calibrator
from app.services.embedder_trainer import get_model_info
from app.services.embedding_service import get_model_info as get_embed_info

router = APIRouter(prefix="/model", tags=["model-management"])


@router.get("/status")
async def model_status(_: str = Depends(get_current_user_id)):
    """Full status of all AI models: neural scorer, embedder, calibrator, recruiter-fit."""
    from app.services.score_calibrator import get_calibrator
    from app.services.jobsync_neural_scorer import scorer_status

    calibrator = get_calibrator()

    return {
        "neural_scorer": scorer_status(),
        "recruiter_fit_predictor": training_status(),
        "embedding_model": get_embed_info(),
        "fine_tuned_embedder": get_model_info(),
        "score_calibrator": {
            "loaded": calibrator is not None,
            "samples_used": calibrator.samples_used if calibrator else 0,
            "dimensions_calibrated": calibrator.dimensions_calibrated if calibrator else [],
        },
        "scoring_priority": [
            "1. jobsync-neural-scorer (custom PyTorch, local)",
            "2. groq-llm-as-judge (bootstrap fallback)",
            "3. rule-based-engine (always available)",
        ],
    }


@router.post("/train/neural-scorer")
async def train_neural_scorer(
    background_tasks: BackgroundTasks,
    epochs: int = 100,
    fine_tune: bool = False,
    _: str = Depends(get_current_user_id),
):
    """
    Train (or fine-tune) the JobSync Neural Scorer on synthetic + feedback data.

    This is the primary training endpoint. Run this after generating training data.
    Set fine_tune=true to update the existing model with new feedback data.

    Expected training time: ~45-90 min on CPU, ~8-15 min on GPU.
    """
    if epochs > 300:
        raise HTTPException(400, detail="Max 300 epochs")

    async def _train():
        from app.services.neural_trainer import train_async
        result = await train_async(epochs=epochs, fine_tune=fine_tune)
        import structlog
        structlog.get_logger().info("Neural scorer training complete", result=result)

    background_tasks.add_task(_train)
    return {
        "message": f"Neural scorer training started ({epochs} epochs, fine_tune={fine_tune})",
        "note": "Check /model/status to see when training completes",
    }


@router.post("/train/recruiter-fit")
async def train_recruiter_fit(
    background_tasks: BackgroundTasks,
    force: bool = False,
    user_id: str = Depends(get_current_user_id),
):
    """Trigger recruiter-fit model training (LogReg or XGBoost depending on data)."""
    background_tasks.add_task(run_training_cycle, force=force)
    return {"message": "Recruiter-fit training started in background"}


@router.post("/train/calibrator")
async def train_score_calibrator(
    background_tasks: BackgroundTasks,
    _: str = Depends(get_current_user_id),
):
    """Retrain the score calibrator on latest feedback data."""
    background_tasks.add_task(train_calibrator)
    return {"message": "Calibrator training started in background"}


@router.post("/generate-training-data")
async def generate_training_data(
    pairs: int = 200,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    _: str = Depends(get_current_user_id),
):
    """Generate synthetic training pairs for embedding fine-tuning (background task)."""
    if pairs > 1000:
        raise HTTPException(400, detail="Max 1000 pairs per request")

    async def _generate():
        from app.services.synthetic_data_gen import generate_dataset, save_dataset
        data = await generate_dataset(target_pairs=pairs)
        save_dataset(data)

    background_tasks.add_task(_generate)
    return {"message": f"Generating {pairs} training pairs in background", "pairs_requested": pairs}


@router.post("/train/embedder")
async def train_embedder(
    epochs: int = 5,
    background_tasks: BackgroundTasks = BackgroundTasks(),
    _: str = Depends(get_current_user_id),
):
    """Fine-tune the sentence-transformer embedder on generated training data."""
    if epochs > 20:
        raise HTTPException(400, detail="Max 20 epochs")

    def _train():
        from app.services.embedder_trainer import train
        result = train(train_epochs=epochs)
        import structlog
        structlog.get_logger().info("Embedder fine-tuning complete", result=result)

    background_tasks.add_task(_train)
    return {"message": f"Embedder fine-tuning started ({epochs} epochs)", "note": "This takes 30-60 min on CPU"}
