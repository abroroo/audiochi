# Audiochi

**Real-time sound recognition and visualization, running entirely in the browser.**

[Live demo →](https://audiochi.vercel.app) · [3D view →](https://audiochi.vercel.app/viewIn3D) · [Sound map →](https://audiochi.vercel.app/explore)

![Audiochi live spectrogram](public/images/og_image.jpg)

Audiochi listens through your microphone and shows what it hears:

- **Spectrogram wall.** The live spectrogram as a glowing wall in perspective that leans with the pointer. It is a WebGL ring-buffer texture, so nothing is copied as it scrolls, with a mel axis in Hz on one side and musical notes on the other, in the magma colormap. A 2D canvas takes over if WebGL is missing.
- **Pitch tracker.** YIN pitch detection (with parabolic interpolation and a median filter) draws a cyan trace of what you whistle or hum and names the note: "A4 +3¢".
- **Sound orb.** A noise-displaced sphere that ripples with 64 mel bands, swells with the bass and glows in the colour of the sound category the model last recognized.
- **No mic needed.** Any audio file can be dropped in. It is decoded and played into a `MediaStream`, so the spectrogram, classifier and teaching all run on it exactly as they do on the microphone.
- **Sound tunnel.** The spectrogram wrapped into a tunnel you fly through: time streams toward you, pitch runs around the wall, and loud sounds push in and glow (GLSL + bloom post-processing). Sounds the model recognizes float past as labels.
- **3D sound landscape.** A lit, mel-scaled terrain built with three.js and custom shaders, with orbit controls.
- **Sound classification.** A 1.3M-parameter CNN that I trained on ESC-50 recognizes 50 everyday sounds live. It runs as a 1.3 MB int8 ONNX model in the browser.
- **"I don't know that one."** Speech, music and other sounds outside the 50 classes are flagged instead of mislabelled. The detector was chosen by a small out-of-distribution study.
- **Teach it a new sound.** Record a sound 3–5 times and it is recognized from then on. This is few-shot learning in the model's embedding space, with no retraining and no upload.
- **What did it listen to?** An occlusion-saliency heatmap over the spectrogram shows which time and frequency regions drove the prediction.
- **Sound map.** A 3D UMAP galaxy of all 2,000 training clips as the model sees them, with your live sound moving through it.

No audio leaves the device. All processing runs client-side with the Web Audio API, WebGL and onnxruntime-web.

## How it works

```
Microphone ─► getUserMedia ─► AudioContext ─► AnalyserNode (FFT) ─┬─► 2D canvas spectrogram
                                                                  └─► three.js terrain (GLSL)
Microphone ─► AudioWorklet PCM ─► 16 kHz resampler ─► log-mel (JS) ─► int8 ONNX CNN ─► calibrated probabilities
```

### Audio pipeline

`useMicAnalyser` (`src/hooks/useMicAnalyser.js`) owns the full lifecycle: microphone stream, `AudioContext` and `AnalyserNode`. Everything is held in refs and released on stop or unmount. A getUserMedia promise that resolves after the user already pressed Stop is detected and discarded, so the microphone indicator never gets stuck on. Permission errors are mapped to messages the user can act on.

The analyser runs an FFT over the time-domain signal. `getByteFrequencyData` returns `fftSize / 2` bins of loudness (0–255).

### 2D spectrogram

Each animation frame shifts the canvas 1px left with `drawImage` and paints one new column on the right edge. The new column comes from a single `ImageData` write.
- **Frequency axis.** Each pixel row maps to a fractional FFT bin on a mel scale, interpolated between neighbouring bins. The 40 Hz–1 kHz range, where most pitch detail is, gets about a third of the height instead of the 6% a linear axis gives it.
- **Color.** Loudness goes through a precomputed 256-entry magma lookup table (a polynomial fit, tested against matplotlib). Frames need no string allocation and no per-pixel `strokeStyle`.

### Sound tunnel

`src/utility/soundTunnel.js` builds a 270-ring × 160-segment tube. Its vertex positions are computed entirely in the vertex shader from (ring, angle) and a per-vertex loudness byte. Frequency is mirrored around each ring (`tunnelMath.js`), so there is no seam: bass is on the floor and highs on the ceiling. Each step the loudness buffer scrolls one ring with `copyWithin`, and between steps the whole tube slides by the step clock's fractional progress, so motion stays smooth at any frame rate. Lighting uses screen-space derivative normals, and only loud sound is emissive, so `UnrealBloomPass` picks out the peaks. Classifier events become canvas-texture sprites that travel with the flow.

### 3D terrain

`src/utility/spectrogram3d.js` builds an indexed `BufferGeometry` with log-like spacing on the frequency axis. Each frame, the displacement buffer scrolls one time step with `copyWithin`, the newest spectrum is written into the last row, and only `needsUpdate` is flagged, so nothing is reallocated. The vertex shader (`src/utility/vertexshader.js`) displaces vertices along their normals and colors them from a 256-entry magma-style table. The view owns its renderer and frees the WebGL context on unmount.

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
- [x] **Phase 3: visual polish.** Mel-frequency axis with labels, perceptual (magma) colormap, orbit controls in 3D, readable layout on phones, and audio file upload so the demo works without a microphone.
