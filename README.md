# Audiochi

**A real-time audio analysis instrument that runs entirely in the browser: spectrogram, pitch, 3D views and a sound classifier I trained myself.**

[Live demo →](https://audiochi.vercel.app) · [Embedding map →](https://audiochi.vercel.app/explore)

![Audiochi live spectrogram](public/images/og_image.jpg)

One screen, one input (microphone or an audio file), three views of the same signal, live readouts and the classifier:

- **Flat spectrogram.** A WebGL ring-buffer texture (nothing is copied as it scrolls) drawn edge to edge on a mel axis, 40 Hz–16 kHz, in the magma colormap. Hz ticks, note ticks and a seconds-ago scale are drawn from the same geometry as the texture (`src/utility/axes.js`, unit-tested), so they sit exactly on the data. Recognized sounds appear as markers that scroll with it. A 2D canvas with identical geometry takes over if WebGL is missing.
- **Pitch tracker.** YIN pitch detection (parabolic interpolation, median filter) draws a cyan trace on the spectrogram and feeds the readout: "440.0 Hz · A4 +3¢".
- **Ridgeline.** One glowing line per moment of spectrum with a magma gradient fill below it; the fills are opaque, so nearer ridges hide farther ones. It is a 3D object: orbit, zoom, reset.
- **Particle galaxy.** 24,000 GPU particles stream from a core. Each belongs to a mel band, and that band's loudness drives a CPU-integrated phase, so particles speed up without jumping. Orbitable.
- **Readouts.** Pitch, note, level (dBFS), top class, confidence, the open-set energy score, inference time and frame rate, in one monospace strip.
- **No mic needed.** Built-in samples (dog, rooster, siren and rain clips from ESC-50, CC BY-NC; two music tracks by Luna Cantina and Quincas Moreira that show the "unknown" path), or load any audio file. It is decoded and played into a `MediaStream`, so every view and the classifier run on it exactly as they do on the microphone.
- **Sound classification.** A 1.3M-parameter CNN that I trained on ESC-50 recognizes 50 everyday sounds live. It runs as a 1.3 MB int8 ONNX model in the browser.
- **"I don't know that one."** Speech, music and other sounds outside the 50 classes are flagged instead of mislabelled. The detector was chosen by a small out-of-distribution study.
- **Teach it a new sound.** Record a sound 3–5 times and it is recognized from then on. This is few-shot learning in the model's embedding space, with no retraining and no upload.
- **What did it listen to?** An occlusion-saliency heatmap over the spectrogram shows which time and frequency regions drove the prediction.
- **Embedding map** (`/explore`). A 3D UMAP of all 2,000 training clips as the model sees them, with your live sound moving through it.

No audio leaves the device. All processing runs client-side with the Web Audio API, WebGL and onnxruntime-web.

## How it works

```
                             ┌─► AnalyserNode (FFT 4096) ─► mel rows ─► spectrogram / ridgeline / galaxy
mic or file ─► MediaStream ──┤                           └─► YIN pitch, dBFS level ─► readouts
                             └─► AudioWorklet PCM ─► 16 kHz resampler ─► log-mel (JS) ─► int8 ONNX CNN ─► probabilities, energy score
```

### Audio pipeline

`useAudioSource` (`src/hooks/useAudioSource.js`) owns the single input: one `getUserMedia` stream (browser AGC, noise suppression and echo cancellation off) or a decoded file played into a `MediaStream`. The visual analyser (`useMicAnalyser`) and the classifier (`useLiveClassifier`) both read that stream, so there is one permission prompt and one stop button. Everything that needs tearing down lives in refs; a permission prompt that resolves after Stop is detected and discarded, so the mic indicator never sticks. Errors are mapped to messages the user can act on.

### Views

Each view is its own lazily loaded module with the same small interface, and owns its renderer, freeing the WebGL context when you switch.
- **Fixed rate, any refresh rate.** A step clock (`frameClock.js`) turns animation frames into a fixed number of steps per second, so the spectrogram scrolls at exactly 60 columns/s on 60, 120 Hz or throttled displays. The 3D views also slide by the fractional step between frames.
- **Mel rows.** FFT bins are interpolated onto mel rows. 40 Hz–1 kHz gets about a third of the height instead of the 6% a linear axis gives it.
- **Labels stay readable.** 3D labels are drawn in an overlay scene after the bloom pass, so the glow never washes them out and geometry never hides them.

### Sound classification: my own model, end to end

The model is trained, evaluated and quantized by the pipeline in [`training/`](training/README.md):

| | ESC-50 5-fold accuracy | Size |
|---|---|---|
| Teacher: PANNs CNN14 (frozen) + linear probe | 91.8% | 80.8M params |
| Student CNN, baseline | 80.2% (5 s clips) | 1.3M params |
| **Shipped student: augmentation + distillation from the teacher** | **84.3% (5 s)** · **80.8% (live 2 s windows)** | **1.3 MB int8** |

- **Training-serving parity.** The log-mel front end is implemented twice: in PyTorch for training and in JavaScript for the browser (`src/ml/logmel.js`). Golden vectors test that both match within 0.01 dB.
- **Streaming resampler.** A windowed-sinc filter converts device audio (44.1/48 kHz) to 16 kHz chunk by chunk, without aliasing.
- **Quantization.** Static int8 (QDQ, per-channel). It is 3.9× smaller and 3.3× faster on CPU, with no accuracy loss on the held-out fold.
- **Calibration.** Expected calibration error is 0.027 out of fold, checked with cross-fitted temperature scaling.

The pipeline has a full ablation, a confusion matrix, failure analysis and a model card. See [training/README.md](training/README.md).

### On top of the model: embeddings

The ONNX model also outputs its 256-d embedding, and the browser projects it into a PCA space shipped with the app (`src/ml/space.js`). That one space powers four features:
- the 3D sound map (UMAP);
- the speech reject prototype;
- few-shot "teach a sound" (`src/ml/fewshot.js`);
- placement of the live marker.

Unknown sounds are detected with an energy score. I picked it over max-softmax and k-NN distance after a study on held-out speech and tones. That study also caught a leakage bug that had made k-NN look best ([details](training/README.md#beyond-the-50-classes-embedding-space-unknown-sounds-few-shot)). Saliency is occlusion-based: 80 masked copies of the window run as one ONNX batch (`src/ml/saliency.js`).

<details>
<summary>v1 (2024): Teachable Machine</summary>

The first version fine-tuned Google's speech-commands CNN in Teachable Machine on a few self-recorded classes. Replacing it with my own pipeline is what Phase 1 of the roadmap was about.

</details>

## Tech stack

**Web:** Next.js 16 · React 19 · Web Audio API + AudioWorklet · three.js + GLSL · onnxruntime-web · Tailwind CSS · Jest · Cypress · CircleCI (tests) · Vercel (deploys on push)

**ML:** PyTorch · PANNs CNN14 · scikit-learn · UMAP · ONNX + onnxruntime quantization · librosa · uv

## Run locally

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests (Jest)
npm run build && npm start   # then, in another terminal:
npm run e2e          # Cypress, with a fake microphone in Chromium

cd training && make all   # retrain the model and rebuild the embedding space (~1.5 h on an M2 Pro, macOS for TTS)
```

Requires Node 20.9 or newer. Microphone access needs `localhost` or HTTPS.

## Roadmap

- [x] **Phase 0: foundations.** Leak-free audio lifecycle, error and loading states, shared mic hook, App Router only, social preview metadata, meaningful tests, dependency cleanup.
- [x] **Phase 1: own the model.** A PyTorch pipeline on ESC-50: log-mel front end with JS parity tests, a CNN14 teacher, an ablation over augmentation and distillation, int8 ONNX, calibration and a model card.
- [x] **Phase 2: ML features.** Teach a new sound in the browser (few-shot prototypes), a 3D embedding explorer (UMAP), occlusion saliency, and unknown-sound detection backed by an OOD study.
- [x] **Phase 3: visual polish.** Mel-frequency axis with labels, perceptual (magma) colormap, orbit controls in 3D, readable layout on phones, and audio file upload so the demo works without a microphone, plus built-in samples.
- [x] **Phase 4: one instrument.** The 2D and 3D pages merged into one screen with a single input, a view switcher, numeric readouts and the classifier panel.
