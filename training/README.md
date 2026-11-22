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
| Student, baseline (CE, full clips, 60 ep) | 1.3M | 80.2% ± 1.6 | 71.1% ± 3.3 |
| Student + augmentation (energy crops, gain, SpecAugment, mixup, 60 ep) | 1.3M | 76.5% ± 3.8 | 72.3% ± 3.0 |
| Student + augmentation + distillation, 60 ep | 1.3M | 76.3% ± 1.8 | 72.4% ± 2.3 |
| **Student + augmentation + distillation, 150 ep (shipped)** | 1.3M | **84.3% ± 1.1** | **80.8% ± 2.0** |

"Live 2 s" scores each fold model on the loudest 2 s of its held-out clips, which is what the web app actually sees. Reference points: human accuracy on ESC-50 is 81.3%, and fine-tuned large models reach 95–98%.

**What the ablation shows.**
- At 60 epochs, augmentation and distillation looked like a trade-off: they lost full-clip accuracy to the baseline (76% vs 80%) and gained only slightly on 2 s windows. Training loss was still falling, which pointed to under-fitting rather than a bad recipe.
- Training the distilled student 2.5× longer (150 epochs) confirmed it: +8.0 points on 5 s clips and +8.4 on live 2 s windows. It now beats the baseline on both protocols and passes the reported human accuracy (81.3%).
- Distillation also gave the lowest variance across folds (±1.1).

**Quantization (fold-5 model, held-out fold 5):**

| | fp32 | int8 (static QDQ) |
|---|---|---|
| Accuracy (5 s) | 82.5% | 82.5% |
| Accuracy (live 2 s) | 80.3% | 80.3% |
| Size | 5.0 MB | **1.3 MB** |
| CPU latency, 2 s window (1 thread, p50) | 15.3 ms | **4.6 ms** |

The ONNX fp32 output matches PyTorch to within 6e-5. In the browser (onnxruntime-web, WASM, single thread), one prediction including the JS log-mel takes about 35 ms in headless Chrome.

**Calibration.** Pooled out-of-fold ECE is 0.027, so the longer-trained model is already well calibrated. Cross-fitted temperature scaling (T = 1.06) leaves it unchanged (0.028); at 60 epochs it had helped (0.033 → 0.023). The app still applies the fitted temperature. See `reports/reliability.png`.

**Failure analysis** (`reports/top_confusions.md`, `reports/confusion_matrix.png`). The most common errors are acoustically reasonable:
- washing machine → engine / train / vacuum cleaner
- engine → helicopter
- keyboard typing → mouse click
- wind → thunderstorm

The hardest classes are washing machine (38%), helicopter (53%), airplane (55%) and engine (60%): stationary, broadband machine noise. Top-5 accuracy is 98.0%.

## Beyond the 50 classes: embedding space, unknown sounds, few-shot

The shipped ONNX model has a second output, its 256-d penultimate **embedding**. Three web features are built on it, and so are two offline scripts:

```bash
make space     # embedding_space.py: PCA 256→64, UMAP 3D map, class centroids  -> public/models/*.space.json
make ood-data  # make_speech.sh: 36 text-to-speech clips (macOS `say`) as out-of-set data
make ood       # ood_study.py: compare unknown-sound scores, ship the winner's threshold + a speech prototype
```

**Sound map.** All 2,000 clips through the shipped int8 model, reduced to 3D with UMAP (cosine). The space is well organized by class: leave-one-out 10-NN accuracy is 95.3%. That number is in-sample, because the shipped model trained on these clips. The browser projects live audio into the same PCA space (golden-vector parity test) and places it among its nearest clips.

**Unknown-sound detection: a study, not a guess.** A closed-set classifier labels everything as one of its 50 classes. I compared four standard scores for spotting sounds that are none of them. In-distribution data was a random 2 s window of each ESC-50 clip (n = 1,835 after the silence gate). Out-of-set data was text-to-speech (n = 106 windows) and synthetic tones, chords and melodies (n = 120).

