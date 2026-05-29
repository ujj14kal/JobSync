"""
JobSync Custom Dual-Encoder — built from scratch in raw PyTorch.

No HuggingFace. No pre-trained weights. Randomly initialised, trained entirely
on our own data.

Architecture (per tower):
  token_ids (seq_len)
      │
      ▼
  TokenEmbedding (vocab_size → emb_dim=256)  +  PositionalEncoding
      │
      ▼
  TransformerLayer × 3
    └─ MultiHeadSelfAttention (8 heads, head_dim=32)
    └─ FeedForward (256 → 512 → 256)
    └─ LayerNorm + Dropout
      │
      ▼
  Mean pooling over non-PAD tokens  →  256-dim embedding
      │
      ▼
  L2 normalisation  →  unit-sphere embedding

Dual encoder:
  Resume tower  +  JD tower  (shared weights — better with limited data)
  Produces (resume_emb, jd_emb) both 256-dim on the unit sphere.

Training objective: InfoNCE contrastive loss (in-batch negatives).
  For each (resume_i, jd_i) pair in a batch:
    - Positive: (resume_i, jd_i)
    - Negatives: (resume_i, jd_j≠i) — all other JDs in the batch

Saved to: backend/models/jobsync-encoder-v{N}/
"""
from __future__ import annotations

import json
import math
import time
from pathlib import Path
from typing import Optional
import structlog

logger = structlog.get_logger()

MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models"
ENCODER_META_PATH = MODELS_DIR / "encoder_metadata.json"

EMB_DIM      = 256
N_HEADS      = 8
N_LAYERS     = 3
FFN_DIM      = 512
MAX_SEQ_LEN  = 256
DROPOUT      = 0.2
HEAD_DIM     = EMB_DIM // N_HEADS  # 32


# ─── Model components ─────────────────────────────────────────────────────────

