import { melToHz, hzToMel } from "../spectrogramColors";
import { VIEW_RANGE, VIEW_ROWS } from "../axes";

/**
 * The bench spectrograph's model: every number the figure shows and every part it moves comes from
 * here. Pure functions, no DOM, unit-tested.
 */

export const REEDS = 32; // the filter bank: one reed per group of mel rows
export const ROWS_PER_REED = 4; // 129 view rows → 32 reeds × 4 (the top row is dropped)
export const ENERGY_RANGE = [-18, 0]; // dial span of the energy score
export const LEVEL_RANGE = [0, 1]; // preamp dial: mean band level

/** Average groups of mel rows (bass first) into one level per reed, each 0..1. */
export function reedLevels(row, out = new Float32Array(REEDS)) {
  for (let i = 0; i < REEDS; i++) {
    let sum = 0;
    for (let j = 0; j < ROWS_PER_REED; j++) sum += row[i * ROWS_PER_REED + j] ?? 0;
    out[i] = sum / (ROWS_PER_REED * 255);
  }
  return out;
}

/** Centre frequency (Hz) of a reed's band, on the same mel scale as the view rows. */
export function reedFrequency(index) {
  const lo = hzToMel(VIEW_RANGE.fMin);
  const hi = hzToMel(VIEW_RANGE.fMax);
  const row = (index + 0.5) * ROWS_PER_REED;
  return melToHz(lo + ((hi - lo) * row) / (VIEW_ROWS - 1));
}

/** Loudest reed, or null when nothing rises above the floor. */
export function peakReed(levels, floor = 0.12) {
  let best = -1;
  let value = floor;
  for (let i = 0; i < levels.length; i++) {
    if (levels[i] > value) {
      value = levels[i];
      best = i;
    }
  }
  return best < 0 ? null : best;
}

/** Mean level across all reeds, 0..1. */
export function overallLevel(levels) {
  let sum = 0;
  for (let i = 0; i < levels.length; i++) sum += levels[i];
  return levels.length ? sum / levels.length : 0;
}

/** Dial angle (radians, 0 = toward −y, clockwise from above) for a value on a 270° scale. */
export function dialAngle(value, [lo, hi], sweep = 1.5 * Math.PI) {
  const t = Math.min(1, Math.max(0, (value - lo) / (hi - lo)));
  return -sweep / 2 + t * sweep;
}

/** Drawer for a class index in a cabinet of `cols` columns, filled row by row from the top. */
export function drawerOf(index, cols = 5) {
  return { row: Math.floor(index / cols), col: index % cols };
}

/**
 * What the bench shows for one classifier result: which drawer is out (null when the sound is
 * quiet, unknown or a taught sound), the energy score and whether it passed the threshold.
 */
export function verdictOf(result, labels, threshold) {
  if (!result || result.quiet) return { drawer: null, energy: null, known: null, text: "listening…" };
  const energy = Number.isFinite(result.energy) ? result.energy : null;
  const known = energy === null ? null : energy <= threshold;
  const name = result.taughtMatch?.name ?? (result.speech ? "speech?" : result.unknown ? "unknown" : labels?.[result.top] ?? "—");
  const drawer = result.unknown || result.taughtMatch || result.speech ? null : result.top;
  const conf = result.taughtMatch ? result.taughtMatch.sim : result.probs?.[result.top];
  const parts = [`${name}${conf != null && drawer !== null ? ` ${Math.round(conf * 100)}%` : ""}`];
  if (energy !== null) parts.push(`energy ${energy.toFixed(1)} ${known ? "≤" : ">"} ${threshold.toFixed(2)}`);
  return { drawer, energy, known, text: parts.join(" · ") };
}

/** Short Hz label: 950 Hz, 1.2 kHz. */
export const hzText = (f) => (f >= 1000 ? `${(f / 1000).toFixed(1)} kHz` : `${Math.round(f)} Hz`);
