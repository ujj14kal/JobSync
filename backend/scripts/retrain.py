"""
One-command retraining pipeline.

Usage:
  python scripts/retrain.py                   # generate data + print Colab link
  python scripts/retrain.py --kaggle          # fully automated via Kaggle API
  python scripts/retrain.py --local           # train locally (CPU, slow but works)

What it does:
  1. Generates 10,000 training pairs locally (5 seconds, no API)
  2. Prints the Colab notebook URL (or runs Kaggle job)
  3. After training: model auto-uploads to GitHub Release
  4. Backend auto-downloads on next restart
"""
import argparse, json, os, subprocess, sys, time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT.parent))

def step1_generate_data(n=10_000):
    print(f"▶ Generating {n} training pairs (no API, instant)...")
    t0 = time.monotonic()
    from app.services.template_data_gen import generate_dataset, save_dataset
    records = generate_dataset(n_pairs=n)
    save_dataset(records)
    elapsed = time.monotonic() - t0
    print(f"✓ {len(records)} pairs generated in {elapsed:.1f}s → data/training_pairs.jsonl")
    hi  = sum(1 for r in records if r.match_level == "high")
    med = sum(1 for r in records if r.match_level == "medium")
    lo  = sum(1 for r in records if r.match_level == "low")
    print(f"  High={hi}  Medium={med}  Low={lo}")
    return records

def step2_commit_data():
    print("\n▶ Committing training data to GitHub...")
    subprocess.run(["git", "add", "backend/data/training_pairs.jsonl"], cwd=ROOT.parent)
    subprocess.run(["git", "commit", "-m", "chore: update training data (10k pairs)"], cwd=ROOT.parent)
    subprocess.run(["git", "push", "origin", "main"], cwd=ROOT.parent)
    print("✓ Data pushed to GitHub")

def step3_print_colab():
    colab_url = (
        "https://colab.research.google.com/github/ujj14kal/JobSync/blob/main/"
        "backend/notebooks/jobsync_train_colab.ipynb"
    )
    print("\n" + "="*60)
    print("TRAINING ON FREE GPU (Google Colab)")
    print("="*60)
    print(f"\n1. Open this URL:\n   {colab_url}")
    print("\n2. Set your GitHub token in the first cell:")
    print("   GITHUB_TOKEN = 'ghp_your_token_here'")
    print("   (Settings → Developer settings → Personal access tokens → Tokens)")
    print("\n3. Runtime → Run all")
    print("\n4. Training takes ~8-12 min on T4 GPU (free)")
    print("\n5. Model auto-uploads to GitHub Release when done")
    print("\n6. Restart backend → it downloads the new model automatically")
    print("="*60)

def step3_kaggle_train():
    """Trigger training on Kaggle via API."""
    try:
        import kaggle
    except ImportError:
        print("Installing kaggle...")
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "kaggle"])
        import kaggle

    kernel_slug = "jobsync-ai-trainer"
    username = os.environ.get("KAGGLE_USERNAME", "")
    if not username:
        print("⚠ Set KAGGLE_USERNAME and KAGGLE_KEY env vars for automated Kaggle training")
        step3_print_colab()
        return

    print(f"\n▶ Triggering Kaggle training kernel ({kernel_slug})...")
    # Push dataset, trigger kernel, wait for completion
    # This requires Kaggle API credentials in ~/.kaggle/kaggle.json
    try:
        from kaggle.api.kaggle_api_extended import KaggleApiExtended
        api = KaggleApiExtended(); api.authenticate()
        api.kernels_push(ROOT / "notebooks" / "kaggle_kernel_meta.json")
        print("✓ Kaggle kernel triggered")
        print(f"  Monitor: https://www.kaggle.com/{username}/{kernel_slug}")
    except Exception as e:
        print(f"⚠ Kaggle trigger failed: {e}")
        step3_print_colab()

def step4_local_train():
    print("\n▶ Training locally (CPU — ~60-90 min)...")
    print("  Tip: Use Colab/Kaggle for 10x faster training on free GPU")
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".." / ".env")
    from notebooks.jobsync_train import main
    main()

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--pairs",   type=int, default=10_000)
    parser.add_argument("--local",   action="store_true", help="Train locally on CPU")
    parser.add_argument("--kaggle",  action="store_true", help="Train on Kaggle (free GPU, automated)")
    parser.add_argument("--no-push", action="store_true", help="Don't push data to GitHub")
    args = parser.parse_args()

    os.chdir(ROOT)

    # Step 1: Generate data
    step1_generate_data(args.pairs)

    if not args.no_push:
        step2_commit_data()

    # Step 2: Train
    if args.local:
        step4_local_train()
    elif args.kaggle:
        step3_kaggle_train()
    else:
        step3_print_colab()

    print("\nDone. When training completes, restart your backend to load the new model.")
