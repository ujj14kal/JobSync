"""
JobSync AI Trainer — Kaggle kernel version.
Runs automatically on Kaggle free GPU (P100/T4).
Saves output to /kaggle/working/ which gets downloaded after.
"""
import os, sys, json, math, re, time, random, zipfile
from pathlib import Path
from collections import Counter
from datetime import datetime

# Kaggle paths
INPUT_DIR  = Path("/kaggle/input/jobsync-training-data")
OUTPUT_DIR = Path("/kaggle/working")
DATA_PATH  = INPUT_DIR / "training_pairs.jsonl"

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO  = "ujj14kal/JobSync"
RELEASE_TAG  = "ai-model-latest"

print("=" * 60)
print("JobSync Custom AI Trainer — Kaggle")
print("=" * 60)

import torch
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
print(f"Device: {device}")
if torch.cuda.is_available():
    print(f"GPU: {torch.cuda.get_device_name(0)}")

# GPU-optimised hyperparameters
ENCODER_EPOCHS = 60;  ENCODER_BATCH = 256; ENCODER_LR = 3e-4; ENCODER_TEMP = 0.05
SCORER_EPOCHS  = 150; SCORER_BATCH  = 128; SCORER_LR  = 2e-4
EMB_DIM=256; N_HEADS=8; N_LAYERS=3; FFN_DIM=512; MAX_LEN=256; DROPOUT=0.15

# ── Domain vocabulary (copy from domain_vocab.py) ─────────────────────────────
ALL_DOMAIN_WORDS = [
    "python","java","javascript","typescript","golang","go","rust","scala","kotlin",
    "swift","c","cpp","csharp","ruby","php","r","matlab","bash","shell","sql","html","css",
    "react","reactjs","nextjs","vuejs","angular","svelte","redux","graphql","webpack","vite",
    "tailwind","jest","playwright","fastapi","django","flask","express","nestjs","spring",
    "grpc","rest","websocket","microservices","celery","kafka","rabbitmq","redis",
    "elasticsearch","nginx","tensorflow","pytorch","keras","scikit","sklearn","xgboost",
    "pandas","numpy","scipy","spark","airflow","dbt","mlflow","wandb","cuda","llm",
    "embedding","rag","bert","gpt","nlp","regression","classification","neural","deep",
    "aws","gcp","azure","docker","kubernetes","terraform","ansible","jenkins","github",
    "gitlab","helm","prometheus","grafana","datadog","lambda","ec2","s3","rds","bigquery",
    "postgresql","postgres","mysql","sqlite","mongodb","cassandra","snowflake","databricks",
    "clickhouse","pinecone","pgvector","firebase","neo4j","supabase",
    "swift","kotlin","react-native","flutter","android","ios","xcode",
    "software","engineer","developer","architect","lead","senior","junior","staff",
    "principal","manager","director","vp","head","tech","fullstack","frontend","backend",
    "platform","infrastructure","ml","data","product","mobile","security","devops","sre",
    "built","developed","designed","implemented","led","managed","scaled","optimized",
    "reduced","increased","shipped","launched","deployed","migrated","refactored",
    "experience","education","skills","projects","summary","certifications","work",
    "contact","email","phone","linkedin","university","degree","bachelor","master","phd",
    "million","billion","thousand","percent","users","customers","revenue","latency",
    "and","the","with","using","for","in","on","at","to","of","a","an","is","are","was",
    "our","we","project","system","service","platform","application","api","performance",
]

# ── Tokenizer ─────────────────────────────────────────────────────────────────
PAD_ID,UNK_ID,CLS_ID,SEP_ID = 0,1,2,3

def _split(t):
    s = re.sub(r"([a-z])([A-Z])",r"\1 \2",t)
    return [p.lower() for p in re.split(r"[_\-/\.\s]+",s) if p]

def tokenize(text):
    text = re.sub(r"[^\w\s\-/\.]"," ",text.lower())
    tokens=[]
    for raw in re.sub(r"\s+"," ",text).strip().split():
        for p in _split(raw):
            if p and (p.isalpha() or p.isnumeric()): tokens.append(p)
    return tokens

