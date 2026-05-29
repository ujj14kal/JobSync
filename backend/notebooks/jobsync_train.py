"""
JobSync AI Training Script — runs on Kaggle / Google Colab / any GPU machine.

This single file trains the full JobSync custom AI:
  1. Custom dual-encoder (InfoNCE contrastive, batch_size=256 on GPU)
  2. Neural scorer (MSE + ranking loss, 5-head output)

Designed to run on FREE GPU:
  - Kaggle: free P100/T4, 30h/week
  - Google Colab: free T4

After training, uploads model to GitHub Releases automatically.

Run on Kaggle/Colab:
  !git clone https://github.com/ujj14kal/JobSync.git
  %cd JobSync/backend
  !pip install -q torch numpy scikit-learn
  !python notebooks/jobsync_train.py --github-token YOUR_GITHUB_TOKEN

Or set env var: GITHUB_TOKEN=... python notebooks/jobsync_train.py
"""
from __future__ import annotations

import argparse
import json
import math
import os
import random
import re
import sys
import time
import zipfile
from collections import Counter
from datetime import datetime
from pathlib import Path

# ─── Constants ─────────────────────────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
DATA_PATH  = ROOT / "data" / "training_pairs.jsonl"
MODELS_DIR = ROOT / "models"
MODELS_DIR.mkdir(exist_ok=True)
(ROOT / "data").mkdir(exist_ok=True)
(ROOT / "logs").mkdir(exist_ok=True)

GITHUB_REPO  = "ujj14kal/JobSync"
RELEASE_TAG  = "ai-model-latest"

# ─── GPU-optimised hyperparameters ────────────────────────────────────────────
ENCODER_EPOCHS    = 60
ENCODER_BATCH     = 256   # large batches = more in-batch negatives = better contrastive learning
ENCODER_LR        = 3e-4
ENCODER_TEMP      = 0.05  # aggressive temperature for hard negatives

SCORER_EPOCHS     = 150
SCORER_BATCH      = 128
SCORER_LR         = 2e-4

EMB_DIM   = 256
N_HEADS   = 8
N_LAYERS  = 3
FFN_DIM   = 512
MAX_LEN   = 256
DROPOUT   = 0.15   # lower dropout with more data

print("=" * 60)
print("JobSync Custom AI Trainer")
print(f"Data: {DATA_PATH}")
print(f"Output: {MODELS_DIR}")
print("=" * 60)

import torch
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Device: {device}")
if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}")
    print(f"VRAM: {torch.cuda.get_device_properties(0).total_memory / 1e9:.1f} GB")


# ══════════════════════════════════════════════════════════════════════════════
# PART 1 — DOMAIN VOCABULARY
# ══════════════════════════════════════════════════════════════════════════════

