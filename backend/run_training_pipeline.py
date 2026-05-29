"""
Full AI Training Pipeline — runs everything automatically.

Steps:
  1. Generate 600 synthetic training pairs via Groq
  2. Train the JobSync Neural Scorer (100 epochs)
  3. Fine-tune the sentence-transformer embedder (5 epochs)

Usage:
  python run_training_pipeline.py

Logs → backend/logs/training_pipeline.log
"""
import asyncio
import json
import os
import sys
import time
import logging
from pathlib import Path

# Set up logging to both file and stdout
LOG_FILE = Path(__file__).parent / "logs" / "training_pipeline.log"
LOG_FILE.parent.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_FILE),
    ],
)
log = logging.getLogger("pipeline")


async def step1_generate_data(target_pairs: int = 600) -> int:
    """Generate synthetic training data."""
    from app.services.synthetic_data_gen import generate_dataset, save_dataset, OUTPUT_PATH

    # Check if data already exists with enough pairs
    if OUTPUT_PATH.exists():
        with OUTPUT_PATH.open() as f:
            existing = sum(1 for line in f if line.strip())
        if existing >= target_pairs * 0.8:
            log.info(f"✓ Training data already exists ({existing} pairs) — skipping generation")
            return existing

    log.info(f"▶ Step 1: Generating {target_pairs} synthetic training pairs via Groq...")
    t0 = time.monotonic()
    pairs = await generate_dataset(target_pairs=target_pairs)
    save_dataset(pairs)
    elapsed = time.monotonic() - t0
    log.info(f"✓ Step 1 done: {len(pairs)} pairs saved → {OUTPUT_PATH}  ({elapsed:.0f}s)")
    return len(pairs)


def step2_train_neural_scorer(epochs: int = 100) -> dict:
    """Train the custom PyTorch neural scorer."""
    from app.services.neural_trainer import train
    from app.services.neural_trainer import _load_feedback_data

    log.info(f"▶ Step 2: Training JobSync Neural Scorer ({epochs} epochs)...")
    log.info("  Architecture: 3082→1024→512→256→5 heads (PyTorch, fully local)")
    t0 = time.monotonic()

    # Load feedback data synchronously for this context
    result = train(epochs=epochs, fine_tune=False, feedback_records=[])
    elapsed = time.monotonic() - t0

    if result.get("status") == "trained":
        log.info(
            f"✓ Step 2 done: Neural scorer v{result['version']} trained  "
            f"val_mse={result['val_mse']}  val_mae={result['val_mae']}  "
            f"samples={result['samples']}  epochs={result['epochs']}  ({elapsed:.0f}s)"
        )
    else:
        log.warning(f"✗ Step 2 issue: {result}")
    return result


def step3_train_embedder(epochs: int = 5) -> dict:
    """Fine-tune the sentence-transformer embedder."""
    log.info(f"▶ Step 3: Fine-tuning sentence-transformer embedder ({epochs} epochs)...")
    log.info("  Base model: all-mpnet-base-v2  Loss: MultipleNegativesRankingLoss")
    t0 = time.monotonic()

    try:
        from app.services.embedder_trainer import train as train_embedder
        result = train_embedder(train_epochs=epochs)
        elapsed = time.monotonic() - t0
        log.info(f"✓ Step 3 done: Embedder fine-tuned  ({elapsed:.0f}s)")
        return result
    except Exception as e:
        elapsed = time.monotonic() - t0
        log.warning(f"  Step 3 skipped / failed: {e}  ({elapsed:.0f}s)")
        return {"status": "skipped", "error": str(e)}


async def main():
    log.info("=" * 60)
    log.info("JobSync AI Training Pipeline")
    log.info("=" * 60)
    pipeline_start = time.monotonic()

    # ── Step 1: Generate training data ────────────────────────
    try:
        n_pairs = await step1_generate_data(target_pairs=600)
    except Exception as e:
        log.error(f"Step 1 FAILED: {e}")
        log.error("Cannot proceed without training data. Aborting.")
        return

    if n_pairs < 50:
        log.error(f"Only {n_pairs} pairs generated (need 50+). Aborting.")
        return

    # ── Step 2: Train neural scorer ───────────────────────────
    try:
        scorer_result = await asyncio.to_thread(step2_train_neural_scorer, 100)
    except Exception as e:
        log.error(f"Step 2 FAILED: {e}")
        scorer_result = {"status": "failed"}

    # ── Step 3: Fine-tune embedder ────────────────────────────
    try:
        embedder_result = await asyncio.to_thread(step3_train_embedder, 5)
    except Exception as e:
        log.warning(f"Step 3 FAILED (non-critical): {e}")
        embedder_result = {"status": "failed"}

    total_elapsed = time.monotonic() - pipeline_start
    log.info("=" * 60)
    log.info(f"Pipeline complete in {total_elapsed / 60:.1f} min")
    log.info(f"  Training pairs:    {n_pairs}")
    log.info(f"  Neural scorer:     {scorer_result.get('status')} v{scorer_result.get('version','?')}")
    log.info(f"    val_mse:         {scorer_result.get('val_mse','—')}")
    log.info(f"    val_mae:         {scorer_result.get('val_mae','—')}")
    log.info(f"  Embedder:          {embedder_result.get('status','?')}")
    log.info("=" * 60)
    log.info("✅ JobSync AI is now using your custom neural model.")
    log.info("   No Groq API calls needed for scoring anymore.")
    log.info(f"   Check logs: {LOG_FILE}")

    summary = {
        "n_pairs": n_pairs,
        "scorer": scorer_result,
        "embedder": embedder_result,
        "total_minutes": round(total_elapsed / 60, 1),
    }
    summary_path = Path(__file__).parent / "logs" / "pipeline_summary.json"
    summary_path.write_text(json.dumps(summary, indent=2))
    log.info(f"   Summary saved: {summary_path}")


if __name__ == "__main__":
    asyncio.run(main())