class Tokenizer:
    def __init__(self,t2i): self.t2i=t2i; self.vocab_size=len(t2i)
    @classmethod
    def build(cls,texts=None):
        t2i={"[PAD]":0,"[UNK]":1,"[CLS]":2,"[SEP]":3}
        for w in ALL_DOMAIN_WORDS:
            if w not in t2i: t2i[w]=len(t2i)
        if texts:
            c=Counter()
            for t in texts: c.update(tokenize(t))
            for tok,f in c.most_common(8000):
                if tok not in t2i and f>=2 and len(tok)>=2: t2i[tok]=len(t2i)
        return cls(t2i)
    def encode(self,text,ml=MAX_LEN):
        ids=[self.t2i.get(t,UNK_ID) for t in tokenize(text)]
        ids=[CLS_ID]+ids[:ml-2]+[SEP_ID]+[PAD_ID]*(ml-min(len(ids),ml-2)-2)
        return ids[:ml]
    def mask(self,ids): return [0 if i==PAD_ID else 1 for i in ids]
    def save(self,p): json.dump(self.t2i,open(p,"w"))

# ── Encoder ───────────────────────────────────────────────────────────────────
import torch.nn as nn, torch.nn.functional as F

class PE(nn.Module):
    def __init__(self,d,ml=MAX_LEN,drop=DROPOUT):
        super().__init__(); self.drop=nn.Dropout(drop)
        pe=torch.zeros(ml,d); pos=torch.arange(ml).unsqueeze(1).float()
        div=torch.exp(torch.arange(0,d,2).float()*(-math.log(10000.)/d))
        pe[:,0::2]=torch.sin(pos*div); pe[:,1::2]=torch.cos(pos*div)
        self.register_buffer("pe",pe.unsqueeze(0))
    def forward(self,x): return self.drop(x+self.pe[:,:x.size(1)])

class MHSA(nn.Module):
    def __init__(self,d,h,drop=DROPOUT):
        super().__init__(); self.h=h; self.hd=d//h
        self.qkv=nn.Linear(d,3*d,bias=False); self.out=nn.Linear(d,d)
        self.drop=nn.Dropout(drop); self.scale=math.sqrt(self.hd)
    def forward(self,x,mask=None):
        B,T,D=x.shape; q,k,v=self.qkv(x).chunk(3,dim=-1)
        def sp(t): return t.view(B,T,self.h,self.hd).transpose(1,2)
        q,k,v=sp(q),sp(k),sp(v); a=(q@k.transpose(-2,-1))/self.scale
        if mask is not None: a=a.masked_fill(mask.unsqueeze(1).unsqueeze(2)==0,float("-inf"))
        a=self.drop(F.softmax(a,dim=-1))
        return self.out((a@v).transpose(1,2).reshape(B,T,D))

class FFN(nn.Module):
    def __init__(self,d,fd,drop=DROPOUT):
        super().__init__()
        self.net=nn.Sequential(nn.Linear(d,fd),nn.GELU(),nn.Dropout(drop),nn.Linear(fd,d),nn.Dropout(drop))
    def forward(self,x): return self.net(x)

class TxL(nn.Module):
    def __init__(self,d,h,fd,drop=DROPOUT):
        super().__init__(); self.n1=nn.LayerNorm(d); self.n2=nn.LayerNorm(d)
        self.a=MHSA(d,h,drop); self.f=FFN(d,fd,drop)
    def forward(self,x,mask=None):
        x=x+self.a(self.n1(x),mask); x=x+self.f(self.n2(x)); return x

