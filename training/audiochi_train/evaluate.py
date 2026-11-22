"""Turn the cross-validation runs into a report: ablation table, confusion matrix, calibration.

Reads runs/{baseline,augment,distill,teacher}/ and writes reports/:
  metrics.json             everything below, machine-readable
  confusion_matrix.png     distill model, all 5 test folds pooled (2000 predictions)
  reliability.png          calibration before/after temperature scaling
  top_confusions.md        the most frequent mistakes, for failure analysis
"""

from __future__ import annotations

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import numpy as np  # noqa: E402
from scipy.optimize import minimize_scalar  # noqa: E402
from scipy.special import log_softmax, softmax  # noqa: E402
from sklearn.metrics import confusion_matrix  # noqa: E402

from . import config as C  # noqa: E402
from .data import load_esc50  # noqa: E402
from .utils import load_json, save_json  # noqa: E402

LIVE_SECONDS = 2  # the browser classifies a sliding 2 s window


def live_window_accuracy(data, config_name: str) -> tuple[float, float]:
    """Accuracy of each fold model on the loudest 2 s of its held-out clips (what the app sees)."""
    import torch

    from .augment import random_crop
    from .features import LogMel
    from .models import SmallCNN

    frontend, accs = LogMel(), []
    for k in C.FOLDS:
        model = SmallCNN()
        model.load_state_dict(torch.load(C.RUNS_DIR / config_name / f"fold{k}.pt"))
        model.eval()
        test = data.folds == k
        crops = random_crop(data.audio[test], LIVE_SECONDS * C.SAMPLE_RATE, np.random.default_rng(0))
        with torch.no_grad():
            preds = model(frontend(torch.from_numpy(crops))).argmax(1).numpy()
        accs.append(float((preds == data.labels[test]).mean()))
    return float(np.mean(accs)), float(np.std(accs))

ABLATION = ["baseline", "augment", "distill"]


def expected_calibration_error(probs: np.ndarray, labels: np.ndarray, n_bins: int = 15) -> float:
    conf = probs.max(1)
    correct = probs.argmax(1) == labels
    bins = np.linspace(0, 1, n_bins + 1)
    ece = 0.0
    for lo, hi in zip(bins[:-1], bins[1:]):
        in_bin = (conf > lo) & (conf <= hi)
        if in_bin.any():
            ece += in_bin.mean() * abs(correct[in_bin].mean() - conf[in_bin].mean())
    return float(ece)


def fit_temperature(logits: np.ndarray, labels: np.ndarray) -> float:
    """Single scalar T minimizing NLL (Guo et al., 2017)."""

    def nll(t):
        return -log_softmax(logits / t, axis=1)[np.arange(len(labels)), labels].mean()

    return float(minimize_scalar(nll, bounds=(0.05, 20), method="bounded").x)


def cross_fitted_temperature(logits, labels, folds):
    """Fit T on four folds, apply to the fifth, so calibration is also measured on held-out data."""
    calibrated = np.empty_like(logits)
    temps = []
    for k in C.FOLDS:
        t = fit_temperature(logits[folds != k], labels[folds != k])
        temps.append(t)
        calibrated[folds == k] = logits[folds == k] / t
    return calibrated, float(np.mean(temps))


def reliability_plot(prob_sets: dict, labels, path, n_bins=10):
    fig, ax = plt.subplots(figsize=(4.5, 4.5))
    ax.plot([0, 1], [0, 1], "--", color="gray", lw=1)
    bins = np.linspace(0, 1, n_bins + 1)
    for name, probs in prob_sets.items():
        conf, correct = probs.max(1), probs.argmax(1) == labels
        xs, ys = [], []
        for lo, hi in zip(bins[:-1], bins[1:]):
            m = (conf > lo) & (conf <= hi)
            if m.sum() >= 5:
                xs.append(conf[m].mean())
                ys.append(correct[m].mean())
        ax.plot(xs, ys, "o-", label=name)
    ax.set(xlabel="confidence", ylabel="accuracy", title="Reliability (ESC-50, 5-fold)")
    ax.legend()
    fig.tight_layout()
    fig.savefig(path, dpi=150)
    plt.close(fig)


