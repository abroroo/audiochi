import { AXIS_RANGE, buildRowMap, hzToMel } from "./spectrogramColors";
import { midiToFreq } from "./pitch";

/**
 * Geometry shared by the flat spectrogram (WebGL or canvas) and its DOM axes, so tick marks sit
 * exactly on the data they label.
 */
export const WALL_ROWS = 256; // mel rows, bottom = 40 Hz, top = 16 kHz
export const WALL_COLS = 1024; // history columns
export const WALL_STEPS_PER_SECOND = 60;
export const WALL_SECONDS = WALL_COLS / WALL_STEPS_PER_SECOND; // time shown across the full width

/** Fractional row (0 = bottom) for a frequency on the wall's mel axis. */
export function wallRowForFreq(freq, rows = WALL_ROWS, { fMin, fMax } = AXIS_RANGE) {
  return ((hzToMel(freq) - hzToMel(fMin)) / (hzToMel(fMax) - hzToMel(fMin))) * (rows - 1);
}

/** Distance from the top of the wall as a fraction of its height (row centres, like the texture). */
export function wallTopFraction(freq, rows = WALL_ROWS) {
  return 1 - (wallRowForFreq(freq, rows) + 0.5) / rows;
}

export const HZ_TICKS = [
  [100, "100"], [250, "250"], [500, "500"], [1000, "1k"], [2000, "2k"], [4000, "4k"], [8000, "8k"], [16000, "16k"],
];
export const NOTE_TICKS = [48, 60, 72, 84, 96].map((m) => [midiToFreq(m), `C${m / 12 - 1}`]);

/** Seconds-ago ticks across the wall, newest (0 s) at the right edge. */
export function timeTicks(seconds = WALL_SECONDS, step = 2) {
  const ticks = [];
  for (let s = 0; s <= seconds + 1e-9; s += step) ticks.push({ seconds: s, left: 1 - s / seconds });
  return ticks;
}

/** 3D views: rows low to high frequency across 40 Hz–12 kHz on a mel scale. */
export const VIEW_ROWS = 129;
export const VIEW_RANGE = { fMin: 40, fMax: 12000 };
export function viewRowMap(bins, sampleRate, rows = VIEW_ROWS) {
  return buildRowMap(rows, bins, sampleRate, VIEW_RANGE).reverse();
}

/** Wall rows for analyser bins, bottom row first. */
export function wallRowMap(bins, sampleRate, rows = WALL_ROWS) {
  return buildRowMap(rows, bins, sampleRate).reverse();
}

/**
 * Soften a row in place: a [1 2 1] blur across frequency, then blend with the previous row over
 * time. Turns needle-like spikes into ridges without hiding real structure.
 *
 * @param {Uint8Array} row      current row (modified)
 * @param {Float32Array} state  previous smoothed row, same length (modified)
 * @param {number} [keep]       share of the previous row kept (0 = no temporal smoothing)
 */
export function smoothRow(row, state, keep = 0.35) {
  const n = row.length;
  let prev = row[0];
  for (let j = 0; j < n; j++) {
    const cur = row[j];
    const next = j + 1 < n ? row[j + 1] : cur;
    const blurred = (prev + 2 * cur + next) / 4;
    prev = cur;
    state[j] = keep * state[j] + (1 - keep) * blurred;
    row[j] = state[j];
  }
  return row;
}
