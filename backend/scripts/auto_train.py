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
    from kaggle import api; api.authenticate()

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

    # Copy training script as-is — GitHub upload is done locally after download
    shutil.copy(NOTEBOOKS_DIR / "kaggle_train.py", kernel_dir / "kaggle_train.py")

    # Write kernel metadata
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
    }
    (kernel_dir / "kernel-metadata.json").write_text(json.dumps(meta, indent=2))

    from kaggle import api; api.authenticate()
    response = api.kernels_push(str(kernel_dir))
    print(f"✓ Kernel pushed: kaggle.com/{KAGGLE_USER}/{KERNEL_SLUG}")
    if hasattr(response, 'error') and response.error:
        raise RuntimeError(f"Kernel push error: {response.error}")

    shutil.rmtree(kernel_dir)

# ─── Step 4: Wait for training to complete ────────────────────────────────────

def wait_for_training(timeout_min=60):
    print(f"\n▶ Step 4/5 — Waiting for Kaggle GPU training to complete...")
    print(f"  Monitor live: https://www.kaggle.com/{KAGGLE_USER}/{KERNEL_SLUG}")

    from kaggle import api; api.authenticate()

    deadline = time.monotonic() + timeout_min * 60
    last_status = None
    dots = 0

    while time.monotonic() < deadline:
        try:
            status_obj = api.kernels_status(f"{KAGGLE_USER}/{KERNEL_SLUG}")
            # status_obj is a proto-like object
            if hasattr(status_obj, 'status'):
                status = str(status_obj.status).lower().replace("run_status_", "")
            elif isinstance(status_obj, dict):
                status = status_obj.get("status", "unknown")
            else:
                status = str(status_obj).lower()

            if status != last_status:
                print(f"\n  Status: {status}", end="", flush=True)
                last_status = status

            # Match both old and new Kaggle status formats
            # New format: "kernelworkerstatus.complete" or "RUN_STATUS_COMPLETE"
            s_lower = status.lower()
            if "complete" in s_lower:
                print("\n✓ Training complete!")
                return True
            elif any(x in s_lower for x in ("error", "cancel", "fail")):
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

    from kaggle import api; api.authenticate()

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

# ─── Step 6: Upload model to GitHub Release ────────────────────────────────────

def upload_to_github():
    """Package models and upload to GitHub Release (runs locally — token never leaves this machine)."""
    import urllib.request, zipfile as zf
    from datetime import datetime

    if not GITHUB_TOKEN:
        print("⚠ No GITHUB_TOKEN — skipping GitHub upload")
        return None

    print(f"\n▶ Step 6/6 — Uploading model to GitHub Release...")
    GITHUB_REPO = "ujj14kal/JobSync"
    RELEASE_TAG = "ai-model-latest"

    # Package model files
    zip_path = MODELS_DIR / "jobsync_ai_model.zip"
    print(f"  Packaging model files...")
    with zf.ZipFile(zip_path, "w", zf.ZIP_DEFLATED) as z:
        for fn in ["encoder.pt", "scorer.pt", "tokenizer.json", "model_meta.json"]:
            fp = MODELS_DIR / fn
            if fp.exists():
                z.write(fp, fn)
                print(f"    + {fn} ({fp.stat().st_size // 1024} KB)")

    size_mb = zip_path.stat().st_size / 1024 / 1024
    print(f"  Package size: {size_mb:.1f} MB")

    hdrs = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "JobSync-AutoTrainer",
    }

    # Delete old release if exists
    try:
        req = urllib.request.Request(
            f"https://api.github.com/repos/{GITHUB_REPO}/releases/tags/{RELEASE_TAG}",
            headers=hdrs
        )
        rel = json.loads(urllib.request.urlopen(req).read())
        urllib.request.urlopen(urllib.request.Request(
            f"https://api.github.com/repos/{GITHUB_REPO}/releases/{rel['id']}",
            headers=hdrs, method="DELETE"
        ))
        print("  ✓ Deleted old release")
    except Exception:
        pass  # No existing release, that's fine

    # Create new release
    meta_path = MODELS_DIR / "model_meta.json"
    meta_body = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    release_body = json.dumps({
        "tag_name": RELEASE_TAG,
        "name": f"JobSync AI — {datetime.utcnow().strftime('%Y-%m-%d')}",
        "body": json.dumps(meta_body, indent=2),
        "prerelease": False,
    }).encode()
    rel = json.loads(urllib.request.urlopen(urllib.request.Request(
        f"https://api.github.com/repos/{GITHUB_REPO}/releases",
        data=release_body,
        headers={**hdrs, "Content-Type": "application/json"},
        method="POST",
    )).read())
    rid = rel["id"]
    print(f"  ✓ Created release: {rel['html_url']}")

    # Upload zip asset
    print(f"  Uploading {size_mb:.1f} MB zip...")
    with open(zip_path, "rb") as f:
        asset = json.loads(urllib.request.urlopen(urllib.request.Request(
            f"https://uploads.github.com/repos/{GITHUB_REPO}/releases/{rid}/assets?name=jobsync_ai_model.zip",
            data=f.read(),
            headers={**hdrs, "Content-Type": "application/zip"},
            method="POST",
        )).read())
    print(f"✅ Model live at: {asset['browser_download_url']}")
    zip_path.unlink()  # clean up local zip
    return asset["browser_download_url"]

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
            gh_url = upload_to_github()
            total = time.monotonic() - t0
            print(f"\n{'='*60}")
            print(f"✅ Full pipeline complete in {total/60:.1f} min")
            if gh_url:
                print(f"   Model published: {gh_url}")
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
