"""
Encoder Trainer — trains the JobSync custom dual-encoder from scratch.

Training objective: InfoNCE contrastive loss (in-batch negatives).
  For a batch of (resume_i, jd_i) pairs:
    - Positive: sim(resume_i, jd_i)  ← should be HIGH
    - Negatives: sim(resume_i, jd_j≠i) ← should be LOW

  The model learns that matching resume-JD pairs should be close on the
  unit sphere while non-matching pairs should be far apart.

Additionally: for pairs with known scores, add an MSE loss on the
  expected cosine similarity (score/100 → expected_sim in [-1, 1]).

Usage:
  python -m app.services.encoder_trainer
  python -m app.services.encoder_trainer --epochs 30 --pairs 5000
"""
from __future__ import annotations

import argparse
import asyncio
import json
import time
from datetime import datetime
from pathlib import Path
from typing import Optional

import structlog

logger = structlog.get_logger()

DATA_PATH = Path(__file__).resolve().parent.parent.parent / "data" / "training_pairs.jsonl"
MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models"

BATCH_SIZE    = 64
DEFAULT_EPOCHS = 40
LR             = 3e-4
WEIGHT_DECAY   = 1e-4
PATIENCE       = 8
TEMPERATURE    = 0.07   # InfoNCE temperature — lower = harder negatives


def _load_pairs(max_pairs: Optional[int] = None) -> list[dict]:
    if not DATA_PATH.exists():
        return []
    records = []
    with DATA_PATH.open() as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
                if "resume" in r and "jd" in r:
                    records.append(r)
            except Exception:
                continue
    if max_pairs:
        records = records[:max_pairs]
    return records


class EncoderDataset:
    """Dataset of (resume_ids, jd_ids, expected_cosine_sim) tuples."""

    def __init__(self, records: list[dict], tokenizer, max_length: int = 256):
        import torch

        self.resume_ids = []
        self.resume_masks = []
        self.jd_ids = []
        self.jd_masks = []
        self.expected_sim = []

        for r in records:
            r_ids = tokenizer.encode(r["resume"], max_length)
            j_ids = tokenizer.encode(r["jd"], max_length)

            self.resume_ids.append(r_ids)
            self.resume_masks.append(tokenizer.get_attention_mask(r_ids))
            self.jd_ids.append(j_ids)
            self.jd_masks.append(tokenizer.get_attention_mask(j_ids))

            # Convert overall score → expected cosine sim [-1, 1]
            # High match (score ~90) → sim ~0.85
            # Low match (score ~15) → sim ~-0.6
            ats = r.get("ats_score", 50.0)
            tech = r.get("technical_fit_score", 50.0)
            sem = r.get("semantic_match_score", 50.0)
            overall = (ats * 0.2 + tech * 0.3 + sem * 0.3 +
                       r.get("recruiter_impression_score", 50.0) * 0.1 +
                       r.get("project_relevance_score", 50.0) * 0.1)
            # Map [0,100] → [-0.8, 0.95] via a calibrated sigmoid-like curve
            sim = (overall - 50.0) / 55.0   # roughly [-0.9, 0.9]
            sim = max(-0.9, min(0.95, sim))
            self.expected_sim.append(sim)

        self.resume_ids_t = torch.tensor(self.resume_ids, dtype=torch.long)
        self.resume_masks_t = torch.tensor(self.resume_masks, dtype=torch.long)
        self.jd_ids_t = torch.tensor(self.jd_ids, dtype=torch.long)
        self.jd_masks_t = torch.tensor(self.jd_masks, dtype=torch.long)
        self.expected_sim_t = torch.tensor(self.expected_sim, dtype=torch.float32)

    def __len__(self):
        return len(self.resume_ids)

    def __getitem__(self, idx):
        return (
            self.resume_ids_t[idx], self.resume_masks_t[idx],
            self.jd_ids_t[idx], self.jd_masks_t[idx],
            self.expected_sim_t[idx],
        )