class Encoder(nn.Module):
    def __init__(self,vs,d=EMB_DIM,h=N_HEADS,nl=N_LAYERS,fd=FFN_DIM,drop=DROPOUT):
        super().__init__(); self.emb=nn.Embedding(vs,d,padding_idx=0)
        self.pe=PE(d,drop=drop); self.layers=nn.ModuleList([TxL(d,h,fd,drop) for _ in range(nl)])
        self.norm=nn.LayerNorm(d)
        for n,p in self.named_parameters():
            if p.dim()>1: nn.init.xavier_uniform_(p)
            elif "bias" in n: nn.init.zeros_(p)
    @property
    def n_params(self): return sum(p.numel() for p in self.parameters() if p.requires_grad)
    def forward(self,ids,mask=None):
        x=self.pe(self.emb(ids))
        for l in self.layers: x=l(x,mask)
        x=self.norm(x)
        if mask is not None:
            m=mask.unsqueeze(-1).float(); x=(x*m).sum(1)/m.sum(1).clamp(min=1e-8)
        else: x=x.mean(1)
        return F.normalize(x,p=2,dim=-1)

# ── Scorer ────────────────────────────────────────────────────────────────────
class Scorer(nn.Module):
    def __init__(self,inp):
        super().__init__()
        self.trunk=nn.Sequential(nn.Linear(inp,512),nn.LayerNorm(512),nn.GELU(),nn.Dropout(0.25),
                                  nn.Linear(512,256),nn.LayerNorm(256),nn.GELU(),nn.Dropout(0.2))
        self.heads=nn.ModuleList([nn.Sequential(nn.Linear(256,128),nn.GELU(),nn.Dropout(0.1),
                                                 nn.Linear(128,64),nn.GELU(),nn.Linear(64,1),nn.Sigmoid())
                                  for _ in range(5)])
        for n,p in self.named_parameters():
            if p.dim()>1: nn.init.xavier_uniform_(p)
    def forward(self,x): s=self.trunk(x); return torch.cat([h(s)*100. for h in self.heads],dim=1)

# ── Data loading ──────────────────────────────────────────────────────────────
DIMS=["ats_score","technical_fit_score","semantic_match_score","recruiter_impression_score","project_relevance_score"]

def load_records():
    records=[]
    with open(DATA_PATH) as f:
        for line in f:
            line=line.strip()
            if line:
                try:
                    r=json.loads(line)
                    if "resume" in r and "jd" in r: records.append(r)
                except: pass
    print(f"Loaded {len(records)} pairs"); return records

def hc_features(r,j,rt,jt):
    cos=float((r*j).sum())
    SK={"python","java","javascript","typescript","react","sql","aws","docker","kubernetes","tensorflow","pytorch","fastapi"}
    rw=set(rt.lower().split()); jw=set(jt.lower().split())
    rs=rw&SK; js=jw&SK; ov=len(rs&js)/max(len(js),1) if js else 0.5
    kd=len({w for w in jw if len(w)>4}&rw)/max(len({w for w in jw if len(w)>4}),1)
    rl=min(len(rt)/3000,1.); jl=min(len(jt)/2000,1.)
    he=float(any(k in rt.lower() for k in ["year","years","yr"]))
    edu=float(any(k in rt.lower() for k in ["bachelor","master","phd","degree"]))
    ldr=float(any(k in rt.lower() for k in ["led","managed","director"]))
    met=float(bool(re.search(r'\b\d+[%x]\b|\$\d+',rt)))
    fw=[w for w in (rt.strip().split('\n')[0].lower() if rt.strip() else "").split() if len(w)>3]
    ta=sum(1 for w in fw if w in jt.lower())/max(len(fw),1)
    return [cos,ov,kd,rl,jl,he,edu,ldr,met,ta]

# ── Losses ────────────────────────────────────────────────────────────────────
def infonce(r,j,t=ENCODER_TEMP):
    s=(r@j.T)/t; lbl=torch.arange(s.size(0),device=s.device)
    return (F.cross_entropy(s,lbl)+F.cross_entropy(s.T,lbl))/2

def rank_loss(p,y,mg=5.):
    op=p.mean(1); ot=y.mean(1); n=op.shape[0]
    if n<2: return torch.tensor(0.,device=p.device)
    loss=torch.tensor(0.,device=p.device)
    for i in range(n):
        for j in range(i+1,n):
            if ot[i]>ot[j]+mg: loss=loss+F.relu(op[j]-op[i]+1.)
            elif ot[j]>ot[i]+mg: loss=loss+F.relu(op[i]-op[j]+1.)
    return loss/(n*(n-1)/2+1e-8)

