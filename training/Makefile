# Audiochi training pipeline. Requires uv (https://docs.astral.sh/uv/).
.PHONY: setup data teacher ablation evaluate export space ood-data ood test all clean

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

space:            ## embedding space for the web app: PCA, UMAP 3D map, class centroids -> ../public/models/
	uv run --group map python -m audiochi_train.embedding_space

ood-data:         ## out-of-set speech clips from macOS text-to-speech (12 voices x 3 sentences)
	./make_speech.sh

ood:              ## compare unknown-sound scores, ship the best threshold and the speech prototype
	uv run python -m audiochi_train.ood_study

test:
	uv run pytest -q

all: setup data teacher ablation evaluate export space ood-data ood

clean:            ## remove the environment, dataset, checkpoints and run outputs
	rm -rf .venv .data runs
