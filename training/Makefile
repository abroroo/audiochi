# Audiochi training pipeline. Requires uv (https://docs.astral.sh/uv/).
.PHONY: setup data teacher ablation evaluate export test all clean

setup:            ## create the Python environment
	uv sync --group dev

data:             ## download ESC-50 (~600 MB) and the PANNs CNN14 16 kHz checkpoint (~340 MB)
	mkdir -p .data
	test -d .data/ESC-50-master || (curl -L -o .data/esc50.zip https://github.com/karolpiczak/ESC-50/archive/refs/heads/master.zip && unzip -q .data/esc50.zip -d .data && rm .data/esc50.zip)
	test -f .data/Cnn14_16k.pth || curl -L -o .data/Cnn14_16k.pth "https://zenodo.org/record/3987831/files/Cnn14_16k_mAP%3D0.438.pth?download=1"

teacher:          ## CNN14 embeddings + per-fold linear probe (soft targets for distillation)
	uv run python -m audiochi_train.teacher

ablation:         ## 5-fold CV for baseline / augment / distill, then the final shipped model
	./run_ablation.sh

evaluate:         ## ablation table, confusion matrix, calibration -> reports/
	uv run python -m audiochi_train.evaluate

export:           ## ONNX + int8 quantization + checks -> ../public/models/
	uv run python -m audiochi_train.export

test:
	uv run pytest -q

all: setup data teacher ablation evaluate export

clean:            ## remove the environment, dataset, checkpoints and run outputs
	rm -rf .venv .data runs
