/** Small pure helpers behind the instrument's numeric readouts. */

/** Median of three values: removes single-frame octave jumps from a pitch track. */
export function median3(a, b, c) {
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
}

/** RMS level of time-domain samples in dB full scale (-Infinity for silence). */
export function levelDbfs(samples) {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / Math.max(1, samples.length));
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

/** Frames per second over a sliding one-second window. Call `tick(now)` once per frame. */
export function createFpsMeter() {
  const times = [];
  return (now) => {
    times.push(now);
    while (times.length > 1 && now - times[0] > 1000) times.shift();
    if (times.length < 2) return 0;
    return ((times.length - 1) * 1000) / (now - times[0]);
  };
}

/** Fixed-width-friendly number formatting; em dash when there's nothing to show. */
export function fmt(value, digits = 0, unit = "") {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const s = value.toFixed(digits).replace("-", "−");
  return unit ? `${s} ${unit}` : s;
}
