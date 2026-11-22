"""Train the SmallCNN student with the official ESC-50 5-fold protocol.

Ablation configs (each trains 5 models, one per held-out fold):
  baseline  plain cross-entropy on full 5 s clips
  augment   + energy-biased 3 s crops, random gain, SpecAugment, mixup
  distill   augment + knowledge distillation from the CNN14 teacher (soft targets)

No early stopping or checkpoint selection on the test fold: the last epoch is evaluated, so
reported accuracy is not tuned on held-out data.

  python -m audiochi_train.train --config distill            # 5-fold CV
  python -m audiochi_train.train --config distill --final    # train on all folds for shipping
"""

from __future__ import annotations

import argparse
import time

import numpy as np
import torch
import torch.nn.functional as F

from . import config as C
from .augment import mixup, random_crop, random_gain, spec_augment
from .data import load_esc50
from .features import LogMel
from .models import SmallCNN, count_params
from .utils import device, save_json, seed_everything

CONFIGS = {
    "baseline": dict(augment=False, distill=False),
    "augment": dict(augment=True, distill=False),
    "distill": dict(augment=True, distill=True),
}
CROP_SECONDS = 3
KD_TEMPERATURE = 2.0
KD_WEIGHT = 0.7


def kd_loss(logits, target_probs, teacher_logits, temperature, weight):
    """Hinton-style distillation: weighted soft-target KL + cross-entropy on (possibly mixed) labels."""
    ce = -(target_probs * F.log_softmax(logits, dim=1)).sum(dim=1).mean()
    if teacher_logits is None:
        return ce
    soft_t = F.softmax(teacher_logits / temperature, dim=1)
    kl = F.kl_div(F.log_softmax(logits / temperature, dim=1), soft_t, reduction="batchmean")
    return weight * kl * temperature**2 + (1 - weight) * ce


@torch.no_grad()
def predict(model, frontend, audio: np.ndarray, dev, batch_size=64) -> np.ndarray:
    model.eval()
    out = []
    for i in range(0, len(audio), batch_size):
        wav = torch.from_numpy(audio[i : i + batch_size]).to(dev)
        out.append(model(frontend(wav)).float().cpu().numpy())
    return np.concatenate(out)


def train_one(data, train_mask, cfg, epochs, teacher_logits=None, log_prefix=""):
    dev = device()
    rng = np.random.default_rng(C.SEED)
    frontend = LogMel().to(dev)
    model = SmallCNN().to(dev)
    opt = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-2)
    batch_size = 64
    x_all, y_all = data.audio[train_mask], data.labels[train_mask]
    t_all = teacher_logits[train_mask] if teacher_logits is not None else None
    steps = epochs * int(np.ceil(len(x_all) / batch_size))
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=2e-3, total_steps=steps, pct_start=0.1)

    for epoch in range(epochs):
        model.train()
        order = rng.permutation(len(x_all))
        total, t0 = 0.0, time.time()
        for i in range(0, len(order), batch_size):
            idx = order[i : i + batch_size]
            wav = x_all[idx]
            if cfg["augment"]:
                wav = random_gain(random_crop(wav, CROP_SECONDS * C.SAMPLE_RATE, rng), rng)
            x = frontend(torch.from_numpy(wav).to(dev))
            y = F.one_hot(torch.from_numpy(y_all[idx]), C.NUM_CLASSES).float().to(dev)
            t = torch.from_numpy(t_all[idx]).to(dev) if t_all is not None else None
            if cfg["augment"]:
                x = spec_augment(x)
                if t is not None:
                    # Mix teacher logits with the same permutation by stacking them onto the targets.
                    x, yt = mixup(x, torch.cat([y, t], dim=1))
                    y, t = yt[:, : C.NUM_CLASSES], yt[:, C.NUM_CLASSES :]
                else:
                    x, y = mixup(x, y)
            loss = kd_loss(model(x), y, t, KD_TEMPERATURE, KD_WEIGHT)
            opt.zero_grad(set_to_none=True)
            loss.backward()
            opt.step()
            sched.step()
            total += loss.item() * len(idx)
        if epoch % 10 == 0 or epoch == epochs - 1:
            print(f"{log_prefix}epoch {epoch:3d} loss {total / len(x_all):.3f} ({time.time() - t0:.1f}s)")
    return model.eval(), frontend


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", choices=CONFIGS, required=True)
    parser.add_argument("--epochs", type=int, default=120)
    parser.add_argument("--folds", type=int, nargs="*", default=list(C.FOLDS))
    parser.add_argument("--final", action="store_true", help="train one model on all 2000 clips")
    args = parser.parse_args()
    cfg = CONFIGS[args.config]
    data = load_esc50()
    out = C.RUNS_DIR / args.config
    out.mkdir(parents=True, exist_ok=True)

    if args.final:
        seed_everything(C.SEED)
        teacher = None
        if cfg["distill"]:
            # Average the five probes' logits: each saw 80% of the data; together they cover all of it.
            teacher = np.mean([np.load(C.RUNS_DIR / "teacher" / f"logits_fold{k}.npy") for k in C.FOLDS], 0)
        model, _ = train_one(data, np.ones(len(data.labels), bool), cfg, args.epochs, teacher, "[final] ")
        torch.save(model.cpu().state_dict(), out / "final.pt")
        print(f"saved {out / 'final.pt'}")
        return

    accs = {}
    for fold in args.folds:
        seed_everything(C.SEED + fold)
        train_mask, test_mask = data.split(fold)
        teacher = np.load(C.RUNS_DIR / "teacher" / f"logits_fold{fold}.npy") if cfg["distill"] else None
        model, frontend = train_one(data, train_mask, cfg, args.epochs, teacher, f"[fold {fold}] ")
        logits = predict(model, frontend, data.audio[test_mask], device())
        accs[fold] = float((logits.argmax(1) == data.labels[test_mask]).mean())
        np.save(out / f"test_logits_fold{fold}.npy", logits)
        torch.save(model.cpu().state_dict(), out / f"fold{fold}.pt")
        print(f"[fold {fold}] test acc {accs[fold]:.3f}")

    metrics = {
        "config": args.config, **cfg, "epochs": args.epochs, "params": count_params(SmallCNN()),
        "fold_acc": accs, "mean_acc": float(np.mean(list(accs.values()))),
        "std_acc": float(np.std(list(accs.values()))),
    }
    save_json(metrics, out / "metrics.json")
    print(f"{args.config}: {metrics['mean_acc']:.3f} ± {metrics['std_acc']:.3f}")


if __name__ == "__main__":
    main()
