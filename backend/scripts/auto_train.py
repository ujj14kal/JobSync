"""
JobSync AI Auto-Trainer — fully automated, zero manual steps.

Usage:
  python scripts/auto_train.py

First time setup (once only):
  1. Create free Kaggle account → kaggle.com
  2. kaggle.com/settings → API → Create New Token → download kaggle.json
  3. Place kaggle.json at ~/.kaggle/kaggle.json
  4. Add GITHUB_TOKEN to backend/.env  (github.com/settings/tokens → repo scope)

What this does automatically:
  1. Generates 10,000 training pairs locally (0.3s, no API)
  2. Uploads data as a Kaggle dataset
  3. Pushes training kernel to Kaggle (free P100 GPU)
  4. Triggers the kernel run
  5. Polls every 30s until training completes (~12-15 min)
  6. Downloads trained model files
  7. Uploads model to GitHub Release
  8. Prints confirmation — restart backend to load new model
"""
import json, os, shutil, subprocess, sys, time
from pathlib import Path

ROOT    = Path(__file__).resolve().parent.parent
SCRIPTS = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent))

# Load .env
def _load_env():
    env_path = ROOT.parent / ".env"
    if not env_path.exists():
        env_path = ROOT / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

_load_env()

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
KAGGLE_USER  = os.environ.get("KAGGLE_USERNAME", "")

DATASET_SLUG = "jobsync-training-data"
KERNEL_SLUG  = "jobsync-ai-trainer"
DATA_PATH    = ROOT / "data" / "training_pairs.jsonl"
MODELS_DIR   = ROOT / "models"
NOTEBOOKS_DIR= ROOT / "notebooks"

# ─── Preflight checks ─────────────────────────────────────────────────────────

def check_setup():
    errors = []
    kaggle_json = Path.home() / ".kaggle" / "kaggle.json"
    if not kaggle_json.exists():
        errors.append(
            "Missing ~/.kaggle/kaggle.json\n"
            "  → kaggle.com/settings → API → Create New Token"
        )
    if not GITHUB_TOKEN:
        errors.append(
            "Missing GITHUB_TOKEN in .env\n"
            "  → github.com/settings/tokens → New token → check 'repo' → copy to .env"
        )
    if errors:
        print("\n❌ Setup needed (one-time only):\n")
        for e in errors:
            print(f"  • {e}\n")
        sys.exit(1)

    global KAGGLE_USER
    if not KAGGLE_USER:
        cfg = json.loads((Path.home() / ".kaggle" / "kaggle.json").read_text())
        KAGGLE_USER = cfg.get("username", "")
        os.environ["KAGGLE_USERNAME"] = KAGGLE_USER
    print(f"✓ Kaggle user: {KAGGLE_USER}")
    print(f"✓ GitHub token: {'set' if GITHUB_TOKEN else 'missing'}")

# ─── Step 1: Generate training data ───────────────────────────────────────────

def generate_data(n=10_000):
    print(f"\n▶ Step 1/5 — Generating {n} training pairs...")
    t0 = time.monotonic()
    from app.services.template_data_gen import generate_dataset, save_dataset
    records = generate_dataset(n_pairs=n)
    save_dataset(records)
    elapsed = time.monotonic() - t0
    hi  = sum(1 for r in records if r.match_level == "high")
    med = sum(1 for r in records if r.match_level == "medium")
    lo  = sum(1 for r in records if r.match_level == "low")
    mb  = DATA_PATH.stat().st_size / 1024 / 1024
    print(f"✓ {len(records)} pairs in {elapsed:.2f}s  (high={hi} med={med} low={lo})  {mb:.1f}MB")

# ─── Step 2: Upload dataset to Kaggle ─────────────────────────────────────────

def upload_dataset():
    print(f"\n▶ Step 2/5 — Uploading training data to Kaggle dataset...")
    from kaggle.api.kaggle_api_extended import KaggleApiExtended
    api = KaggleApiExtended(); api.authenticate()

    staging = ROOT / "data" / "_kaggle_staging"
    staging.mkdir(exist_ok=True)
    shutil.copy(DATA_PATH, staging / "training_pairs.jsonl")

    meta = {
        "title":    "JobSync Training Data",
        "id":       f"{KAGGLE_USER}/{DATASET_SLUG}",
        "licenses": [{"name": "CC0-1.0"}],
    }
    (staging / "dataset-metadata.json").write_text(json.dumps(meta))

    # Try update first, create if it doesn't exist
    try:
        api.dataset_create_version(str(staging), version_notes="auto-updated", quiet=True)
        print(f"✓ Dataset updated: kaggle.com/{KAGGLE_USER}/{DATASET_SLUG}")
    except Exception:
        try:
            api.dataset_create_new(str(staging), public=False, quiet=True)
            print(f"✓ Dataset created: kaggle.com/{KAGGLE_USER}/{DATASET_SLUG}")
        except Exception as e:
            print(f"⚠ Dataset upload failed: {e}")
            raise

    shutil.rmtree(staging)

# ─── Step 3: Push training kernel ─────────────────────────────────────────────

