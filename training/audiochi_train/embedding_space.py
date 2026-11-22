"""Build the embedding space the web app uses for the 3D sound map, open-set and few-shot features.

Runs every ESC-50 clip (its loudest 2 s, as the browser sees it) through the *shipped* int8 ONNX
model, then writes public/models/audiochi-esc50.space.json:

  mean, components   PCA 256 -> 64 on L2-normalized embeddings (the browser repeats these steps)
  vectors            2,000 projected unit vectors, int8, for k-NN search in the browser
  xyz, labels        UMAP 3D layout (cosine metric) of the same vectors, for the map
  centroids          per-class unit centroids, for "teach a sound" (a taught prototype must beat them)

Unknown-sound detection is chosen and calibrated separately in ood_study.py.

Note: the shipped model was trained on all 2,000 clips, so this is a map of its training data and the
thresholds are fitted in-sample (optimistic). They are reported with that caveat in reports/space.json.

    uv run --group map python -m audiochi_train.embedding_space
"""

from __future__ import annotations

import base64
import json

import numpy as np
import onnxruntime as ort

from . import config as C
from .augment import random_crop
from .data import load_esc50
from .export import add_embedding_output, logmel_np
from .utils import save_json

DIMS = 64
K = 10
CATEGORIES = ["Animals", "Natural soundscapes & water", "Human, non-speech", "Domestic", "Urban noises"]
SHIPPED = C.WEB_MODEL_DIR / "audiochi-esc50.int8.onnx"
GOLDEN = C.ROOT.parent / "src" / "ml" / "__fixtures__" / "space_golden.json"


def unit(x: np.ndarray) -> np.ndarray:
    return x / np.maximum(np.linalg.norm(x, axis=-1, keepdims=True), 1e-12)


def main() -> None:
    import umap

    add_embedding_output(SHIPPED)
    data = load_esc50()
    crops = random_crop(data.audio, 2 * C.SAMPLE_RATE, np.random.default_rng(0))
    feats = logmel_np(crops)
    sess = ort.InferenceSession(str(SHIPPED), providers=["CPUExecutionProvider"])
    logits, emb = [], []
    for i in range(0, len(feats), 50):
        lo, em = sess.run(["logits", "embedding"], {"logmel": feats[i:i + 50]})
        logits.append(lo)
        emb.append(em)
    logits, emb = np.concatenate(logits), np.concatenate(emb)
    labels = data.labels

    # PCA on unit embeddings (SVD), then renormalize so dot product = cosine similarity.
    x = unit(emb)
    mean = x.mean(0)
    _, s, vt = np.linalg.svd(x - mean, full_matrices=False)
    components = vt[:DIMS]
    explained = float((s[:DIMS] ** 2).sum() / (s ** 2).sum())
    z = unit((x - mean) @ components.T)
    zq = np.clip(np.round(z * 127), -127, 127).astype(np.int8)
    zd = zq / 127.0  # what the browser will actually search

    # Leave-one-out k-NN accuracy: is the space organized by class?
    sims = zd @ zd.T
    np.fill_diagonal(sims, -np.inf)
    nn = np.argsort(-sims, 1)[:, :K]
    knn_pred = np.array([np.bincount(labels[r], minlength=C.NUM_CLASSES).argmax() for r in nn])

    centroids = unit(np.stack([zd[labels == c].mean(0) for c in range(C.NUM_CLASSES)]))
    own_sim = (zd * centroids[labels]).sum(1)

    xyz = umap.UMAP(n_components=3, n_neighbors=15, min_dist=0.15, metric="cosine",
                    random_state=C.SEED).fit_transform(z)
    xyz = (xyz - xyz.mean(0)) / np.abs(xyz - xyz.mean(0)).max()

    space = {
        "version": 1, "embeddingDim": int(emb.shape[1]), "dims": DIMS, "count": int(len(z)), "k": K,
        "taughtMinSim": round(float(np.percentile(own_sim, 5)), 4),
        "categories": CATEGORIES,
        "labels": labels.tolist(),
        "xyz": np.round(xyz.astype(np.float64), 3).ravel().tolist(),
        "mean": np.round(mean.astype(np.float64), 5).tolist(),
        "components": np.round(components.astype(np.float64), 4).ravel().tolist(),
        "centroids": np.round(centroids.astype(np.float64), 4).ravel().tolist(),
        "vectors": {"scale": 127, "data": base64.b64encode(zq.tobytes()).decode()},
    }
    (C.WEB_MODEL_DIR / "audiochi-esc50.space.json").write_text(json.dumps(space, separators=(",", ":")))

    # Golden vectors for the JS projection + k-NN (src/ml/space.test.js), using the rounded file values.
    m_r, c_r = np.array(space["mean"]), np.array(space["components"]).reshape(DIMS, -1)
    gold = [0, 777, 1999]
    z_gold = unit((x[gold] - m_r) @ c_r.T)
    save_json({
        "embeddings": np.round(emb[gold].astype(np.float64), 6).tolist(),
        "projected": np.round(z_gold, 5).tolist(),
        "nearest": [np.argsort(-(zd @ v))[:K].tolist() for v in z_gold],
    }, GOLDEN)

    report = {
        "pca_dims": DIMS, "pca_explained_variance": explained,
        "onnx_live_2s_accuracy_in_sample": float((logits.argmax(1) == labels).mean()),
        "knn_loo_accuracy_in_sample": float((knn_pred == labels).mean()),
        "caveat": "Shipped model was trained on these clips: numbers are in-sample.",
    }
    save_json(report, C.REPORTS_DIR / "space.json")
    print(report)


if __name__ == "__main__":
    main()
