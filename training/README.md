# Audiochi training pipeline and model card

This pipeline trains, evaluates, quantizes and exports the sound classifier that runs in the Audiochi web app. Everything is reproducible from one command on a laptop (Apple M2 Pro, PyTorch MPS):

```bash
make all      # setup → data → teacher → ablation → evaluate → export   (~1.5 h on M2 Pro)
make test     # front-end parity, model and augmentation unit tests
make clean    # remove the venv, dataset, checkpoints and run outputs
```

## Pipeline

```
ESC-50 (2,000 clips × 5 s, 50 classes, 5 official folds)
  └─ decode + resample to 16 kHz (scipy polyphase)                     data.py
      └─ log-mel: 512-pt STFT, 10 ms hop, 64 Slaney mels, 50 Hz–8 kHz   features.py
          ├─ Teacher: PANNs CNN14 (AudioSet-pretrained, frozen)
          │     + per-fold logistic-regression probe                      teacher.py
          └─ Student: 1.3M-param VGG-style CNN, mean+max time pooling     models.py
                trained per fold: baseline / +augment / +distill          train.py
                  └─ report: ablation, confusion, calibration            evaluate.py
                      └─ ONNX → static int8 (QDQ, per-channel) → web     export.py
```

The log-mel front end is written in plain torch ops so it can be ported line by line to JavaScript (`src/ml/logmel.js`). It is tested to match torchlibrosa, the front end PANNs was trained with, within 1e-3 dB. `export.py` writes golden vectors, and the Jest suite checks that the browser implementation matches them within 0.01 dB. Training-serving skew is therefore tested, not assumed.

## Results (ESC-50, official 5-fold cross-validation)

| Model | Params | 5 s clip acc. | Live 2 s window acc. |
|---|---|---|---|
| Teacher: CNN14 frozen + linear probe | 80.8M | **91.8% ± 2.1** | n/a |
| Student, baseline (CE, full clips) | 1.3M | **80.2% ± 1.6** | 71.1% ± 3.3 |
| Student + augmentation (energy crops, gain, SpecAugment, mixup) | 1.3M | 76.5% ± 3.8 | 72.3% ± 3.0 |
| Student + augmentation + distillation (shipped) | 1.3M | 76.3% ± 1.8 | **72.4% ± 2.3** |

"Live 2 s" scores each fold model on the loudest 2 s of its held-out clips, which is what the web app actually sees. Reference points: human accuracy on ESC-50 is 81.3%, and fine-tuned large models reach 95–98%.

**What the ablation shows.**
- Augmentation and distillation trade full-clip accuracy for accuracy on short windows. The baseline sees whole 5 s clips and wins on that protocol. The augmented students, trained on 3 s crops, are better on the 2 s windows the product uses, so one of them ships.
- With a 60-epoch budget, the heavily regularized students are still under-fitting: training loss is still falling. A longer schedule is the obvious next experiment.
- Distillation mainly reduced variance across folds (±1.8 vs ±3.8).

**Quantization (fold-5 model, held-out fold 5):**

| | fp32 | int8 (static QDQ) |
|---|---|---|
| Accuracy (5 s) | 75.3% | 76.3% |
| Size | 5.0 MB | **1.3 MB** |
| CPU latency, 2 s window (1 thread, p50) | 15.3 ms | **4.6 ms** |

The ONNX fp32 output matches PyTorch to within 6e-5. In the browser (onnxruntime-web, WASM, single thread), one prediction including the JS log-mel takes about 35 ms in headless Chrome.

**Calibration.** Pooled out-of-fold ECE is 0.033. Temperature scaling (T = 1.10, cross-fitted) brings it to 0.023, and the app applies that temperature. See `reports/reliability.png`.

**Failure analysis** (`reports/top_confusions.md`, `reports/confusion_matrix.png`). The most common errors are acoustically reasonable:
- keyboard typing → mouse click
- engine → helicopter
- helicopter → airplane
- water drops → mouse click

The hardest classes are washing machine (28%), helicopter (33%), water drops (43%) and laughing (45%), mostly broadband or stationary noises. Top-5 accuracy is 96.1%.

## Model card

- **Task:** single-label environmental sound classification, 50 ESC-50 classes.
- **Intended use:** an interactive in-browser demo. Not for safety-critical detection (alarms, glass breaking, crying baby monitoring).
- **Training data:** ESC-50 (Piczak, 2015, CC BY-NC 3.0), 2,000 clips from freesound.org. The shipped model is trained on all five folds; the reported metrics come from the cross-validation models.
- **Input:** 2 s mono audio at 16 kHz, turned into a 201 × 64 log-mel spectrogram (computed in the browser).
- **Output:** calibrated probabilities over 50 classes.
- **Known limitations:**
  - **Closed set.** Any sound gets mapped to one of the 50 classes, so silence and speech produce confident nonsense. The app gates on loudness; real open-set detection is on the roadmap.
  - **Domain shift.** The clips are curated freesound recordings. Laptop microphones, room echo and browser audio processing differ. The app turns off echo cancellation, noise suppression and AGC to reduce this.
  - **Single-label.** Overlapping sounds are not modelled.
  - **Small dataset.** 40 clips per class, so confidence on rare real-world variants is unreliable.
- **Privacy:** audio never leaves the device. All inference runs client-side.

## Files

| Path | What |
|---|---|
| `audiochi_train/` | pipeline modules (see diagram) |
| `tests/` | pytest: front-end parity vs torchlibrosa, model shape/size, augmentations |
| `reports/` | `metrics.json`, confusion matrix, reliability diagram, top confusions |
| `../public/models/` | shipped `audiochi-esc50.int8.onnx` plus metadata (labels, temperature) |
| `../src/ml/` | browser front end: log-mel, resampler, ONNX classifier, with Jest parity tests |
