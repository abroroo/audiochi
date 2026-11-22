/**
 * "Teach a sound": few-shot learning on top of the frozen model's embedding space.
 *
 * Each taught sound is a prototype: the normalized mean of a few example embeddings
 * (prototypical networks, Snell et al. 2017). A live sound is labelled with a taught sound when
 * that prototype is closer than every ESC-50 class centroid and above a minimum similarity.
 * No gradient step, no upload: learning a new class is a mean of a few vectors.
 */
import { dot, normalize } from "./space";

export const STORAGE_KEY = "audiochi.taughtSounds.v1";
export const MIN_EXAMPLES = 3;
export const MAX_EXAMPLES = 8;
export const MAX_SOUNDS = 6;

export function prototypeOf(examples) {
  const p = new Float32Array(examples[0].length);
  for (const e of examples) for (let i = 0; i < p.length; i++) p[i] += e[i];
  return normalize(p);
}

/**
 * @param {Float32Array} vec        live sound, unit vector in the projected space
 * @param {{name, examples}[]} sounds  taught sounds
 * @param {number} bestEscSim       highest similarity to any ESC-50 class centroid
 * @param {number} minSim           similarity floor below which nothing taught matches
 * @returns {{ name: string, sim: number } | null}
 */
export function matchTaught(vec, sounds, bestEscSim, minSim) {
  let best = null;
  for (const s of sounds) {
    if (s.examples.length < MIN_EXAMPLES) continue;
    const sim = dot(vec, prototypeOf(s.examples));
    if (!best || sim > best.sim) best = { name: s.name, sim };
  }
  if (!best || best.sim < minSim || best.sim <= bestEscSim) return null;
  return best;
}

/** Validate what comes back from storage: wrong shapes are dropped, never trusted. */
export function sanitizeSounds(value, dims) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s) => s && typeof s.name === "string" && s.name.trim() && Array.isArray(s.examples))
    .slice(0, MAX_SOUNDS)
    .map((s) => ({
      name: s.name.trim().slice(0, 40),
      examples: s.examples
        .filter((e) => Array.isArray(e) && e.length === dims && e.every(Number.isFinite))
        .slice(0, MAX_EXAMPLES)
        .map((e) => Float32Array.from(e)),
    }));
}

export function loadSounds(dims, storage = globalThis.localStorage) {
  try {
    return sanitizeSounds(JSON.parse(storage?.getItem(STORAGE_KEY) || "[]"), dims);
  } catch {
    return [];
  }
}

export function saveSounds(sounds, storage = globalThis.localStorage) {
  try {
    const plain = sounds.map((s) => ({
      name: s.name,
      examples: s.examples.map((e) => Array.from(e, (v) => Math.round(v * 1e4) / 1e4)),
    }));
    storage?.setItem(STORAGE_KEY, JSON.stringify(plain));
  } catch {
    // Private mode or full storage: taught sounds just last for this visit.
  }
}