def push_kernel():
    print(f"\n▶ Step 3/5 — Pushing training kernel to Kaggle...")

    kernel_dir = ROOT / "data" / "_kaggle_kernel"
    kernel_dir.mkdir(exist_ok=True)

    # Copy training script
    shutil.copy(NOTEBOOKS_DIR / "kaggle_train.py", kernel_dir / "kaggle_train.py")

    # Write kernel metadata (inject username and GitHub token)
    meta = {
        "id":               f"{KAGGLE_USER}/{KERNEL_SLUG}",
        "title":            "JobSync AI Trainer",
        "code_file":        "kaggle_train.py",
        "language":         "python",
        "kernel_type":      "script",
        "is_private":       True,
        "enable_gpu":       True,
        "enable_internet":  True,
        "dataset_sources":  [f"{KAGGLE_USER}/{DATASET_SLUG}"],
        "competition_sources": [],
        "kernel_sources":   [],
        "environment_variables": {
            "GITHUB_TOKEN": GITHUB_TOKEN,
        },
    }
    (kernel_dir / "kernel-metadata.json").write_text(json.dumps(meta, indent=2))

    from kaggle.api.kaggle_api_extended import KaggleApiExtended
    api = KaggleApiExtended(); api.authenticate()
    api.kernels_push(str(kernel_dir))
    print(f"✓ Kernel pushed: kaggle.com/{KAGGLE_USER}/{KERNEL_SLUG}")

    shutil.rmtree(kernel_dir)

# ─── Step 4: Wait for training to complete ────────────────────────────────────

def wait_for_training(timeout_min=60):
    print(f"\n▶ Step 4/5 — Waiting for Kaggle GPU training to complete...")
    print(f"  Monitor live: https://www.kaggle.com/{KAGGLE_USER}/{KERNEL_SLUG}")

    from kaggle.api.kaggle_api_extended import KaggleApiExtended
    api = KaggleApiExtended(); api.authenticate()

    deadline = time.monotonic() + timeout_min * 60
    last_status = None
    dots = 0

    while time.monotonic() < deadline:
        try:
            status_obj = api.kernel_status(KAGGLE_USER, KERNEL_SLUG)
            # status_obj is a dict-like object
            if hasattr(status_obj, 'status'):
                status = status_obj.status
            elif isinstance(status_obj, dict):
                status = status_obj.get("status", "unknown")
            else:
                status = str(status_obj)

            if status != last_status:
                print(f"\n  Status: {status}", end="", flush=True)
                last_status = status

            if status in ("complete",):
                print("\n✓ Training complete!")
                return True
            elif status in ("error", "cancelled"):
                print(f"\n❌ Kernel {status}")
                print(f"  Logs: https://www.kaggle.com/{KAGGLE_USER}/{KERNEL_SLUG}")
                return False
            else:
                print(".", end="", flush=True)
                dots += 1
                if dots % 20 == 0:
                    print(f" [{int((time.monotonic()%3600)/60)}min]", end="", flush=True)

        except Exception as e:
            print(f"\n  (poll error: {e})", end="", flush=True)

        time.sleep(30)

    print(f"\n⚠ Timeout after {timeout_min} min")
    return False

# ─── Step 5: Download model ────────────────────────────────────────────────────

def download_model():
    print(f"\n▶ Step 5/5 — Downloading trained model from Kaggle output...")

    from kaggle.api.kaggle_api_extended import KaggleApiExtended
    api = KaggleApiExtended(); api.authenticate()

    dl_dir = ROOT / "data" / "_kaggle_output"
    dl_dir.mkdir(exist_ok=True)

    api.kernels_output(f"{KAGGLE_USER}/{KERNEL_SLUG}", path=str(dl_dir), quiet=False)

    # Find and extract the model zip
    zip_files = list(dl_dir.glob("*.zip"))
    if zip_files:
        import zipfile
        with zipfile.ZipFile(zip_files[0]) as zf:
            zf.extractall(MODELS_DIR)
        print(f"✓ Model extracted to {MODELS_DIR}")
        for f in ["encoder.pt", "scorer.pt", "tokenizer.json"]:
            fp = MODELS_DIR / f
            if fp.exists():
                print(f"  ✓ {f} ({fp.stat().st_size//1024} KB)")
    else:
        # Files might be directly in output
        for f in ["encoder.pt", "scorer.pt", "tokenizer.json", "model_meta.json"]:
            src = dl_dir / f
            if src.exists():
                shutil.copy(src, MODELS_DIR / f)
                print(f"  ✓ {f}")

    shutil.rmtree(dl_dir)

    # Verify all files present
    missing = [f for f in ["encoder.pt","scorer.pt","tokenizer.json"] if not (MODELS_DIR/f).exists()]
    if missing:
        print(f"⚠ Missing files: {missing}")
        return False
    print("✓ All model files ready")
    return True

# ─── Main ─────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("JobSync AI Auto-Trainer")
    print("=" * 60)

    # Preflight
    check_setup()

    # Install kaggle if needed
    try:
        import kaggle
    except ImportError:
        print("Installing kaggle library...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "kaggle"], check=True)
        import kaggle

    t0 = time.monotonic()

    # Run pipeline
    generate_data(n=10_000)
    upload_dataset()
    push_kernel()
    success = wait_for_training(timeout_min=60)

    if success:
        downloaded = download_model()
        if downloaded:
            total = time.monotonic() - t0
            print(f"\n{'='*60}")
            print(f"✅ Training complete in {total/60:.1f} min")
            print(f"{'='*60}")
            print("\nNext steps:")
            print("  1. Restart your backend (or redeploy to Cloud Run)")
            print("  2. The backend will auto-load the new model on startup")
            print("  3. All ATS scoring now uses your custom AI — no API calls")
            print("\nTo retrain anytime:  python scripts/auto_train.py")
        else:
            print("\n⚠ Model download incomplete — check Kaggle output manually")
    else:
        print(f"\n⚠ Training may still be running.")
        print(f"  Monitor: https://www.kaggle.com/{KAGGLE_USER}/{KERNEL_SLUG}")
        print(f"  When done, run:  python scripts/download_model.py")

if __name__ == "__main__":
    main()
