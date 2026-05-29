"""
JobSync Custom Tokenizer — built from scratch, domain-specific.

No HuggingFace, no external library. Pure Python + our domain vocab.

Design:
  - Word-level tokenization on cleaned text
  - Domain vocabulary seeded from domain_vocab.py (~800 tech terms)
  - Extended with any new tokens seen during corpus build
  - Special tokens: [PAD]=0, [UNK]=1, [CLS]=2, [SEP]=3, [MASK]=4
  - Handles camelCase, snake_case, kebab-case splitting
  - Saves/loads from a JSON vocab file

Usage:
  tok = JobSyncTokenizer.build_from_corpus(texts)   # train once
  tok.save("models/tokenizer.json")
  tok = JobSyncTokenizer.load("models/tokenizer.json")

  ids = tok.encode("Built a React app with FastAPI backend", max_length=128)
  text = tok.decode(ids)
"""
from __future__ import annotations

import json
import re
from collections import Counter
from pathlib import Path
from typing import Optional

MODELS_DIR = Path(__file__).resolve().parent.parent.parent / "models"
TOKENIZER_PATH = MODELS_DIR / "jobsync_tokenizer.json"

# ─── Special tokens ──────────────────────────────────────────────────────────
PAD_TOKEN   = "[PAD]"
UNK_TOKEN   = "[UNK]"
CLS_TOKEN   = "[CLS]"
SEP_TOKEN   = "[SEP]"
MASK_TOKEN  = "[MASK]"

PAD_ID  = 0
UNK_ID  = 1
CLS_ID  = 2
SEP_ID  = 3
MASK_ID = 4

SPECIAL_TOKENS = [PAD_TOKEN, UNK_TOKEN, CLS_TOKEN, SEP_TOKEN, MASK_TOKEN]


# ─── Text normalisation ───────────────────────────────────────────────────────

def _split_compound(token: str) -> list[str]:
    """
    Split compound tokens: camelCase, snake_case, kebab-case, slash/dot.
    e.g. "ReactNative" → ["react", "native"]
         "full-stack"  → ["full", "stack"]
         "ci/cd"       → ["ci", "cd"]
    """
    # Insert space before uppercase letters preceded by lowercase
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", token)
    # Split on common separators
    parts = re.split(r"[_\-/\.\s]+", s)
    return [p.lower() for p in parts if p]


def tokenize_text(text: str) -> list[str]:
    """
    Convert raw text to a list of clean token strings.
    Handles punctuation, numbers, compound words.
    """
    # Lowercase
    text = text.lower()
    # Normalise whitespace and common punctuation
    text = re.sub(r"[^\w\s\-/\.]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()

    raw_tokens = text.split()
    tokens: list[str] = []
    for raw in raw_tokens:
        parts = _split_compound(raw)
        for part in parts:
            # Keep numbers (years of experience etc.)
            part = part.strip()
            if part and (part.isalpha() or part.isnumeric() or re.match(r"^\d+\+?$", part)):
                tokens.append(part)
    return tokens


# ─── Tokenizer class ──────────────────────────────────────────────────────────

class JobSyncTokenizer:
    """
    Domain-specific word-level tokenizer for resume and JD text.

    Vocab is seeded from domain_vocab.py and extended from the training corpus.
    Any token not in vocab maps to [UNK].
    """

    def __init__(self, token2id: dict[str, int], id2token: dict[int, str]):
        self.token2id = token2id
        self.id2token = id2token
        self.vocab_size = len(token2id)

    # ── Build ──────────────────────────────────────────────────────────────────

    @classmethod
    def build_from_corpus(
        cls,
        texts: list[str],
        max_vocab: int = 16_000,
        min_freq: int = 1,
    ) -> "JobSyncTokenizer":
        """
        Build tokenizer from a list of texts.
        Always includes the full domain vocab regardless of frequency.
        """
        from app.services.domain_vocab import ALL_DOMAIN_WORDS

        # Count all tokens in corpus
        counter: Counter = Counter()
        for text in texts:
            counter.update(tokenize_text(text))

        # Start with special tokens
        token2id: dict[str, int] = {}
        for i, tok in enumerate(SPECIAL_TOKENS):
            token2id[tok] = i

        # Add domain vocab first (always included)
        for word in ALL_DOMAIN_WORDS:
            if word not in token2id:
                token2id[word] = len(token2id)

        # Add corpus tokens by frequency
        for token, freq in counter.most_common():
            if len(token2id) >= max_vocab:
                break
            if freq >= min_freq and token not in token2id and len(token) >= 2:
                token2id[token] = len(token2id)

        id2token = {v: k for k, v in token2id.items()}
        tok = cls(token2id, id2token)
        return tok

    @classmethod
    def build_default(cls) -> "JobSyncTokenizer":
        """Build tokenizer from domain vocab alone (no corpus needed)."""
        return cls.build_from_corpus([], max_vocab=16_000)

    # ── Encode / decode ────────────────────────────────────────────────────────

    def encode(
        self,
        text: str,
        max_length: int = 256,
        add_special_tokens: bool = True,
    ) -> list[int]:
        """
        Encode text to token IDs.
        Returns list of exactly max_length IDs (padded / truncated).
        Starts with [CLS], ends with [SEP] if add_special_tokens=True.
        """
        tokens = tokenize_text(text)
        ids = [self.token2id.get(t, UNK_ID) for t in tokens]

        if add_special_tokens:
            max_content = max_length - 2  # leave room for [CLS] and [SEP]
            ids = ids[:max_content]
            ids = [CLS_ID] + ids + [SEP_ID]
        else:
            ids = ids[:max_length]

        # Pad to max_length
        padding = max_length - len(ids)
        ids = ids + [PAD_ID] * padding

        return ids

    def encode_batch(
        self,
        texts: list[str],
        max_length: int = 256,
    ) -> list[list[int]]:
        return [self.encode(t, max_length) for t in texts]

    def decode(self, ids: list[int], skip_special: bool = True) -> str:
        tokens = []
        for i in ids:
            tok = self.id2token.get(i, UNK_TOKEN)
            if skip_special and tok in SPECIAL_TOKENS:
                continue
            tokens.append(tok)
        return " ".join(tokens)

    def get_attention_mask(self, ids: list[int]) -> list[int]:
        """1 for real tokens, 0 for padding."""
        return [0 if i == PAD_ID else 1 for i in ids]

    # ── Serialisation ──────────────────────────────────────────────────────────

    def save(self, path: Optional[Path] = None) -> Path:
        path = Path(path or TOKENIZER_PATH)
        path.parent.mkdir(parents=True, exist_ok=True)
        data = {
            "vocab_size": self.vocab_size,
            "token2id": self.token2id,
        }
        path.write_text(json.dumps(data))
        return path

    @classmethod
    def load(cls, path: Optional[Path] = None) -> "JobSyncTokenizer":
        path = Path(path or TOKENIZER_PATH)
        data = json.loads(path.read_text())
        token2id = data["token2id"]
        id2token = {v: k for k, v in token2id.items()}
        return cls(token2id, id2token)

    @classmethod
    def load_or_build(cls) -> "JobSyncTokenizer":
        """Load from disk if exists, else build from domain vocab."""
        if TOKENIZER_PATH.exists():
            return cls.load()
        tok = cls.build_default()
        tok.save()
        return tok

    def __repr__(self) -> str:
        return f"JobSyncTokenizer(vocab_size={self.vocab_size})"