ALL_DOMAIN_WORDS = [
    # Languages
    "python","java","javascript","typescript","golang","go","rust","scala","kotlin",
    "swift","c","cpp","csharp","ruby","php","r","matlab","bash","shell","sql","html","css","dart",
    # Frontend
    "react","reactjs","nextjs","vuejs","angular","svelte","redux","graphql","webpack","vite",
    "tailwind","sass","storybook","cypress","jest","vitest","playwright","shadcn","framer","d3",
    # Backend
    "fastapi","django","flask","express","nestjs","spring","rails","laravel","gin","fiber",
    "grpc","rest","websocket","microservices","celery","kafka","rabbitmq","redis","elasticsearch",
    "nginx","gunicorn","uvicorn",
    # ML/Data
    "tensorflow","pytorch","keras","scikit","sklearn","xgboost","lightgbm","catboost",
    "huggingface","transformers","langchain","pandas","numpy","scipy","matplotlib","spark",
    "hadoop","airflow","dbt","mlflow","wandb","ray","cuda","onnx","llm","embedding","rag",
    "bert","gpt","nlp","cv","regression","classification","clustering","neural","deep",
    # DevOps/Cloud
    "aws","gcp","azure","docker","kubernetes","terraform","ansible","jenkins","github","gitlab",
    "helm","prometheus","grafana","datadog","cloudwatch","lambda","ec2","s3","rds","dynamodb",
    "bigquery","cloudrun","eks","gke","istio","argocd","pulumi","observability",
    # Databases
    "postgresql","postgres","mysql","sqlite","mongodb","cassandra","snowflake","databricks",
    "clickhouse","pinecone","pgvector","firebase","neo4j","supabase",
    # Roles/Seniority
    "software","engineer","developer","architect","lead","senior","junior","staff","principal",
    "manager","director","vp","head","tech","fullstack","frontend","backend","platform",
    "infrastructure","ml","data","product","mobile","security","devops","sre","analyst",
    "scientist","researcher","consultant","mid","entry","expert","specialist","associate",
    # Verbs
    "built","developed","designed","implemented","architected","led","managed","scaled",
    "optimized","reduced","increased","shipped","launched","deployed","migrated","refactored",
    "created","established","improved","delivered","mentored","collaborated","integrated",
    "automated","monitored","researched","analyzed","modeled","trained","evaluated",
    "maintained","debugged","reviewed","tested","documented","owned","drove","streamlined",
    # Structure
    "experience","education","skills","projects","summary","objective","certifications",
    "work","employment","history","background","profile","contact","email","phone","linkedin",
    "university","degree","bachelor","master","phd","gpa","graduated","major","company",
    "startup","corporation","remote","hybrid","fulltime","contract","freelance","internship",
    # Metrics
    "million","billion","thousand","percent","users","customers","revenue","cost","latency",
    "throughput","uptime","reduction","improvement","increase","growth","savings","team",
    # Common
    "and","the","with","using","for","in","on","at","to","of","a","an","is","are","was",
    "have","has","our","we","project","system","service","platform","application","api",
    "code","feature","product","solution","performance","quality","reliability","scalability",
    "requirements","experience","knowledge","ability","proficiency","strong","excellent",
]

# ══════════════════════════════════════════════════════════════════════════════
# PART 2 — TOKENIZER
# ══════════════════════════════════════════════════════════════════════════════

PAD_ID, UNK_ID, CLS_ID, SEP_ID = 0, 1, 2, 3
SPECIAL = ["[PAD]", "[UNK]", "[CLS]", "[SEP]"]

def _split_compound(token):
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", token)
    parts = re.split(r"[_\-/\.\s]+", s)
    return [p.lower() for p in parts if p]

