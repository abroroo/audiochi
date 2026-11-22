#!/usr/bin/env bash
# Full ablation + final model. ~1.5 h on an M2 Pro (MPS).
set -euo pipefail
export PYTHONUNBUFFERED=1
EPOCHS=${EPOCHS:-60}
for cfg in distill augment baseline; do
  uv run python -m audiochi_train.train --config "$cfg" --epochs "$EPOCHS"
done
uv run python -m audiochi_train.train --config distill --epochs "$EPOCHS" --final
