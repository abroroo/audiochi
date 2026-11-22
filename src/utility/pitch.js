/**
 * Pitch detection with YIN (de Cheveigné & Kawahara, 2002), the standard algorithm for monophonic
 * pitch: a difference function over candidate lags, cumulative-mean normalization, an absolute
 * threshold, then parabolic interpolation for sub-sample accuracy.
 */

/**
 * @param {Float32Array} buffer  time-domain samples (at least 2 x the longest period)
 * @param {number} sampleRate
 * @param {{ fMin?: number, fMax?: number, threshold?: number, minRms?: number }} [options]
 * @returns {{ freq: number, clarity: number } | null}  null for silence or unpitched sound
 */
export function detectPitch(buffer, sampleRate, { fMin = 70, fMax = 1100, threshold = 0.15, minRms = 0.01 } = {}) {
  let energy = 0;
  for (let i = 0; i < buffer.length; i++) energy += buffer[i] * buffer[i];
  if (Math.sqrt(energy / buffer.length) < minRms) return null;

  const minLag = Math.max(2, Math.floor(sampleRate / fMax));
  const maxLag = Math.min(Math.floor(sampleRate / fMin), Math.floor(buffer.length / 2) - 1);
  if (maxLag <= minLag) return null;
  const window = buffer.length - maxLag;

  // d(tau) and its cumulative-mean-normalized form d'(tau).
  const d = new Float32Array(maxLag + 2);
  let running = 0;
  let found = -1;
  for (let tau = 1; tau <= maxLag + 1; tau++) {
    let sum = 0;
    for (let i = 0; i < window; i++) {
      const diff = buffer[i] - buffer[i + tau];
      sum += diff * diff;
    }
    running += sum;
    d[tau] = running > 0 ? (sum * tau) / running : 1;
    if (found < 0 && tau > minLag && d[tau - 1] < threshold && d[tau] >= d[tau - 1]) found = tau - 1; // local min
  }
  if (found < 0) return null;

  // Parabolic interpolation around the minimum.
  const a = d[found - 1];
  const b = d[found];
  const c = d[found + 1];
  const denom = a - 2 * b + c;
  const shift = denom !== 0 ? (0.5 * (a - c)) / denom : 0;
  const freq = sampleRate / (found + shift);
  if (freq < fMin || freq > fMax) return null;
  return { freq, clarity: Math.max(0, Math.min(1, 1 - b)) };
}

const NOTE_NAMES = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];

/** Nearest equal-tempered note (A4 = 440 Hz) and how far off it is in cents. */
export function freqToNote(freq) {
  const midi = 69 + 12 * Math.log2(freq / 440);
  const nearest = Math.round(midi);
  return {
    name: `${NOTE_NAMES[((nearest % 12) + 12) % 12]}${Math.floor(nearest / 12) - 1}`,
    cents: Math.round((midi - nearest) * 100),
  };
}

/** Frequency of a note number (MIDI). C4 = 60 = 261.63 Hz. */
export const midiToFreq = (m) => 440 * 2 ** ((m - 69) / 12);