# ── Training ──────────────────────────────────────────────────────────────────
def train_encoder(records,tok):
    print(f"\n▶ Training encoder ({ENCODER_EPOCHS} epochs, batch={ENCODER_BATCH}, temp={ENCODER_TEMP})")
    from torch.utils.data import DataLoader,TensorDataset,random_split
    r_ids=torch.tensor([tok.encode(r["resume"]) for r in records],dtype=torch.long)
    j_ids=torch.tensor([tok.encode(r["jd"])     for r in records],dtype=torch.long)
    r_msk=torch.tensor([tok.mask(ids.tolist()) for ids in r_ids],dtype=torch.long)
    j_msk=torch.tensor([tok.mask(ids.tolist()) for ids in j_ids],dtype=torch.long)
    sims=[]
    for r in records:
        ov=(r.get("ats_score",50)*0.2+r.get("technical_fit_score",50)*0.3+
            r.get("semantic_match_score",50)*0.3+r.get("recruiter_impression_score",50)*0.1+
            r.get("project_relevance_score",50)*0.1)
        sims.append(max(-0.9,min(0.95,(ov-50.)/55.)))
    sim_t=torch.tensor(sims,dtype=torch.float32)
    ds=TensorDataset(r_ids,r_msk,j_ids,j_msk,sim_t)
    nv=max(64,int(len(ds)*0.1)); nt=len(ds)-nv
    tds,vds=random_split(ds,[nt,nv])
    tl=DataLoader(tds,ENCODER_BATCH,shuffle=True,drop_last=True)
    vl=DataLoader(vds,ENCODER_BATCH,shuffle=False)
    model=Encoder(tok.vocab_size).to(device); print(f"  Params: {model.n_params:,}")
    opt=torch.optim.AdamW(model.parameters(),lr=ENCODER_LR,weight_decay=1e-4)
    sch=torch.optim.lr_scheduler.CosineAnnealingLR(opt,ENCODER_EPOCHS,eta_min=1e-6)
    best,bst,pat=float("inf"),None,0; t0=time.monotonic()
    for ep in range(1,ENCODER_EPOCHS+1):
        model.train(); tl_=0
        for ri,rm,ji,jm,sm in tl:
            ri,rm,ji,jm,sm=[x.to(device) for x in [ri,rm,ji,jm,sm]]
            r=model(ri,rm); j=model(ji,jm)
            loss=infonce(r,j)+0.3*F.mse_loss((r*j).sum(-1),sm)
            opt.zero_grad(); loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(),1.); opt.step(); tl_+=loss.item()
        sch.step()
        model.eval(); vl_=0; ps=0
        with torch.no_grad():
            for ri,rm,ji,jm,sm in vl:
                ri,rm,ji,jm,sm=[x.to(device) for x in [ri,rm,ji,jm,sm]]
                r=model(ri,rm); j=model(ji,jm)
                vl_+=(infonce(r,j)+0.3*F.mse_loss((r*j).sum(-1),sm)).item()
                ps+=(r*j).sum(-1).mean().item()
        vl_/=max(len(vl),1); ps/=max(len(vl),1)
        if ep%10==0 or ep==1: print(f"  ep {ep:3d}/{ENCODER_EPOCHS}  val={vl_:.4f}  pos_sim={ps:.4f}")
        if vl_<best-1e-4: best=vl_; bst={k:v.cpu().clone() for k,v in model.state_dict().items()}; pat=0
        else:
            pat+=1
            if pat>=12: print(f"  Early stop ep={ep}"); break
    model.load_state_dict(bst); elapsed=time.monotonic()-t0
    print(f"✓ Encoder done  val={best:.4f}  pos_sim={ps:.4f}  {elapsed:.0f}s")
    return model, {"val_loss":round(best,6),"pos_cosine_sim":round(ps,4),"epochs":ep}