def _build_encoder(vocab_size: int):
    """Build the full encoder model."""
    import torch
    import torch.nn as nn
    import torch.nn.functional as F

    class PositionalEncoding(nn.Module):
        """Classic sinusoidal positional encoding from 'Attention Is All You Need'."""

        def __init__(self, d_model: int, max_len: int = MAX_SEQ_LEN, dropout: float = DROPOUT):
            super().__init__()
            self.dropout = nn.Dropout(dropout)

            pe = torch.zeros(max_len, d_model)
            position = torch.arange(0, max_len).unsqueeze(1).float()
            div_term = torch.exp(
                torch.arange(0, d_model, 2).float() * (-math.log(10000.0) / d_model)
            )
            pe[:, 0::2] = torch.sin(position * div_term)
            pe[:, 1::2] = torch.cos(position * div_term)
            pe = pe.unsqueeze(0)  # (1, max_len, d_model)
            self.register_buffer("pe", pe)

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            # x: (batch, seq, d_model)
            x = x + self.pe[:, : x.size(1)]
            return self.dropout(x)

    class MultiHeadSelfAttention(nn.Module):
        """From-scratch multi-head self-attention."""

        def __init__(self, d_model: int, n_heads: int, dropout: float = DROPOUT):
            super().__init__()
            assert d_model % n_heads == 0
            self.n_heads = n_heads
            self.head_dim = d_model // n_heads
            self.scale = math.sqrt(self.head_dim)

            self.q_proj = nn.Linear(d_model, d_model, bias=False)
            self.k_proj = nn.Linear(d_model, d_model, bias=False)
            self.v_proj = nn.Linear(d_model, d_model, bias=False)
            self.out_proj = nn.Linear(d_model, d_model)
            self.dropout = nn.Dropout(dropout)

        def forward(
            self,
            x: torch.Tensor,
            mask: Optional[torch.Tensor] = None,
        ) -> torch.Tensor:
            B, T, D = x.shape

            Q = self.q_proj(x).view(B, T, self.n_heads, self.head_dim).transpose(1, 2)
            K = self.k_proj(x).view(B, T, self.n_heads, self.head_dim).transpose(1, 2)
            V = self.v_proj(x).view(B, T, self.n_heads, self.head_dim).transpose(1, 2)
            # Q, K, V: (B, heads, T, head_dim)

            attn = torch.matmul(Q, K.transpose(-2, -1)) / self.scale  # (B, heads, T, T)

            if mask is not None:
                # mask: (B, T) — 0 for PAD tokens
                mask = mask.unsqueeze(1).unsqueeze(2)  # (B, 1, 1, T)
                attn = attn.masked_fill(mask == 0, float("-inf"))

            attn = F.softmax(attn, dim=-1)
            attn = self.dropout(attn)

            out = torch.matmul(attn, V)  # (B, heads, T, head_dim)
            out = out.transpose(1, 2).contiguous().view(B, T, D)
            return self.out_proj(out)

    class FeedForward(nn.Module):
        """Position-wise FFN with GELU."""

        def __init__(self, d_model: int, ffn_dim: int, dropout: float = DROPOUT):
            super().__init__()
            self.net = nn.Sequential(
                nn.Linear(d_model, ffn_dim),
                nn.GELU(),
                nn.Dropout(dropout),
                nn.Linear(ffn_dim, d_model),
                nn.Dropout(dropout),
            )

        def forward(self, x: torch.Tensor) -> torch.Tensor:
            return self.net(x)

    class TransformerLayer(nn.Module):
        """Pre-norm transformer layer (more stable than post-norm)."""

        def __init__(self, d_model: int, n_heads: int, ffn_dim: int, dropout: float = DROPOUT):
            super().__init__()
            self.norm1 = nn.LayerNorm(d_model)
            self.norm2 = nn.LayerNorm(d_model)
            self.attn = MultiHeadSelfAttention(d_model, n_heads, dropout)
            self.ffn = FeedForward(d_model, ffn_dim, dropout)

        def forward(self, x: torch.Tensor, mask: Optional[torch.Tensor] = None) -> torch.Tensor:
            # Pre-norm + residual
            x = x + self.attn(self.norm1(x), mask)
            x = x + self.ffn(self.norm2(x))
            return x

    class JobSyncEncoder(nn.Module):
        """
        Full dual-encoder for resume-JD matching.

        Encodes any text into a 256-dim L2-normalised embedding.
        Shared weights for resume and JD towers (parameter-efficient,
        better generalisation on small datasets).
        """

        def __init__(
            self,
            vocab_size: int,
            d_model: int = EMB_DIM,
            n_heads: int = N_HEADS,
            n_layers: int = N_LAYERS,
            ffn_dim: int = FFN_DIM,
            max_seq_len: int = MAX_SEQ_LEN,
            dropout: float = DROPOUT,
        ):
            super().__init__()
            self.d_model = d_model
            self.token_emb = nn.Embedding(vocab_size, d_model, padding_idx=0)
            self.pos_enc = PositionalEncoding(d_model, max_seq_len, dropout)
            self.layers = nn.ModuleList([
                TransformerLayer(d_model, n_heads, ffn_dim, dropout)
                for _ in range(n_layers)
            ])
            self.norm = nn.LayerNorm(d_model)
            self._init_weights()

        def _init_weights(self):
            """Xavier uniform init — standard for transformers."""
            for name, p in self.named_parameters():
                if p.dim() > 1:
                    nn.init.xavier_uniform_(p)
                elif "bias" in name:
                    nn.init.zeros_(p)

        def forward(
            self,
            input_ids: "torch.Tensor",   # (batch, seq_len)
            attention_mask: Optional["torch.Tensor"] = None,  # (batch, seq_len)
        ) -> "torch.Tensor":            # (batch, d_model)
            import torch

            x = self.token_emb(input_ids)            # (B, T, D)
            x = self.pos_enc(x)

            for layer in self.layers:
                x = layer(x, attention_mask)

            x = self.norm(x)

            # Mean pool over non-PAD tokens
            if attention_mask is not None:
                mask_expanded = attention_mask.unsqueeze(-1).float()  # (B, T, 1)
                sum_hidden = (x * mask_expanded).sum(dim=1)            # (B, D)
                n_tokens = mask_expanded.sum(dim=1).clamp(min=1e-8)   # (B, 1)
                pooled = sum_hidden / n_tokens
            else:
                pooled = x.mean(dim=1)

            # L2 normalise → unit sphere (cosine similarity = dot product)
            return torch.nn.functional.normalize(pooled, p=2, dim=-1)

        def encode_texts(
            self,
            texts: list[str],
            tokenizer,
            max_length: int = MAX_SEQ_LEN,
            device: str = "cpu",
            batch_size: int = 32,
        ) -> "torch.Tensor":
            """Convenience method: text list → embedding matrix."""
            import torch

            self.eval()
            all_embs = []
            with torch.no_grad():
                for i in range(0, len(texts), batch_size):
                    batch_texts = texts[i:i + batch_size]
                    ids = tokenizer.encode_batch(batch_texts, max_length)
                    ids_t = torch.tensor(ids, dtype=torch.long, device=device)
                    masks = torch.tensor(
                        [tokenizer.get_attention_mask(row) for row in ids],
                        dtype=torch.long, device=device
                    )
                    embs = self(ids_t, masks)
                    all_embs.append(embs.cpu())
            return torch.cat(all_embs, dim=0)

    return JobSyncEncoder(vocab_size)