def tokenize(text):
    text = text.lower()
    text = re.sub(r"[^\w\s\-/\.]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    tokens = []
    for raw in text.split():
        for part in _split_compound(raw):
            if part and (part.isalpha() or part.isnumeric()):
                tokens.append(part)
    return tokens

class Tokenizer:
    def __init__(self, token2id):
        self.token2id = token2id
        self.vocab_size = len(token2id)

    @classmethod
    def build(cls, extra_texts=None):
        t2i = {t: i for i, t in enumerate(SPECIAL)}
        for w in ALL_DOMAIN_WORDS:
            if w not in t2i:
                t2i[w] = len(t2i)
        if extra_texts:
            counter = Counter()
            for txt in extra_texts:
                counter.update(tokenize(txt))
            for tok, freq in counter.most_common(8000):
                if tok not in t2i and freq >= 2:
                    t2i[tok] = len(t2i)
        return cls(t2i)

    def encode(self, text, max_len=MAX_LEN):
        toks = tokenize(text)
        ids  = [self.token2id.get(t, UNK_ID) for t in toks]
        ids  = [CLS_ID] + ids[: max_len - 2] + [SEP_ID]
        ids += [PAD_ID] * (max_len - len(ids))
        return ids

    def mask(self, ids):
        return [0 if i == PAD_ID else 1 for i in ids]

    def save(self, path):
        json.dump(self.token2id, open(path, "w"))

    @classmethod
    def load(cls, path):
        return cls(json.load(open(path)))

# ══════════════════════════════════════════════════════════════════════════════
# PART 3 — CUSTOM ENCODER (from scratch)
# ══════════════════════════════════════════════════════════════════════════════

import torch.nn as nn
import torch.nn.functional as F

class SinusoidalPE(nn.Module):
    def __init__(self, d, max_len=MAX_LEN, drop=DROPOUT):
        super().__init__()
        self.drop = nn.Dropout(drop)
        pe = torch.zeros(max_len, d)
        pos = torch.arange(max_len).unsqueeze(1).float()
        div = torch.exp(torch.arange(0, d, 2).float() * (-math.log(10000.0) / d))
        pe[:, 0::2] = torch.sin(pos * div)
        pe[:, 1::2] = torch.cos(pos * div)
        self.register_buffer("pe", pe.unsqueeze(0))
    def forward(self, x):
        return self.drop(x + self.pe[:, :x.size(1)])

class MHSA(nn.Module):
    def __init__(self, d, h, drop=DROPOUT):
        super().__init__()
        self.h, self.hd = h, d // h
        self.qkv  = nn.Linear(d, 3 * d, bias=False)
        self.out  = nn.Linear(d, d)
        self.drop = nn.Dropout(drop)
        self.scale = math.sqrt(self.hd)

    def forward(self, x, mask=None):
        B, T, D = x.shape
        q, k, v = self.qkv(x).chunk(3, dim=-1)
        def split(t): return t.view(B, T, self.h, self.hd).transpose(1, 2)
        q, k, v = split(q), split(k), split(v)
        attn = (q @ k.transpose(-2,-1)) / self.scale
        if mask is not None:
            attn = attn.masked_fill(mask.unsqueeze(1).unsqueeze(2) == 0, float("-inf"))
        attn = self.drop(F.softmax(attn, dim=-1))
        out  = (attn @ v).transpose(1,2).reshape(B, T, D)
        return self.out(out)

class FFN(nn.Module):
    def __init__(self, d, fd, drop=DROPOUT):
        super().__init__()
        self.net = nn.Sequential(nn.Linear(d,fd), nn.GELU(), nn.Dropout(drop), nn.Linear(fd,d), nn.Dropout(drop))
    def forward(self, x): return self.net(x)

class TxLayer(nn.Module):
    def __init__(self, d, h, fd, drop=DROPOUT):
        super().__init__()
        self.n1 = nn.LayerNorm(d); self.n2 = nn.LayerNorm(d)
        self.attn = MHSA(d, h, drop); self.ffn = FFN(d, fd, drop)
    def forward(self, x, mask=None):
        x = x + self.attn(self.n1(x), mask)
        x = x + self.ffn(self.n2(x))
        return x

class JobSyncEncoder(nn.Module):
    """Custom dual-encoder — from scratch, no pre-trained weights."""
    def __init__(self, vocab_size, d=EMB_DIM, h=N_HEADS, nl=N_LAYERS, fd=FFN_DIM, drop=DROPOUT):
        super().__init__()
        self.emb  = nn.Embedding(vocab_size, d, padding_idx=0)
        self.pe   = SinusoidalPE(d, drop=drop)
        self.layers = nn.ModuleList([TxLayer(d, h, fd, drop) for _ in range(nl)])
        self.norm = nn.LayerNorm(d)
        self._init()

    def _init(self):
        for n, p in self.named_parameters():
            if p.dim() > 1: nn.init.xavier_uniform_(p)
            elif "bias" in n: nn.init.zeros_(p)

    def forward(self, ids, mask=None):
        x = self.pe(self.emb(ids))
        for layer in self.layers:
            x = layer(x, mask)
        x = self.norm(x)
        if mask is not None:
            m = mask.unsqueeze(-1).float()
            x = (x * m).sum(1) / m.sum(1).clamp(min=1e-8)
        else:
            x = x.mean(1)
        return F.normalize(x, p=2, dim=-1)

    @property
    def n_params(self):
        return sum(p.numel() for p in self.parameters() if p.requires_grad)

# ══════════════════════════════════════════════════════════════════════════════
# PART 4 — NEURAL SCORER (5-head, from scratch)
# ══════════════════════════════════════════════════════════════════════════════

INPUT_DIM = EMB_DIM * 4 + 10  # 1034

class JobSyncScorer(nn.Module):
    """5-head scorer: [r_emb ‖ j_emb ‖ |r-j| ‖ r*j ‖ features] → 5 scores."""
    def __init__(self, inp=INPUT_DIM):
        super().__init__()
        self.trunk = nn.Sequential(
            nn.Linear(inp, 512), nn.LayerNorm(512), nn.GELU(), nn.Dropout(0.25),
            nn.Linear(512, 256), nn.LayerNorm(256), nn.GELU(), nn.Dropout(0.2),
        )
        self.heads = nn.ModuleList([
            nn.Sequential(nn.Linear(256,128), nn.GELU(), nn.Dropout(0.1),
                          nn.Linear(128,64),  nn.GELU(), nn.Linear(64,1), nn.Sigmoid())
            for _ in range(5)
        ])
        for n, p in self.named_parameters():
            if p.dim() > 1: nn.init.xavier_uniform_(p)

    def forward(self, x):
        s = self.trunk(x)
        return torch.cat([h(s) * 100.0 for h in self.heads], dim=1)

# ══════════════════════════════════════════════════════════════════════════════
# PART 5 — DATASET
# ══════════════════════════════════════════════════════════════════════════════

DIMS = ["ats_score","technical_fit_score","semantic_match_score",
        "recruiter_impression_score","project_relevance_score"]

def load_records():
    if not DATA_PATH.exists():
        raise FileNotFoundError(f"Training data not found: {DATA_PATH}")
    records = []
    with open(DATA_PATH) as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    r = json.loads(line)
                    if "resume" in r and "jd" in r:
                        records.append(r)
                except: pass
    print(f"Loaded {len(records)} training pairs")
    return records

def build_features(r_emb, j_emb, resume_text, jd_text):
    """10 handcrafted features."""
    r, j = r_emb, j_emb
    cosine = float((r * j).sum())
    SKILLS = {"python","java","javascript","typescript","react","node","sql","aws",
               "docker","kubernetes","tensorflow","pytorch","git","fastapi","django"}
    res_w = set(resume_text.lower().split())
    jd_w  = set(jd_text.lower().split())
    res_s = res_w & SKILLS; jd_s = jd_w & SKILLS
    ov = len(res_s & jd_s) / max(len(jd_s), 1) if jd_s else 0.5
    kd = len({w for w in jd_w if len(w)>4} & res_w) / max(len({w for w in jd_w if len(w)>4}), 1)
    rl = min(len(resume_text)/3000, 1.0)
    jl = min(len(jd_text)/2000, 1.0)
    he = float(any(k in resume_text.lower() for k in ["year","years","yr"]))
    edu = float(any(k in resume_text.lower() for k in ["bachelor","master","phd","degree"]))
    ldr = float(any(k in resume_text.lower() for k in ["led","managed","director","head"]))
    met = float(bool(re.search(r'\b\d+[%x]\b|\$\d+', resume_text)))
    first = resume_text.strip().split('\n')[0].lower() if resume_text.strip() else ""
    fw = [w for w in first.split() if len(w)>3]
    ta = sum(1 for w in fw if w in jd_text.lower()) / max(len(fw),1)
    return [cosine, ov, kd, rl, jl, he, edu, ldr, met, ta]

class ScorerDataset(torch.utils.data.Dataset):
    def __init__(self, records, encoder, tokenizer):
        self.X, self.y = [], []
        encoder.eval()
        bs = 128
        for i in range(0, len(records), bs):
            batch = records[i:i+bs]
            r_ids = torch.tensor([tokenizer.encode(r["resume"]) for r in batch], dtype=torch.long).to(device)
            j_ids = torch.tensor([tokenizer.encode(r["jd"])     for r in batch], dtype=torch.long).to(device)
            r_msk = torch.tensor([tokenizer.mask(ids.tolist()) for ids in r_ids], dtype=torch.long).to(device)
            j_msk = torch.tensor([tokenizer.mask(ids.tolist()) for ids in j_ids], dtype=torch.long).to(device)
            with torch.no_grad():
                re_ = encoder(r_ids, r_msk).cpu()
                je_ = encoder(j_ids, j_msk).cpu()
            for k, rec in enumerate(batch):
                r_emb = re_[k]; j_emb = je_[k]
                diff = (r_emb - j_emb).abs()
                prod = r_emb * j_emb
                hc   = torch.tensor(build_features(r_emb.numpy(), j_emb.numpy(), rec["resume"], rec["jd"]), dtype=torch.float32)
                x = torch.cat([r_emb, j_emb, diff, prod, hc])
                y = torch.tensor([float(rec.get(d, 50.0)) for d in DIMS], dtype=torch.float32)
                self.X.append(x); self.y.append(y)
        print(f"  Scorer dataset: {len(self.X)} samples, input_dim={self.X[0].shape[0]}")

    def __len__(self): return len(self.X)
    def __getitem__(self, i): return self.X[i], self.y[i]

class EncoderDataset(torch.utils.data.Dataset):
    def __init__(self, records, tokenizer):
        self.r_ids, self.r_mask = [], []
        self.j_ids, self.j_mask = [], []
        self.sim = []
        for r in records:
            ri = tokenizer.encode(r["resume"]); ji = tokenizer.encode(r["jd"])
            self.r_ids.append(ri); self.r_mask.append(tokenizer.mask(ri))
            self.j_ids.append(ji); self.j_mask.append(tokenizer.mask(ji))
            ats  = r.get("ats_score", 50); tech = r.get("technical_fit_score", 50)
            sem  = r.get("semantic_match_score", 50)
            ov   = (ats*0.2 + tech*0.3 + sem*0.3 + r.get("recruiter_impression_score",50)*0.1 + r.get("project_relevance_score",50)*0.1)
            self.sim.append(max(-0.9, min(0.95, (ov - 50.0) / 55.0)))
        self.r_ids = torch.tensor(self.r_ids, dtype=torch.long)
        self.r_mask= torch.tensor(self.r_mask,dtype=torch.long)
        self.j_ids = torch.tensor(self.j_ids, dtype=torch.long)
        self.j_mask= torch.tensor(self.j_mask,dtype=torch.long)
        self.sim   = torch.tensor(self.sim,   dtype=torch.float32)
    def __len__(self): return len(self.sim)
    def __getitem__(self,i): return self.r_ids[i],self.r_mask[i],self.j_ids[i],self.j_mask[i],self.sim[i]

# ══════════════════════════════════════════════════════════════════════════════
# PART 6 — LOSS FUNCTIONS
# ══════════════════════════════════════════════════════════════════════════════

def infonce(r, j, temp=ENCODER_TEMP):
    """InfoNCE with large-batch in-batch negatives."""
    sim = (r @ j.T) / temp
    labels = torch.arange(sim.size(0), device=sim.device)
    return (F.cross_entropy(sim, labels) + F.cross_entropy(sim.T, labels)) / 2

def regression_loss(r, j, exp_sim):
    return F.mse_loss((r * j).sum(-1), exp_sim)

def ranking_loss(preds, targets, margin=5.0):
    op = preds.mean(1); ot = targets.mean(1)
    n  = op.shape[0]
    if n < 2: return torch.tensor(0.0)
    loss = torch.tensor(0.0, device=preds.device)
    for i in range(n):
        for j in range(i+1, n):
            if ot[i] > ot[j] + margin:
                loss = loss + F.relu(op[j] - op[i] + 1.0)
            elif ot[j] > ot[i] + margin:
                loss = loss + F.relu(op[i] - op[j] + 1.0)
    return loss / (n*(n-1)/2 + 1e-8)

# ══════════════════════════════════════════════════════════════════════════════
# PART 7 — TRAINING
# ══════════════════════════════════════════════════════════════════════════════

def train_encoder(records, tokenizer):
    print(f"\n▶ Training custom encoder ({ENCODER_EPOCHS} epochs, batch={ENCODER_BATCH})")
    from torch.utils.data import DataLoader, random_split
    ds  = EncoderDataset(records, tokenizer)
    nv  = max(64, int(len(ds)*0.1)); nt = len(ds)-nv
    tds, vds = random_split(ds, [nt, nv])
    tl = DataLoader(tds, ENCODER_BATCH, shuffle=True,  num_workers=0, drop_last=True)
    vl = DataLoader(vds, ENCODER_BATCH, shuffle=False, num_workers=0)

    model = JobSyncEncoder(tokenizer.vocab_size).to(device)
    print(f"  Parameters: {model.n_params:,}")
    opt   = torch.optim.AdamW(model.parameters(), lr=ENCODER_LR, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, ENCODER_EPOCHS, eta_min=1e-6)

    best_loss, best_state, patience = float("inf"), None, 0
    t0 = time.monotonic()

    for epoch in range(1, ENCODER_EPOCHS+1):
        model.train(); tl_ = 0
        for ri,rm,ji,jm,sim in tl:
            ri,rm,ji,jm,sim = ri.to(device),rm.to(device),ji.to(device),jm.to(device),sim.to(device)
            r = model(ri,rm); j = model(ji,jm)
            loss = infonce(r,j) + 0.3*regression_loss(r,j,sim)
            opt.zero_grad(); loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); tl_ += loss.item()
        sched.step()
        model.eval(); vl_ = 0; ps = 0
        with torch.no_grad():
            for ri,rm,ji,jm,sim in vl:
                ri,rm,ji,jm,sim = ri.to(device),rm.to(device),ji.to(device),jm.to(device),sim.to(device)
                r = model(ri,rm); j = model(ji,jm)
                vl_ += (infonce(r,j) + 0.3*regression_loss(r,j,sim)).item()
                ps  += (r*j).sum(-1).mean().item()
        vl_ /= max(len(vl),1); ps /= max(len(vl),1)
        if epoch % 10 == 0 or epoch == 1:
            print(f"  Epoch {epoch:3d}/{ENCODER_EPOCHS}  train={tl_/len(tl):.4f}  val={vl_:.4f}  pos_sim={ps:.4f}")
        if vl_ < best_loss - 1e-4:
            best_loss = vl_; best_state = {k:v.cpu().clone() for k,v in model.state_dict().items()}; patience = 0
        else:
            patience += 1
            if patience >= 12: print(f"  Early stop at epoch {epoch}"); break

    model.load_state_dict(best_state)
    torch.save(best_state, MODELS_DIR / "encoder.pt")
    tokenizer.save(MODELS_DIR / "tokenizer.json")
    elapsed = time.monotonic()-t0
    print(f"✓ Encoder done: val_loss={best_loss:.4f}  pos_sim={ps:.4f}  time={elapsed:.0f}s")
    return model, {"val_loss": round(best_loss,6), "pos_cosine_sim": round(ps,4), "epochs": epoch}

