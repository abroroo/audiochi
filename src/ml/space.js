/**
 * The model's embedding space in the browser.
 *
 * The ONNX model has a second output: the 256-d penultimate embedding. The training pipeline
 * (training/audiochi_train/embedding_space.py) runs every ESC-50 clip through the shipped model and
 * writes `audiochi-esc50.space.json` with:
 *   - a PCA projection (256 -> 64) fitted on the L2-normalized clip embeddings,
 *   - the 2,000 projected clip vectors (int8) and their UMAP 3D coordinates,
 *   - per-class centroids, and a "speech" reject prototype (speech is not an ESC-50 class),
 *
 * Everything here is plain math on typed arrays, so it is unit-tested without WebAssembly.
 */

export const SPACE_URL = "/models/audiochi-esc50.space.json";

/** Scale a vector to unit length in place (no-op for the zero vector). */
export function normalize(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i] * v[i];
  const n = Math.sqrt(s);
  if (n > 0) for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

export function dot(a, b, bOffset = 0, len = a.length) {
  let s = 0;
  for (let i = 0; i < len; i++) s += a[i] * b[bOffset + i];
  return s;
}

function decodeInt8(base64) {
  const bin = typeof atob === "function" ? atob(base64) : Buffer.from(base64, "base64").toString("binary");
  const out = new Int8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = (bin.charCodeAt(i) << 24) >> 24;
  return out;
}

/** Turn the JSON written by the training pipeline into typed arrays. */
export function decodeSpace(json) {
  const { dims, embeddingDim, count } = json;
  const raw = decodeInt8(json.vectors.data);
  if (raw.length !== count * dims) throw new Error("Embedding space file is corrupt.");
  const vectors = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) vectors[i] = raw[i] / json.vectors.scale;
  return {
    dims,
    embeddingDim,
    count,
    k: json.k,
    taughtMinSim: json.taughtMinSim,
    categories: json.categories,
    labels: Int16Array.from(json.labels),
    xyz: Float32Array.from(json.xyz),
    mean: Float32Array.from(json.mean),
    components: Float32Array.from(json.components), // dims x embeddingDim, row-major
    centroids: Float32Array.from(json.centroids), // numClasses x dims, unit rows
    // Reject prototype from text-to-speech clips (training/audiochi_train/ood_study.py).
    speechPrototype: json.speechPrototype ? Float32Array.from(json.speechPrototype) : null,
    vectors, // count x dims, unit rows
  };
}

/** Raw model embedding -> unit vector in the PCA space (same steps as the Python pipeline). */
export function project(space, embedding) {
  const x = normalize(Float32Array.from(embedding));
  const centered = new Float32Array(space.embeddingDim);
  for (let j = 0; j < centered.length; j++) centered[j] = x[j] - space.mean[j];
  const out = new Float32Array(space.dims);
  for (let i = 0; i < space.dims; i++) out[i] = dot(centered, space.components, i * space.embeddingDim);
  return normalize(out);
}

/** The k most similar ESC-50 clips by cosine similarity, most similar first. */
export function nearest(space, vec, k = space.k) {
  const best = []; // [{ index, sim }] kept sorted, descending
  for (let i = 0; i < space.count; i++) {
    const sim = dot(vec, space.vectors, i * space.dims);
    if (best.length < k || sim > best[best.length - 1].sim) {
      let pos = best.length;
      while (pos > 0 && best[pos - 1].sim < sim) pos--;
      best.splice(pos, 0, { index: i, sim });
      if (best.length > k) best.pop();
    }
  }
  return best;
}

/** Place a live sound in the 3D map: similarity-weighted mean of its neighbours' UMAP positions. */
export function placeIn3D(space, neighbours) {
  const p = [0, 0, 0];
  let wsum = 0;
  for (const { index, sim } of neighbours) {
    const w = Math.exp(sim * 40); // sharpen so the closest clips dominate (no landing between clusters)
    for (let a = 0; a < 3; a++) p[a] += w * space.xyz[index * 3 + a];
    wsum += w;
  }
  return p.map((v) => v / wsum);
}

/** Cosine similarity of `vec` to every ESC-50 class centroid. */
export function centroidSims(space, vec) {
  const n = space.centroids.length / space.dims;
  return Array.from({ length: n }, (_, c) => dot(vec, space.centroids, c * space.dims));
}

/** True when `vec` is closer to the speech prototype than to every ESC-50 class centroid. */
export function soundsLikeSpeech(space, vec, bestEscSim) {
  return !!space.speechPrototype && dot(vec, space.speechPrototype) > bestEscSim;
}
