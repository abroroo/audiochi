"""Teacher: frozen PANNs CNN14 (AudioSet-pretrained) embeddings + a per-fold linear probe.

Outputs
  runs/teacher/embeddings.npy     (2000, 2048) clip embeddings
  runs/teacher/logits_fold{k}.npy (2000, 50) logits from the probe trained WITHOUT fold k,
                                  used as soft targets when distilling the student for fold k
  runs/teacher/metrics.json       per-fold and mean accuracy
"""

from __future__ import annotations

import argparse

import numpy as np
import torch
from sklearn.linear_model import LogisticRegression
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from tqdm import tqdm

from . import config as C
from .data import load_esc50
from .features import LogMel
from .models import Cnn14Embedder, count_params
from .utils import device, save_json, seed_everything

OUT = C.RUNS_DIR / "teacher"


@torch.no_grad()
def embed_all(audio: np.ndarray, batch_size: int = 32) -> np.ndarray:
    dev = device()
    frontend = LogMel().to(dev)
    model = Cnn14Embedder.from_checkpoint(C.DATA_DIR / "Cnn14_16k.pth").to(dev)
    chunks = []
    for i in tqdm(range(0, len(audio), batch_size), desc="CNN14 embeddings"):
        wav = torch.from_numpy(audio[i : i + batch_size]).to(dev)
        chunks.append(model(frontend(wav)).cpu().numpy())
    return np.concatenate(chunks)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--C", type=float, default=0.5, help="inverse L2 strength of the probe")
    args = parser.parse_args()
    seed_everything(C.SEED)
    OUT.mkdir(parents=True, exist_ok=True)

    data = load_esc50()
    emb_path = OUT / "embeddings.npy"
    if emb_path.exists():
        emb = np.load(emb_path)
    else:
        emb = embed_all(data.audio)
        np.save(emb_path, emb)

    accs = {}
    for fold in C.FOLDS:
        train, test = data.split(fold)
        probe = make_pipeline(StandardScaler(), LogisticRegression(C=args.C, max_iter=3000))
        probe.fit(emb[train], data.labels[train])
        accs[fold] = float((probe.predict(emb[test]) == data.labels[test]).mean())
        np.save(OUT / f"logits_fold{fold}.npy", probe.decision_function(emb).astype(np.float32))
        print(f"fold {fold}: {accs[fold]:.3f}")

    metrics = {"model": "PANNs CNN14 (frozen) + logistic regression", "params": count_params(Cnn14Embedder()),
               "fold_acc": accs, "mean_acc": float(np.mean(list(accs.values()))),
               "std_acc": float(np.std(list(accs.values())))}
    save_json(metrics, OUT / "metrics.json")
    print(f"mean {metrics['mean_acc']:.3f} ± {metrics['std_acc']:.3f}")


if __name__ == "__main__":
    main()