| Score | AUROC speech | AUROC tonal | Caught at 95% ESC-50 kept: speech | tonal |
|---|---|---|---|---|
| 1 − max softmax (Hendrycks & Gimpel, 2017) | **0.960** | 0.918 | 65% | 46% |
| **Energy, −logsumexp (Liu et al., 2020): shipped** | 0.957 | **0.926** | **69%** | **55%** |
| k-NN distance, embedding (Sun et al., 2022) | 0.933 | 0.871 | 40% | 19% |
| k-NN distance, pooled conv features | 0.924 | 0.882 | 45% | 36% |

- **A leakage bug I caught.** The first version of this study let an ESC-50 window match *another window of the same clip* in the k-NN bank. With that bug, k-NN looked best (AUROC 0.98 on speech). With self-matches excluded it came last. My first implementation used k-NN; this study is why the app uses energy instead.
- **Threshold.** The app keeps 90% of ESC-50 windows as known. At that threshold it catches 100% of the TTS speech and 77% of the tonal sounds (`reports/ood_study.json` has the full trade-off curve).
- **Speech prototype.** In live tests, speech still landed near *laughing*. So the app ships a "speech" reject prototype: the mean embedding of the TTS clips, matched the same way as a taught sound. Fitted on 6 voices and tested on the other 6, it caught 76% of the held-out speech windows. Only 0.27% of ESC-50 windows were mistaken for speech (5 windows: laughing and coughing).
- **Caveats.** The out-of-set data is synthetic: TTS is not a real person in a real room. ESC-50 scores are in-sample.

**Teach a sound (few-shot).** A user records a new sound 3–8 times. Its prototype is the normalized mean of the recordings' projected embeddings (prototypical networks, Snell et al., 2017). A live sound gets the taught label only if it is closer to that prototype than to every ESC-50 class centroid, and above a similarity floor (the 5th percentile of clip-to-own-centroid similarity). There is no training step, and nothing leaves the device.

**Saliency.** Occlusion (Zeiler & Fergus, 2014). The log-mel window is split into a 10 × 8 grid, each cell is masked with the window mean, and all 80 variants run as one ONNX batch (about 2.7 s in WASM). A cell's weight is the resulting drop in the predicted class's probability.

## Model card

- **Task:** single-label environmental sound classification, 50 ESC-50 classes.
- **Intended use:** an interactive in-browser demo. Not for safety-critical detection (alarms, glass breaking, crying baby monitoring).
- **Training data:** ESC-50 (Piczak, 2015, CC BY-NC 3.0), 2,000 clips from freesound.org. The shipped model is trained on all five folds; the reported metrics come from the cross-validation models.
- **Input:** 2 s mono audio at 16 kHz, turned into a 201 × 64 log-mel spectrogram (computed in the browser).
- **Output:** calibrated probabilities over 50 classes.
- **Known limitations:**
  - **Closed set.** The model itself maps any sound to one of the 50 classes. The app adds a loudness gate, an energy-score unknown detector and a speech prototype (see above), but these catch only part of what is out of set.
  - **Domain shift.** The clips are curated freesound recordings. Laptop microphones, room echo and browser audio processing differ. The app turns off echo cancellation, noise suppression and AGC to reduce this.
  - **Single-label.** Overlapping sounds are not modelled.
  - **Small dataset.** 40 clips per class, so confidence on rare real-world variants is unreliable.
- **Privacy:** audio never leaves the device. All inference runs client-side.

## Files

| Path | What |
|---|---|
| `audiochi_train/` | pipeline modules (see diagram) |
| `tests/` | pytest: front-end parity vs torchlibrosa, model shape/size, augmentations |
| `reports/` | `metrics.json`, confusion matrix, reliability diagram, top confusions, `space.json`, `ood_study.json` |
| `../public/models/` | shipped `audiochi-esc50.int8.onnx` (logits + embedding), metadata (labels, temperature, unknown threshold), embedding space |
| `../src/ml/` | browser front end: log-mel, resampler, ONNX classifier, with Jest parity tests |
