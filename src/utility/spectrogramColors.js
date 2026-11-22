/**
 * Convert HSL (h in degrees, s and l in 0–1) to an [r, g, b] triple in 0–255.
 */
export function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/**
 * 256-entry lookup table mapping an analyser byte (0–255 loudness) to RGB.
 * Purple when quiet, through red to orange when loud (hue 280° → 400°, lightness 10% → 80%).
 * Precomputing it avoids building a CSS color string per pixel per frame.
 *
 * @returns {Uint8ClampedArray} length 256 * 3, laid out as r,g,b,r,g,b,…
 */
export function buildLoudnessLut() {
  const lut = new Uint8ClampedArray(256 * 3);
  for (let v = 0; v < 256; v++) {
    const ratio = v / 255;
    const [r, g, b] = hslToRgb(280 + ratio * 120, 1, 0.1 + 0.7 * ratio);
    lut[v * 3] = r;
    lut[v * 3 + 1] = g;
    lut[v * 3 + 2] = b;
  }
  return lut;
}

/**
 * Fill a 1-pixel-wide RGBA column from frequency data, low frequencies at the bottom.
 *
 * @param {Uint8Array} frequencyData analyser.getByteFrequencyData output
 * @param {Uint8ClampedArray} column RGBA buffer of length height * 4
 * @param {Uint8ClampedArray} lut table from buildLoudnessLut()
 */
export function paintColumn(frequencyData, column, lut) {
  const height = column.length / 4;
  const bins = frequencyData.length;
  for (let y = 0; y < height; y++) {
    const bin = Math.min(bins - 1, Math.floor(((height - 1 - y) / height) * bins));
    const v = frequencyData[bin];
    const o = y * 4;
    column[o] = lut[v * 3];
    column[o + 1] = lut[v * 3 + 1];
    column[o + 2] = lut[v * 3 + 2];
    column[o + 3] = 255;
  }
}