def train_scorer(records, encoder, tokenizer):
    print(f"\n▶ Training neural scorer ({SCORER_EPOCHS} epochs, batch={SCORER_BATCH})")
    from torch.utils.data import DataLoader, random_split
    print("  Building scorer dataset (embedding all texts)...")
    ds  = ScorerDataset(records, encoder, tokenizer)
    nv  = max(32, int(len(ds)*0.1)); nt = len(ds)-nv
    tds, vds = random_split(ds, [nt, nv])
    tl = DataLoader(tds, SCORER_BATCH, shuffle=True,  num_workers=0)
    vl = DataLoader(vds, SCORER_BATCH, shuffle=False, num_workers=0)

    model = JobSyncScorer(inp=ds.X[0].shape[0]).to(device)
    print(f"  Parameters: {sum(p.numel() for p in model.parameters()):,}")
    opt   = torch.optim.AdamW(model.parameters(), lr=SCORER_LR, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, SCORER_EPOCHS, eta_min=1e-6)

    best_mse, best_state, patience = float("inf"), None, 0
    t0 = time.monotonic()

    for epoch in range(1, SCORER_EPOCHS+1):
        model.train(); tl_ = 0
        for X, y in tl:
            X,y = X.to(device), y.to(device)
            p = model(X)
            loss = F.mse_loss(p,y) + 0.2*ranking_loss(p,y)
            opt.zero_grad(); loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            opt.step(); tl_ += F.mse_loss(p,y).item()
        sched.step()
        model.eval(); vm_ = 0; va_ = 0
        with torch.no_grad():
            for X,y in vl:
                X,y = X.to(device),y.to(device)
                p = model(X)
                vm_ += F.mse_loss(p,y).item(); va_ += F.l1_loss(p,y).item()
        vm_ /= max(len(vl),1); va_ /= max(len(vl),1)
        if epoch % 20 == 0 or epoch == 1:
            print(f"  Epoch {epoch:3d}/{SCORER_EPOCHS}  train_mse={tl_/len(tl):.2f}  val_mse={vm_:.2f}  val_mae={va_:.2f}")
        if vm_ < best_mse - 0.01:
            best_mse = vm_; best_state = {k:v.cpu().clone() for k,v in model.state_dict().items()}; patience = 0
        else:
            patience += 1
            if patience >= 18: print(f"  Early stop at epoch {epoch}"); break

    model.load_state_dict(best_state)
    torch.save(best_state, MODELS_DIR / "scorer.pt")
    elapsed = time.monotonic()-t0
    print(f"✓ Scorer done: val_mse={best_mse:.2f}  val_mae={va_:.2f}  time={elapsed:.0f}s")
    return model, {"val_mse": round(best_mse,2), "val_mae": round(va_,2), "epochs": epoch}