def train_scorer(records,encoder,tok):
    print(f"\n▶ Training scorer ({SCORER_EPOCHS} epochs, batch={SCORER_BATCH})")
    from torch.utils.data import DataLoader,TensorDataset,random_split
    print("  Embedding all texts...")
    encoder.eval(); Xs,Ys=[],[]
    bs=256
    for i in range(0,len(records),bs):
        batch=records[i:i+bs]
        ri=torch.tensor([tok.encode(r["resume"]) for r in batch],dtype=torch.long).to(device)
        ji=torch.tensor([tok.encode(r["jd"])     for r in batch],dtype=torch.long).to(device)
        rm=torch.tensor([tok.mask(ids.tolist()) for ids in ri],dtype=torch.long).to(device)
        jm=torch.tensor([tok.mask(ids.tolist()) for ids in ji],dtype=torch.long).to(device)
        with torch.no_grad(): re_=encoder(ri,rm).cpu(); je_=encoder(ji,jm).cpu()
        for k,rec in enumerate(batch):
            r_e=re_[k]; j_e=je_[k]
            hc=torch.tensor(hc_features(r_e.numpy(),j_e.numpy(),rec["resume"],rec["jd"]),dtype=torch.float32)
            x=torch.cat([r_e,j_e,(r_e-j_e).abs(),r_e*j_e,hc])
            y=torch.tensor([float(rec.get(d,50.)) for d in DIMS],dtype=torch.float32)
            Xs.append(x); Ys.append(y)
    Xt=torch.stack(Xs); Yt=torch.stack(Ys)
    print(f"  Dataset: {len(Xt)} samples, input_dim={Xt.shape[1]}")
    ds=TensorDataset(Xt,Yt); nv=max(32,int(len(ds)*0.1)); nt=len(ds)-nv
    tds,vds=random_split(ds,[nt,nv])
    tl=DataLoader(tds,SCORER_BATCH,shuffle=True); vl=DataLoader(vds,SCORER_BATCH,shuffle=False)
    model=Scorer(Xt.shape[1]).to(device)
    opt=torch.optim.AdamW(model.parameters(),lr=SCORER_LR,weight_decay=1e-4)
    sch=torch.optim.lr_scheduler.CosineAnnealingLR(opt,SCORER_EPOCHS,eta_min=1e-6)
    best,bst,pat=float("inf"),None,0; t0=time.monotonic()
    for ep in range(1,SCORER_EPOCHS+1):
        model.train(); tl_=0
        for X,y in tl:
            X,y=X.to(device),y.to(device); p=model(X)
            loss=F.mse_loss(p,y)+0.2*rank_loss(p,y)
            opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(model.parameters(),1.); opt.step()
            tl_+=F.mse_loss(p,y).item()
        sch.step()
        model.eval(); vm_=0; va_=0
        with torch.no_grad():
            for X,y in vl:
                X,y=X.to(device),y.to(device); p=model(X)
                vm_+=F.mse_loss(p,y).item(); va_+=F.l1_loss(p,y).item()
        vm_/=max(len(vl),1); va_/=max(len(vl),1)
        if ep%25==0 or ep==1: print(f"  ep {ep:3d}/{SCORER_EPOCHS}  val_mse={vm_:.2f}  val_mae={va_:.2f}")
        if vm_<best-0.01: best=vm_; bst={k:v.cpu().clone() for k,v in model.state_dict().items()}; pat=0
        else:
            pat+=1
            if pat>=18: print(f"  Early stop ep={ep}"); break
    model.load_state_dict(bst); elapsed=time.monotonic()-t0
    print(f"✓ Scorer done  val_mse={best:.2f}  val_mae={va_:.2f}  {elapsed:.0f}s")
    return {"val_mse":round(best,2),"val_mae":round(va_,2),"epochs":ep}