def main() -> None:
    data = load_esc50()
    C.REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    report = {"ablation": {}}

    for name in ABLATION + ["teacher"]:
        path = C.RUNS_DIR / name / "metrics.json"
        if path.exists():
            m = load_json(path)
            report["ablation"][name] = {k: m[k] for k in ("mean_acc", "std_acc", "fold_acc", "params")}
            if name in ABLATION:
                mean, std = live_window_accuracy(data, name)
                report["ablation"][name].update(live_2s_acc=mean, live_2s_std=std)

    # Pool the held-out predictions of the shipped recipe across folds.
    logits = np.zeros((len(data.labels), C.NUM_CLASSES), np.float32)
    for k in C.FOLDS:
        logits[data.folds == k] = np.load(C.RUNS_DIR / "distill" / f"test_logits_fold{k}.npy")
    labels = data.labels
    preds = logits.argmax(1)

    cal_logits, temperature = cross_fitted_temperature(logits, labels, data.folds)
    raw_p, cal_p = softmax(logits, 1), softmax(cal_logits, 1)
    report["calibration"] = {
        "temperature": temperature,
        "ece_before": expected_calibration_error(raw_p, labels),
        "ece_after": expected_calibration_error(cal_p, labels),
    }
    report["pooled_accuracy"] = float((preds == labels).mean())
    top5 = np.argsort(-logits, 1)[:, :5]
    report["pooled_top5_accuracy"] = float((top5 == labels[:, None]).any(1).mean())
    per_class = [(data.class_names[c], float((preds[labels == c] == c).mean())) for c in range(C.NUM_CLASSES)]
    report["hardest_classes"] = sorted(per_class, key=lambda x: x[1])[:8]
    report["easiest_classes"] = sorted(per_class, key=lambda x: -x[1])[:8]

    cm = confusion_matrix(labels, preds, labels=range(C.NUM_CLASSES))
    fig, ax = plt.subplots(figsize=(13, 12))
    ax.imshow(cm, cmap="magma")
    ax.set_xticks(range(C.NUM_CLASSES), data.class_names, rotation=90, fontsize=7)
    ax.set_yticks(range(C.NUM_CLASSES), data.class_names, fontsize=7)
    ax.set(xlabel="predicted", ylabel="true",
           title=f"Audiochi student, ESC-50 5-fold pooled (acc {report['pooled_accuracy']:.1%})")
    fig.tight_layout()
    fig.savefig(C.REPORTS_DIR / "confusion_matrix.png", dpi=130)
    plt.close(fig)

    reliability_plot({"raw": raw_p, f"temperature T={temperature:.2f}": cal_p}, labels,
                     C.REPORTS_DIR / "reliability.png")

    off = cm.copy()
    np.fill_diagonal(off, 0)
    pairs = np.dstack(np.unravel_index(np.argsort(-off, axis=None)[:10], off.shape))[0]
    lines = ["| true | predicted as | count (of 40) |", "|---|---|---|"]
    lines += [f"| {data.class_names[t]} | {data.class_names[p]} | {off[t, p]} |" for t, p in pairs]
    (C.REPORTS_DIR / "top_confusions.md").write_text("\n".join(lines) + "\n")

    save_json(report, C.REPORTS_DIR / "metrics.json")
    for name, m in report["ablation"].items():
        live = f"  live-2s {m['live_2s_acc']:.3f} ± {m['live_2s_std']:.3f}" if "live_2s_acc" in m else ""
        print(f"{name:9s} 5s-clip {m['mean_acc']:.3f} ± {m['std_acc']:.3f}{live}  ({m['params'] / 1e6:.1f}M params)")
    print(f"ECE {report['calibration']['ece_before']:.3f} -> {report['calibration']['ece_after']:.3f} (T={temperature:.2f})")


if __name__ == "__main__":
    main()
