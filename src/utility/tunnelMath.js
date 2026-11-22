/**
 * Pure helpers for the sound tunnel (no three.js, so they are unit-tested directly).
 *
 * The tunnel wall is a grid of rings x segments. Frequency runs around each ring, mirrored, so the
 * ring has no seam: bass on the floor (both edges of the unrolled ring), highs on the ceiling.
 */

/** For each of `segments + 1` ring vertices, the frequency row it shows (mirrored, 0 = lowest). */
export function ringRowIndex(segments, rows) {
  const out = new Uint16Array(segments + 1);
  for (let a = 0; a <= segments; a++) {
    const t = a / segments;
    const m = 1 - Math.abs(2 * t - 1); // 0 at the floor, 1 at the ceiling
    out[a] = Math.round(m * (rows - 1));
  }
  return out;
}

/**
 * Scroll the wall one ring toward the viewer and write the newest spectrum into the far ring.
 *
 * @param {Uint8Array} displacement  per-vertex loudness, ring-major, (segments + 1) per ring
 * @param {Uint8Array} row           newest spectrum, one value per frequency row
 * @param {Uint16Array} rowIndex     from ringRowIndex()
 */
export function pushRing(displacement, row, rowIndex) {
  const perRing = rowIndex.length;
  displacement.copyWithin(0, perRing);
  const base = displacement.length - perRing;
  for (let a = 0; a < perRing; a++) displacement[base + a] = row[rowIndex[a]];
}