# ─── Metadata I/O ─────────────────────────────────────────────────────────────

def _load_encoder_meta() -> dict:
    if ENCODER_META_PATH.exists():
        try:
            return json.loads(ENCODER_META_PATH.read_text())
        except Exception:
            pass
    return {"version": 0}


def _save_encoder_meta(meta: dict) -> None:
    ENCODER_META_PATH.write_text(json.dumps(meta, indent=2))


# ─── Persistence ──────────────────────────────────────────────────────────────

def save_encoder(model, version: int) -> Path:
    """Save encoder weights to disk."""
    import torch
    save_dir = MODELS_DIR / f"jobsync-encoder-v{version}"
    save_dir.mkdir(exist_ok=True)
    torch.save(model.state_dict(), save_dir / "encoder.pt")
    return save_dir


def load_encoder(version: Optional[int] = None):
    """Load encoder from disk. Returns (model, tokenizer) or (None, None)."""
    import torch
    from app.services.custom_tokenizer import JobSyncTokenizer

    meta = _load_encoder_meta()
    v = version or meta.get("version", 0)
    if v == 0:
        return None, None

    model_path = MODELS_DIR / f"jobsync-encoder-v{v}" / "encoder.pt"
    if not model_path.exists():
        return None, None

    try:
        tokenizer = JobSyncTokenizer.load_or_build()
        model = _build_encoder(tokenizer.vocab_size)
        state = torch.load(model_path, map_location="cpu", weights_only=True)
        model.load_state_dict(state)
        model.eval()
        logger.info("Custom encoder loaded", version=v, vocab_size=tokenizer.vocab_size)
        return model, tokenizer
    except Exception as e:
        logger.error("Failed to load custom encoder", error=str(e))
        return None, None


# ─── Singleton ────────────────────────────────────────────────────────────────

_encoder_instance = None
_tokenizer_instance = None
_encoder_loaded_at: float = 0.0
_RELOAD_INTERVAL = 3600.0


def get_encoder():
    """Return cached (encoder, tokenizer) or (None, None)."""
    global _encoder_instance, _tokenizer_instance, _encoder_loaded_at
    import time as _time

    now = _time.monotonic()
    if now - _encoder_loaded_at > _RELOAD_INTERVAL:
        _encoder_instance, _tokenizer_instance = load_encoder()
        _encoder_loaded_at = now

    return _encoder_instance, _tokenizer_instance


def encoder_status() -> dict:
    meta = _load_encoder_meta()
    encoder, tokenizer = get_encoder()
    return {
        "trained": encoder is not None,
        "version": meta.get("version", 0),
        "vocab_size": tokenizer.vocab_size if tokenizer else 0,
        "architecture": f"DualEncoder({N_LAYERS}L × {N_HEADS}H × {EMB_DIM}d)",
        "embedding_dim": EMB_DIM,
        "parameters": _count_params(encoder) if encoder else 0,
        "trained_at": meta.get("trained_at"),
        "val_loss": meta.get("val_loss"),
    }


def _count_params(model) -> int:
    if model is None:
        return 0
    return sum(p.numel() for p in model.parameters() if p.requires_grad)
