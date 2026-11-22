/**
 * Log-mel spectrogram front end, a line-by-line port of training/audiochi_train/features.py:
 * reflect-padded STFT (periodic Hann) -> power -> Slaney mel filterbank -> 10*log10.
 * It is unit-tested against golden vectors produced by the Python pipeline, so the browser model
 * sees exactly the features it was trained on.
 */

const LOG_AMIN = 1e-10;

// --- Slaney mel scale (librosa default, htk=false) -------------------------------------------
const F_SP = 200 / 3;
const MIN_LOG_HZ = 1000;
const MIN_LOG_MEL = MIN_LOG_HZ / F_SP;
const LOG_STEP = Math.log(6.4) / 27;

export function hzToMel(hz) {
  return hz >= MIN_LOG_HZ ? MIN_LOG_MEL + Math.log(hz / MIN_LOG_HZ) / LOG_STEP : hz / F_SP;
}

export function melToHz(mel) {
  return mel >= MIN_LOG_MEL ? MIN_LOG_HZ * Math.exp(LOG_STEP * (mel - MIN_LOG_MEL)) : F_SP * mel;
}

/**
 * Sparse Slaney-normalized triangular filters: one { start, weights } per mel band,
 * where weights[i] applies to FFT bin start + i.
 */
export function melFilterbank({ sampleRate, nFft, nMels, fMin, fMax }) {
  const nBins = nFft / 2 + 1;
  const fftFreqs = Array.from({ length: nBins }, (_, i) => (i * sampleRate) / nFft);
  const melMin = hzToMel(fMin);
  const melMax = hzToMel(fMax);
  const hzPts = Array.from({ length: nMels + 2 }, (_, i) => melToHz(melMin + ((melMax - melMin) * i) / (nMels + 1)));

  const bands = [];
  for (let m = 0; m < nMels; m++) {
    const [lo, center, hi] = [hzPts[m], hzPts[m + 1], hzPts[m + 2]];
    const enorm = 2 / (hi - lo);
    const full = fftFreqs.map(
      (f) => Math.max(0, Math.min((f - lo) / (center - lo), (hi - f) / (hi - center))) * enorm
    );
    const first = full.findIndex((w) => w > 0);
    if (first < 0) {
      bands.push({ start: 0, weights: new Float32Array(0) }); // band narrower than one FFT bin
      continue;
    }
    let last = full.length - 1;
    while (full[last] === 0) last--;
    bands.push({ start: first, weights: Float32Array.from(full.slice(first, last + 1)) });
  }
  return bands;
}

// --- Radix-2 real FFT power spectrum ----------------------------------------------------------

function makeFft(n) {
  if ((n & (n - 1)) !== 0) throw new Error(`FFT size must be a power of two, got ${n}`);
  const levels = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < levels; b++) r |= ((i >> b) & 1) << (levels - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2);
  const sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = -Math.sin((2 * Math.PI * i) / n);
  }
  const re = new Float64Array(n);
  const im = new Float64Array(n);

  /** Writes |X[k]|^2 for k in [0, n/2] into `out`. */
  return function powerSpectrum(frame, out) {
    for (let i = 0; i < n; i++) {
      re[rev[i]] = frame[i];
      im[rev[i]] = 0;
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0; j < half; j++) {
          const k = j * step;
          const a = i + j;
          const b = a + half;
          const tr = re[b] * cos[k] - im[b] * sin[k];
          const ti = re[b] * sin[k] + im[b] * cos[k];
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
    for (let k = 0; k <= n / 2; k++) out[k] = re[k] * re[k] + im[k] * im[k];
  };
}

/**
 * Create a reusable log-mel extractor.
 * @returns {(wave: Float32Array) => { data: Float32Array, frames: number }} row-major frames × nMels
 */
export function createLogMel(config) {
  const { nFft, hop, nMels } = config;
  const bands = melFilterbank(config);
  const window = Float64Array.from({ length: nFft }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / nFft));
  const powerSpectrum = makeFft(nFft);
  const frame = new Float64Array(nFft);
  const power = new Float64Array(nFft / 2 + 1);
  const pad = nFft / 2;

  return function logMel(wave) {
    const n = wave.length;
    if (n <= pad) throw new Error(`Need more than ${pad} samples for reflect padding, got ${n}`);
    const frames = Math.floor(n / hop) + 1;
    const out = new Float32Array(frames * nMels);
    // Index into the reflect-padded signal without materializing it (numpy/torch "reflect").
    const at = (i) => wave[i < 0 ? -i : i >= n ? 2 * (n - 1) - i : i];

    for (let t = 0; t < frames; t++) {
      const offset = t * hop - pad;
      for (let i = 0; i < nFft; i++) frame[i] = at(offset + i) * window[i];
      powerSpectrum(frame, power);
      for (let m = 0; m < nMels; m++) {
        const { start, weights } = bands[m];
        let sum = 0;
        for (let i = 0; i < weights.length; i++) sum += weights[i] * power[start + i];
        out[t * nMels + m] = 10 * Math.log10(Math.max(sum, LOG_AMIN));
      }
    }
    return { data: out, frames };
  };
}
