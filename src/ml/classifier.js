/**
 * In-browser inference for the Audiochi ESC-50 student model (int8 ONNX via onnxruntime-web).
 */
import { createLogMel } from "./logmel";

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
  const logMel = createLogMel(meta);

  return {
    meta,
    labels: meta.labels,
    windowSamples: meta.windowSeconds * meta.sampleRate,
    /**
     * @param {Float32Array} wave16k mono audio at meta.sampleRate
     * @returns {Promise<{ probs: number[], ms: number }>} calibrated class probabilities
     */
    async classify(wave16k) {
      const t0 = performance.now();
      const { data, frames } = logMel(wave16k);
      const input = new ort.Tensor("float32", data, [1, 1, frames, meta.nMels]);
      const output = await session.run({ logmel: input });
      const probs = softmax(output.logits.data, meta.temperature || 1);
      return { probs, ms: performance.now() - t0 };
    },
    release: () => session.release?.(),
  };
}