def upload_to_github(enc_r,scr_r,tok):
    import urllib.request, io
    if not GITHUB_TOKEN:
        print("⚠ No GITHUB_TOKEN — skipping upload"); return None
    zp=OUTPUT_DIR/"jobsync_ai_model.zip"
    print(f"\n▶ Packaging → {zp}")
    with zipfile.ZipFile(zp,"w",zipfile.ZIP_DEFLATED) as z:
        for fn in ["encoder.pt","scorer.pt","tokenizer.json"]:
            fp=OUTPUT_DIR/fn
            if fp.exists(): z.write(fp,fn); print(f"  + {fn} ({fp.stat().st_size//1024}KB)")
    meta={"trained_at":datetime.utcnow().isoformat(),"encoder":enc_r,"scorer":scr_r,
          "device":str(device),"architecture":f"DualEncoder({N_LAYERS}L×{N_HEADS}H×{EMB_DIM}d)+Scorer5heads"}
    (OUTPUT_DIR/"model_meta.json").write_text(json.dumps(meta,indent=2))
    with zipfile.ZipFile(zp,"a") as z: z.write(OUTPUT_DIR/"model_meta.json","model_meta.json")
    print(f"  Size: {zp.stat().st_size/1024/1024:.1f} MB")
    hdrs={"Authorization":f"token {GITHUB_TOKEN}","Accept":"application/vnd.github.v3+json","User-Agent":"JobSync"}
    # Delete old release
    try:
        req=urllib.request.Request(f"https://api.github.com/repos/{GITHUB_REPO}/releases/tags/{RELEASE_TAG}",headers=hdrs)
        rel=json.loads(urllib.request.urlopen(req).read())
        urllib.request.urlopen(urllib.request.Request(f"https://api.github.com/repos/{GITHUB_REPO}/releases/{rel['id']}",headers=hdrs,method="DELETE"))
    except: pass
    # Create release
    body=json.dumps({"tag_name":RELEASE_TAG,"name":f"JobSync AI — {datetime.utcnow().strftime('%Y-%m-%d')}",
                     "body":json.dumps(meta,indent=2),"prerelease":False}).encode()
    rel=json.loads(urllib.request.urlopen(urllib.request.Request(
        f"https://api.github.com/repos/{GITHUB_REPO}/releases",data=body,headers={**hdrs,"Content-Type":"application/json"},method="POST"
    )).read()); rid=rel["id"]; print(f"  Release: {rel['html_url']}")
    # Upload zip
    with open(zp,"rb") as f:
        asset=json.loads(urllib.request.urlopen(urllib.request.Request(
            f"https://uploads.github.com/repos/{GITHUB_REPO}/releases/{rid}/assets?name=jobsync_ai_model.zip",
            data=f.read(),headers={**hdrs,"Content-Type":"application/zip"},method="POST"
        )).read())
    print(f"✅ Uploaded: {asset['browser_download_url']}"); return asset["browser_download_url"]

# ── Main ──────────────────────────────────────────────────────────────────────
t_total=time.monotonic()
records=load_records()
print(f"High={sum(1 for r in records if r.get('match_level')=='high')}  "
      f"Medium={sum(1 for r in records if r.get('match_level')=='medium')}  "
      f"Low={sum(1 for r in records if r.get('match_level')=='low')}")
all_texts=[r["resume"] for r in records]+[r["jd"] for r in records]
tok=Tokenizer.build(all_texts); print(f"Tokenizer vocab: {tok.vocab_size}")
encoder,enc_r=train_encoder(records,tok)
torch.save({k:v.cpu() for k,v in encoder.state_dict().items()},OUTPUT_DIR/"encoder.pt")
tok.save(OUTPUT_DIR/"tokenizer.json")
scr_r=train_scorer(records,encoder,tok)
# scorer is saved inside train_scorer already via OUTPUT_DIR
total=time.monotonic()-t_total
print(f"\n{'='*60}")
print(f"Total: {total/60:.1f} min  encoder_val={enc_r['val_loss']}  scorer_mse={scr_r['val_mse']}")
url=upload_to_github(enc_r,scr_r,tok)
print(f"{'='*60}")
