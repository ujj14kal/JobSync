"""Run this once to generate the Colab .ipynb file."""
import json
from pathlib import Path

TRAIN_SRC = (Path(__file__).parent / "jobsync_train.py").read_text()

nb = {
  "nbformat": 4, "nbformat_minor": 0,
  "metadata": {
    "kernelspec": {"display_name": "Python 3", "name": "python3"},
    "accelerator": "GPU",
    "colab": {"name": "JobSync AI Trainer"}
  },
  "cells": [
    {
      "cell_type": "markdown", "metadata": {},
      "source": ["# JobSync Custom AI Trainer\n",
                 "Trains your fully custom AI model on free GPU.\n",
                 "**Runtime → Change runtime type → T4 GPU → Save**\n",
                 "Then Runtime → Run all\n"]
    },
    {
      "cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [],
      "source": [
        "# ── CONFIG — set your GitHub token here ──────────────────\n",
        "import os\n",
        "GITHUB_TOKEN = ''  # paste your token: Settings → Developer settings → PAT\n",
        "os.environ['GITHUB_TOKEN'] = GITHUB_TOKEN\n",
        "print('Token set:', bool(GITHUB_TOKEN))\n"
      ]
    },
    {
      "cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [],
      "source": [
        "# ── Clone repo and set up ─────────────────────────────────\n",
        "!git clone https://github.com/ujj14kal/JobSync.git\n",
        "%cd JobSync/backend\n",
        "!pip install -q torch numpy\n",
        "import sys; sys.path.insert(0, '.')\n",
        "print('Setup done')\n"
      ]
    },
    {
      "cell_type": "code", "metadata": {}, "execution_count": None, "outputs": [],
      "source": [
        "# ── Run full training pipeline ────────────────────────────\n",
        "import sys, os\n",
        "sys.argv = ['jobsync_train.py', '--github-token', os.environ.get('GITHUB_TOKEN','')]\n",
        "exec(open('notebooks/jobsync_train.py').read())\n",
        "main()\n"
      ]
    }
  ]
}

out = Path(__file__).parent / "jobsync_train_colab.ipynb"
out.write_text(json.dumps(nb, indent=2))
print(f"Generated: {out}")
