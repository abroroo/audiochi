#!/usr/bin/env bash
# Full ablation + final model. ~1.5 h on an M2 Pro (MPS).
# Baseline and augment use 60 epochs; the shipped distill recipe needs a longer schedule (150).
set -euo pipefail
export PYTHONUNBUFFERED=1
EPOCHS=${EPOCHS:-60}
SHIP_EPOCHS=${SHIP_EPOCHS:-150}
uv run python -m audiochi_train.train --config distill --epochs "$SHIP_EPOCHS"
for cfg in augment baseline; do
  uv run python -m audiochi_train.train --config "$cfg" --epochs "$EPOCHS"
done
uv run python -m audiochi_train.train --config distill --epochs "$SHIP_EPOCHS" --final