# ══════════════════════════════════════════════════════════════════════════════
# PART 8 — GITHUB RELEASE UPLOAD
# ══════════════════════════════════════════════════════════════════════════════

def upload_to_github(token: str, enc_result: dict, scr_result: dict):
    """Zip trained model files and upload to GitHub Release."""
    import urllib.request, urllib.error

    zip_path = MODELS_DIR / "jobsync_ai_model.zip"
    print(f"\n▶ Packaging model → {zip_path}")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for fname in ["encoder.pt", "scorer.pt", "tokenizer.json"]:
            fp = MODELS_DIR / fname
            if fp.exists():
                zf.write(fp, fname)
                print(f"  + {fname} ({fp.stat().st_size/1024:.0f} KB)")

    meta = {
        "trained_at": datetime.utcnow().isoformat(),
        "encoder": enc_result,
        "scorer": scr_result,
        "architecture": f"DualEncoder({N_LAYERS}L×{N_HEADS}H×{EMB_DIM}d) + Scorer(5heads)",
        "device": str(device),
    }
    (MODELS_DIR / "model_meta.json").write_text(json.dumps(meta, indent=2))
    with zipfile.ZipFile(zip_path, "a") as zf:
        zf.write(MODELS_DIR / "model_meta.json", "model_meta.json")

    zip_size = zip_path.stat().st_size / 1024 / 1024
    print(f"  Package size: {zip_size:.1f} MB")

    headers = {
        "Authorization": f"token {token}",
        "Accept": "application/vnd.github.v3+json",
        "Content-Type": "application/json",
        "User-Agent": "JobSync-AI-Trainer",
    }

    # Delete existing release if any
    url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/tags/{RELEASE_TAG}"
    try:
        req = urllib.request.Request(url, headers=headers)
        resp = urllib.request.urlopen(req)
        existing = json.loads(resp.read())
        del_url = f"https://api.github.com/repos/{GITHUB_REPO}/releases/{existing['id']}"
        req = urllib.request.Request(del_url, method="DELETE", headers=headers)
        urllib.request.urlopen(req)
        print("  Deleted old release")
    except: pass

    # Create new release
    body_data = json.dumps({
        "tag_name": RELEASE_TAG,
        "name": f"JobSync AI Model — {datetime.utcnow().strftime('%Y-%m-%d')}",
        "body": json.dumps(meta, indent=2),
        "prerelease": False,
    }).encode()
    req = urllib.request.Request(
        f"https://api.github.com/repos/{GITHUB_REPO}/releases",
        data=body_data, headers=headers, method="POST"
    )
    release = json.loads(urllib.request.urlopen(req).read())
    release_id = release["id"]
    print(f"  Created release: {release['html_url']}")

    # Upload zip asset
    upload_url = f"https://uploads.github.com/repos/{GITHUB_REPO}/releases/{release_id}/assets?name=jobsync_ai_model.zip"
    upload_headers = {**headers, "Content-Type": "application/zip"}
    with open(zip_path, "rb") as f:
        req = urllib.request.Request(upload_url, data=f.read(), headers=upload_headers, method="POST")
        asset = json.loads(urllib.request.urlopen(req).read())
    print(f"✓ Model uploaded: {asset['browser_download_url']}")
    return asset["browser_download_url"]

# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--github-token", default=os.environ.get("GITHUB_TOKEN",""))
    parser.add_argument("--encoder-epochs", type=int, default=ENCODER_EPOCHS)
    parser.add_argument("--scorer-epochs",  type=int, default=SCORER_EPOCHS)
    parser.add_argument("--skip-upload", action="store_true")
    args = parser.parse_args()

    t_total = time.monotonic()

    # Load data
    records = load_records()
    print(f"Training on {len(records)} pairs")
    print(f"  High match: {sum(1 for r in records if r.get('match_level')=='high')}")
    print(f"  Medium:     {sum(1 for r in records if r.get('match_level')=='medium')}")
    print(f"  Low:        {sum(1 for r in records if r.get('match_level')=='low')}")

    # Build tokenizer from all texts
    all_texts = [r["resume"] for r in records] + [r["jd"] for r in records]
    tokenizer = Tokenizer.build(all_texts)
    print(f"\nTokenizer vocab: {tokenizer.vocab_size} tokens")

    # Train encoder
    encoder, enc_result = train_encoder(records, tokenizer)

    # Train scorer (uses trained encoder embeddings)
    _, scr_result = train_scorer(records, encoder, tokenizer)

    total = time.monotonic() - t_total
    print(f"\n{'='*60}")
    print(f"Total training time: {total/60:.1f} min")
    print(f"Encoder val_loss:    {enc_result['val_loss']}")
    print(f"Encoder pos_sim:     {enc_result['pos_cosine_sim']}")
    print(f"Scorer  val_mse:     {scr_result['val_mse']}")
    print(f"Scorer  val_mae:     {scr_result['val_mae']}")
    print(f"{'='*60}")

    # Upload to GitHub
    if not args.skip_upload:
        if args.github_token:
            try:
                url = upload_to_github(args.github_token, enc_result, scr_result)
                print(f"\n✅ Model live at: {url}")
            except Exception as e:
                print(f"⚠ Upload failed: {e}")
                print("  Model saved locally in backend/models/")
        else:
            print("\n⚠ No GitHub token — model saved locally only.")
            print("  Set GITHUB_TOKEN env var to auto-upload.")
    else:
        print("\nModels saved locally (--skip-upload):")
        print(f"  {MODELS_DIR}/encoder.pt")
        print(f"  {MODELS_DIR}/scorer.pt")
        print(f"  {MODELS_DIR}/tokenizer.json")

if __name__ == "__main__":
    main()