def infonce_loss(resume_embs, jd_embs, temperature: float = TEMPERATURE):
    """
    InfoNCE (NT-Xent) contrastive loss.
    resume_embs: (B, D) — normalised
    jd_embs:     (B, D) — normalised
    Diagonal = positive pairs, off-diagonal = in-batch negatives.
    """
    import torch
    import torch.nn.functional as F

    # Similarity matrix: (B, B)
    sim = torch.matmul(resume_embs, jd_embs.T) / temperature
    labels = torch.arange(sim.size(0), device=sim.device)

    # Cross-entropy in both directions (symmetric)
    loss_r2j = F.cross_entropy(sim, labels)
    loss_j2r = F.cross_entropy(sim.T, labels)
    return (loss_r2j + loss_j2r) / 2.0


def regression_loss(resume_embs, jd_embs, expected_sim):
    """MSE between actual cosine sim and expected sim."""
    import torch
    import torch.nn.functional as F

    actual_sim = (resume_embs * jd_embs).sum(dim=-1)   # dot product of L2-normed = cosine
    return F.mse_loss(actual_sim, expected_sim)


def train(
    epochs: int = DEFAULT_EPOCHS,
    n_pairs: Optional[int] = None,
    contrastive_weight: float = 1.0,
    regression_weight: float = 0.3,
) -> dict:
    """Train the custom encoder. Returns training result dict."""
    import torch
    import torch.nn as nn
    from torch.utils.data import DataLoader, random_split
    from torch.optim import AdamW
    from torch.optim.lr_scheduler import CosineAnnealingLR

    from app.services.custom_tokenizer import JobSyncTokenizer
    from app.services.custom_encoder import (
        _build_encoder, save_encoder, _load_encoder_meta, _save_encoder_meta,
    )

    logger.info("Encoder trainer starting", epochs=epochs)

    # Load / build tokenizer
    tokenizer = JobSyncTokenizer.load_or_build()
    logger.info("Tokenizer ready", vocab_size=tokenizer.vocab_size)

    # Load training data
    records = _load_pairs(n_pairs)
    if len(records) < 50:
        logger.error("Not enough training pairs", have=len(records), need=50)
        return {"status": "insufficient_data", "have": len(records)}

    logger.info("Building dataset (tokenising)...", pairs=len(records))
    dataset = EncoderDataset(records, tokenizer)

    n_val = max(32, int(len(dataset) * 0.1))
    n_train = len(dataset) - n_val
    train_ds, val_ds = random_split(dataset, [n_train, n_val])

    train_loader = DataLoader(train_ds, batch_size=BATCH_SIZE, shuffle=True, num_workers=0, drop_last=True)
    val_loader   = DataLoader(val_ds,   batch_size=BATCH_SIZE, shuffle=False, num_workers=0)

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    logger.info("Training on", device=str(device))

    model = _build_encoder(tokenizer.vocab_size).to(device)
    n_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    logger.info("Model parameters", n_params=f"{n_params:,}")

    optimizer = AdamW(model.parameters(), lr=LR, weight_decay=WEIGHT_DECAY)
    scheduler = CosineAnnealingLR(optimizer, T_max=epochs, eta_min=1e-6)

    best_val_loss = float("inf")
    best_state = None
    patience_counter = 0

    t_start = time.monotonic()

    for epoch in range(1, epochs + 1):
        # ── Train ──────────────────────────────────────────────────────────────
        model.train()
        total_loss = 0.0

        for batch in train_loader:
            r_ids, r_mask, j_ids, j_mask, exp_sim = [b.to(device) for b in batch]

            r_emb = model(r_ids, r_mask)
            j_emb = model(j_ids, j_mask)

            c_loss = infonce_loss(r_emb, j_emb)
            r_loss = regression_loss(r_emb, j_emb, exp_sim)
            loss = contrastive_weight * c_loss + regression_weight * r_loss

            optimizer.zero_grad()
            loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), max_norm=1.0)
            optimizer.step()
            total_loss += loss.item()

        scheduler.step()
        avg_train = total_loss / len(train_loader)

        # ── Validate ───────────────────────────────────────────────────────────
        model.eval()
        val_loss = 0.0
        val_pos_sim = 0.0   # avg cosine sim for positive pairs (should be high)
        n_val_batches = 0

        with torch.no_grad():
            for batch in val_loader:
                r_ids, r_mask, j_ids, j_mask, exp_sim = [b.to(device) for b in batch]
                r_emb = model(r_ids, r_mask)
                j_emb = model(j_ids, j_mask)

                c_loss = infonce_loss(r_emb, j_emb)
                r_loss = regression_loss(r_emb, j_emb, exp_sim)
                loss = contrastive_weight * c_loss + regression_weight * r_loss
                val_loss += loss.item()

                # Track avg positive pair cosine similarity
                pos_sim = (r_emb * j_emb).sum(dim=-1).mean().item()
                val_pos_sim += pos_sim
                n_val_batches += 1

        avg_val = val_loss / max(n_val_batches, 1)
        avg_pos_sim = val_pos_sim / max(n_val_batches, 1)

        if epoch % 5 == 0 or epoch == 1:
            logger.info(
                "Epoch",
                epoch=epoch, total=epochs,
                train_loss=round(avg_train, 4),
                val_loss=round(avg_val, 4),
                pos_cosine_sim=round(avg_pos_sim, 4),
            )

        # Early stopping
        if avg_val < best_val_loss - 0.001:
            best_val_loss = avg_val
            best_state = {k: v.cpu().clone() for k, v in model.state_dict().items()}
            patience_counter = 0
        else:
            patience_counter += 1
            if patience_counter >= PATIENCE:
                logger.info("Early stopping", epoch=epoch, best_val_loss=round(best_val_loss, 4))
                break

    elapsed = time.monotonic() - t_start

    if best_state is None:
        best_state = {k: v.cpu() for k, v in model.state_dict().items()}

    # Save
    old_meta = _load_encoder_meta()
    new_version = old_meta.get("version", 0) + 1
    model.load_state_dict(best_state)
    save_dir = save_encoder(model, new_version)
    tokenizer.save()

    new_meta = {
        "version": new_version,
        "vocab_size": tokenizer.vocab_size,
        "training_samples": len(records),
        "epochs_trained": epoch,
        "val_loss": round(best_val_loss, 6),
        "avg_pos_cosine_sim": round(avg_pos_sim, 4),
        "trained_at": datetime.utcnow().isoformat(),
        "training_secs": round(elapsed, 1),
        "device": str(device),
        "architecture": f"DualEncoder(3L×8H×256d, vocab={tokenizer.vocab_size})",
    }
    _save_encoder_meta(new_meta)

    # Invalidate singleton
    import app.services.custom_encoder as ce
    ce._encoder_instance = None
    ce._tokenizer_instance = None
    ce._encoder_loaded_at = 0.0

    logger.info(
        "Encoder training complete",
        version=new_version,
        val_loss=round(best_val_loss, 4),
        pos_cosine_sim=round(avg_pos_sim, 4),
        epochs=epoch,
        elapsed_secs=round(elapsed, 1),
    )

    return {
        "status": "trained",
        "version": new_version,
        "val_loss": round(best_val_loss, 6),
        "avg_pos_cosine_sim": round(avg_pos_sim, 4),
        "epochs": epoch,
        "elapsed_secs": round(elapsed, 1),
        "save_dir": str(save_dir),
    }


if __name__ == "__main__":
    import logging, sys
    logging.basicConfig(level=logging.INFO)
    parser = argparse.ArgumentParser()
    parser.add_argument("--epochs", type=int, default=DEFAULT_EPOCHS)
    parser.add_argument("--pairs", type=int, default=None)
    args = parser.parse_args()
    result = train(epochs=args.epochs, n_pairs=args.pairs)
    print(json.dumps(result, indent=2))
