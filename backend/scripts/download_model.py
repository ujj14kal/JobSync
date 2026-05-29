"""
Download the latest trained model from Kaggle output or GitHub Release.
Run this if auto_train.py timed out waiting, or to manually sync the model.

Usage:
  python scripts/download_model.py           # from GitHub Release
  python scripts/download_model.py --kaggle  # from Kaggle output → then uploads to GitHub
"""
import json, os, sys, shutil, argparse
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

MODELS_DIR    = ROOT / "models"
KAGGLE_USER   = os.environ.get("KAGGLE_USERNAME","")
KERNEL_SLUG   = "jobsync-ai-trainer"
GITHUB_TOKEN  = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO   = "ujj14kal/JobSync"
RELEASE_TAG   = "ai-model-latest"

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

def _upload_to_github():
    """Upload locally downloaded model files to GitHub Release."""
    import urllib.request, zipfile as zf
    from datetime import datetime
    if not GITHUB_TOKEN:
        print("⚠ No GITHUB_TOKEN — skipping GitHub upload"); return
    zip_path = MODELS_DIR / "jobsync_ai_model.zip"
    print("  Packaging model files...")
    with zf.ZipFile(zip_path, "w", zf.ZIP_DEFLATED) as z:
        for fn in ["encoder.pt","scorer.pt","tokenizer.json","model_meta.json"]:
            fp = MODELS_DIR / fn
            if fp.exists(): z.write(fp, fn); print(f"    + {fn}")
    hdrs = {"Authorization": f"token {GITHUB_TOKEN}", "Accept": "application/vnd.github.v3+json", "User-Agent": "JobSync"}
    try:
        req = urllib.request.Request(f"https://api.github.com/repos/{GITHUB_REPO}/releases/tags/{RELEASE_TAG}", headers=hdrs)
        rel = json.loads(urllib.request.urlopen(req).read())
        urllib.request.urlopen(urllib.request.Request(f"https://api.github.com/repos/{GITHUB_REPO}/releases/{rel['id']}", headers=hdrs, method="DELETE"))
    except Exception: pass
    meta_path = MODELS_DIR / "model_meta.json"
    meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
    body = json.dumps({"tag_name": RELEASE_TAG, "name": f"JobSync AI — {datetime.utcnow().strftime('%Y-%m-%d')}", "body": json.dumps(meta, indent=2), "prerelease": False}).encode()
    rel = json.loads(urllib.request.urlopen(urllib.request.Request(f"https://api.github.com/repos/{GITHUB_REPO}/releases", data=body, headers={**hdrs, "Content-Type": "application/json"}, method="POST")).read())
    with open(zip_path, "rb") as f:
        asset = json.loads(urllib.request.urlopen(urllib.request.Request(f"https://uploads.github.com/repos/{GITHUB_REPO}/releases/{rel['id']}/assets?name=jobsync_ai_model.zip", data=f.read(), headers={**hdrs, "Content-Type": "application/zip"}, method="POST")).read())
    print(f"✅ Published: {asset['browser_download_url']}")
    zip_path.unlink()

def from_kaggle():
    print(f"Downloading from Kaggle output ({KAGGLE_USER}/{KERNEL_SLUG})...")
    try:
        from kaggle import api; api.authenticate()
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
        _upload_to_github()
    except Exception as e:
        print(f"❌ Failed: {e}")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--kaggle", action="store_true")
    args = parser.parse_args()
    os.chdir(ROOT)
    from_kaggle() if args.kaggle else from_github()
