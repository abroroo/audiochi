/**
 * In-browser inference for the Audiochi ESC-50 student model (int8 ONNX via onnxruntime-web).
 */
import { createLogMel } from "./logmel";
import { gridCells, importance, occlusionBatch } from "./saliency";

export const MODEL_DIR = "/models";
export const METADATA_URL = `${MODEL_DIR}/audiochi-esc50.json`;

/** Numerically stable softmax with temperature scaling. */
export function softmax(logits, temperature = 1) {
  let max = -Infinity;
  for (const v of logits) max = Math.max(max, v / temperature);
  const exps = Array.from(logits, (v) => Math.exp(v / temperature - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

/**
 * Energy score, -logsumexp(logits) (Liu et al., 2020): higher means less like anything the model
 * learned. It beat max-softmax and k-NN distance for "unknown sound" detection on speech and tones
 * (training/audiochi_train/ood_study.py, reports/ood_study.json).
 */
export function energyScore(logits) {
  let max = -Infinity;
  for (const v of logits) max = Math.max(max, v);
  let sum = 0;
  for (const v of logits) sum += Math.exp(v - max);
  return -(max + Math.log(sum));
}

/** Indices of the k largest values, descending. */
export function topK(values, k) {
  return Array.from(values.keys())
    .sort((a, b) => values[b] - values[a])
    .slice(0, k);
}

/** Root-mean-square level in dBFS (0 dB = full scale sine peak). */
export function rmsDb(wave) {
  let sum = 0;
  for (let i = 0; i < wave.length; i++) sum += wave[i] * wave[i];
  return 10 * Math.log10(sum / Math.max(1, wave.length) + 1e-12);
}

/**
 * Load the model and return a classifier.
 * `ort` is injected so this module stays testable without WebAssembly.
 */
export async function loadClassifier(ort, { fetchImpl = fetch } = {}) {
  const res = await fetchImpl(METADATA_URL);
  if (!res.ok) throw new Error(`Couldn't load model metadata (${res.status}).`);
  const meta = await res.json();
  const session = await ort.InferenceSession.create(`${MODEL_DIR}/${meta.model}`, {
    executionProviders: ["wasm"],
  });
  const hasEmbedding = session.outputNames?.includes("embedding");
  const logMel = createLogMel(meta);
  const T = meta.temperature || 1;

  return {
    meta,
    labels: meta.labels,
    windowSamples: meta.windowSeconds * meta.sampleRate,
    /**
     * @param {Float32Array} wave16k mono audio at meta.sampleRate
     * @returns {Promise<{ probs: number[], energy: number, unknown: boolean, embedding: Float32Array|null, logmel, ms: number }>}
     */
    async classify(wave16k) {
      const t0 = performance.now();
      const logmel = logMel(wave16k);
      const input = new ort.Tensor("float32", logmel.data, [1, 1, logmel.frames, meta.nMels]);
      const output = await session.run({ logmel: input });
      const energy = energyScore(output.logits.data);
      return {
        probs: softmax(output.logits.data, T),
        energy,
        unknown: Number.isFinite(meta.unknownEnergyThreshold) && energy > meta.unknownEnergyThreshold,
        embedding: hasEmbedding ? Float32Array.from(output.embedding.data) : null,
        logmel,
        ms: performance.now() - t0,
      };
    },
    /**
     * Occlusion saliency for `classIndex` on a log-mel window from `classify`.
     * @returns {Promise<{ cells, weights: Float32Array, ms: number }>}
     */
    async explain({ data, frames }, classIndex) {
      const t0 = performance.now();
      const cells = gridCells(frames, meta.nMels);
      const base = await session.run({ logmel: new ort.Tensor("float32", data, [1, 1, frames, meta.nMels]) });
      const baseProb = softmax(base.logits.data, T)[classIndex];
      const batch = occlusionBatch(data, frames, meta.nMels, cells);
      const out = await session.run({
        logmel: new ort.Tensor("float32", batch, [cells.length, 1, frames, meta.nMels]),
      });
      const n = meta.labels.length;
      const masked = cells.map((_, c) => softmax(out.logits.data.subarray(c * n, (c + 1) * n), T)[classIndex]);
      return { cells, weights: importance(baseProb, masked), ms: performance.now() - t0 };
    },
    release: () => session.release?.(),
  };
}
