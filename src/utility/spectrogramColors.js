// Polynomial fit of matplotlib's "magma" colormap (perceptually uniform, readable in greyscale and
// by most colour-blind viewers). Coefficients from https://www.shadertoy.com/view/WlfXRN (CC0).
const MAGMA = [
  [-0.002136485053939582, -0.000749655052795221, -0.005386127855323933],
  [0.2516605407371642, 0.6775232436837668, 2.494026599312351],
  [8.353717279216625, -3.577719514958484, 0.3144679030132573],
  [-27.66873308576866, 14.26473078096533, -13.64921318813922],
  [52.17613981234068, -27.94360607168351, 12.94416944238394],
  [-50.76852536473588, 29.04658282127291, 4.23415299384598],
  [18.65570506591883, -11.48977351997711, -5.601961508734096],
];

/** Magma colour at t in [0, 1], as [r, g, b] in 0–255. */
export function magma(t) {
  const x = Math.min(1, Math.max(0, t));
  return [0, 1, 2].map((ch) => {
    let v = 0;
    for (let k = MAGMA.length - 1; k >= 0; k--) v = v * x + MAGMA[k][ch];
    return Math.round(Math.min(1, Math.max(0, v)) * 255);
  });
}

// Silence is near-black (just into the map), so quiet regions blend with the page and sound stands out.
const MAGMA_START = 0.03;

/**
 * 256-entry lookup table mapping an analyser byte (0–255 loudness) to RGB with the magma colormap:
 * deep violet when quiet, through red and orange, to pale yellow when loud.
 * Precomputing it avoids building a CSS colour string per pixel per frame.
 *
 * @returns {Uint8ClampedArray} length 256 * 3, laid out as r,g,b,r,g,b,…
 */
export function buildLoudnessLut() {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let v = 0; v < 256; v++) lut.set(magma(MAGMA_START + (1 - MAGMA_START) * (v / 255)), v * 3);
  return lut;
}

// --- Mel-scaled frequency axis ---------------------------------------------------------------------

export const hzToMel = (f) => 2595 * Math.log10(1 + f / 700);
export const melToHz = (m) => 700 * (10 ** (m / 2595) - 1);
export const AXIS_RANGE = { fMin: 40, fMax: 16000 };

/**
 * For each pixel row (top to bottom), the fractional FFT bin it shows on a mel axis.
 * Mel spacing gives low frequencies, where most sound energy and pitch detail is, far more room
 * than a linear axis does.
 */
export function buildRowMap(height, bins, sampleRate, { fMin, fMax } = AXIS_RANGE) {
  const top = Math.min(fMax, sampleRate / 2);
  const mMin = hzToMel(fMin);
  const mMax = hzToMel(top);
  const binHz = sampleRate / 2 / bins;
  const map = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    const m = mMax - ((y + 0.5) / height) * (mMax - mMin);
    map[y] = Math.min(bins - 1, melToHz(m) / binHz);
  }
  return map;
}

/** Resample analyser bins onto mel rows from buildRowMap() (linear interpolation between bins). */
export function fillRow(out, frequencyData, rowMap) {
  const last = frequencyData.length - 1;
  for (let j = 0; j < out.length; j++) {
    const pos = rowMap[j];
    const lo = Math.floor(pos);
    const hi = Math.min(last, lo + 1);
    out[j] = frequencyData[lo] + (frequencyData[hi] - frequencyData[lo]) * (pos - lo);
  }
  return out;
}
