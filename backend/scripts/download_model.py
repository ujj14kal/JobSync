"""
Download the latest trained model from Kaggle output or GitHub Release.
Run this if auto_train.py timed out waiting, or to manually sync the model.

Usage:
  python scripts/download_model.py           # from GitHub Release
  python scripts/download_model.py --kaggle  # from Kaggle output
"""
import os, sys, shutil, argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent))

def _load_env():
    for ep in [ROOT.parent/".env", ROOT/".env"]:
        if ep.exists():
            for line in ep.read_text().splitlines():
                line=line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k,v=line.split("=",1); os.environ.setdefault(k.strip(),v.strip())
_load_env()

MODELS_DIR   = ROOT / "models"
KAGGLE_USER  = os.environ.get("KAGGLE_USERNAME","")
KERNEL_SLUG  = "jobsync-ai-trainer"

def from_github():
    print("Downloading from GitHub Release...")
    from app.services.model_loader import ensure_model_downloaded, load_models_into_memory
    ok = ensure_model_downloaded(force=True)
    if ok:
        loaded = load_models_into_memory()
        print("✓ Model downloaded and loaded" if loaded else "✓ Model downloaded (will load on next restart)")
    else:
        print("❌ Download failed — no model in GitHub Release yet")
        print("  Run: python scripts/auto_train.py")

def from_kaggle():
    print(f"Downloading from Kaggle output ({KAGGLE_USER}/{KERNEL_SLUG})...")
    try:
        from kaggle.api.kaggle_api_extended import KaggleApiExtended
        api = KaggleApiExtended(); api.authenticate()
        dl_dir = ROOT/"data"/"_kaggle_output"; dl_dir.mkdir(exist_ok=True)
        api.kernels_output(f"{KAGGLE_USER}/{KERNEL_SLUG}", path=str(dl_dir), quiet=False)
        import zipfile
        for zp in dl_dir.glob("*.zip"):
            with zipfile.ZipFile(zp) as zf: zf.extractall(MODELS_DIR)
        for f in ["encoder.pt","scorer.pt","tokenizer.json","model_meta.json"]:
            src=dl_dir/f
            if src.exists(): shutil.copy(src, MODELS_DIR/f)
        shutil.rmtree(dl_dir)
        present = [f for f in ["encoder.pt","scorer.pt","tokenizer.json"] if (MODELS_DIR/f).exists()]
        print(f"✓ Downloaded: {present}")
    except Exception as e:
        print(f"❌ Failed: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--kaggle", action="store_true")
    args = parser.parse_args()
    os.chdir(ROOT)
    from_kaggle() if args.kaggle else from_github()
