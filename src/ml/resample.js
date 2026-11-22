/**
 * Band-limited resampling with a Blackman-windowed sinc kernel.
 *
 * The browser captures audio at the device rate (usually 44.1 or 48 kHz); the model expects
 * 16 kHz. Naive decimation would alias everything above 8 kHz back into the spectrum, so the
 * kernel low-passes at 0.95 × the output Nyquist (training used scipy's polyphase filter, which
 * behaves similarly).
 *
 * The kernel is tabulated once (no trig in the inner loop) and `StreamingResampler` converts
 * audio chunk by chunk as it arrives, so live capture costs ~100 multiply-adds per output sample.
 */

const TABLE_RESOLUTION = 256; // kernel samples per input sample

function buildKernel(cutoff, halfWidth) {
  const size = 2 * halfWidth * TABLE_RESOLUTION + 2;
  const table = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const x = i / TABLE_RESOLUTION - halfWidth; // distance in input samples
    const s = x === 0 ? 1 : Math.sin(Math.PI * cutoff * x) / (Math.PI * cutoff * x);
    const u = (x + halfWidth) / (2 * halfWidth);
    const w = u < 0 || u > 1 ? 0 : 0.42 - 0.5 * Math.cos(2 * Math.PI * u) + 0.08 * Math.cos(4 * Math.PI * u);
    table[i] = s * w;
  }
  return table;
}

export class StreamingResampler {
  /**
   * @param {number} fromRate input sample rate
   * @param {number} toRate output sample rate
   * @param {number} [zeroCrossings=16] kernel half-width, in output-rate sinc lobes
   */
  constructor(fromRate, toRate, zeroCrossings = 16) {
    this.ratio = toRate / fromRate;
    const cutoff = 0.95 * Math.min(1, this.ratio); // normalized to the input Nyquist
    this.halfWidth = Math.ceil(zeroCrossings / cutoff);
    this.kernel = buildKernel(cutoff, this.halfWidth);
    this.buffer = new Float32Array(0);
    this.bufferStart = 0; // absolute index of buffer[0] in the input stream
    this.nextOutput = 0; // absolute index of the next output sample
    // Treat the stream as preceded by silence so the first outputs are well defined.
    this.push(new Float32Array(this.halfWidth));
    this.nextOutput = Math.ceil(this.halfWidth * this.ratio);
  }

  /**
   * Feed input samples; returns every output sample that can now be computed.
   * @param {Float32Array} chunk
   * @returns {Float32Array}
   */
  push(chunk) {
    const merged = new Float32Array(this.buffer.length + chunk.length);
    merged.set(this.buffer);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;

    const { ratio, halfWidth, kernel, bufferStart } = this;
    const available = bufferStart + merged.length;
    const out = [];
    for (;;) {
      const center = this.nextOutput / ratio;
      if (center + halfWidth >= available) break;
      const first = Math.ceil(center - halfWidth);
      const last = Math.floor(center + halfWidth);
      let acc = 0;
      let norm = 0;
      for (let i = first; i <= last; i++) {
        const pos = (i - center + halfWidth) * TABLE_RESOLUTION;
        const idx = pos | 0;
        const frac = pos - idx;
        const k = kernel[idx] + (kernel[idx + 1] - kernel[idx]) * frac;
        acc += merged[i - bufferStart] * k;
        norm += k;
      }
      out.push(norm > 0 ? acc / norm : 0);
      this.nextOutput++;
    }

    // Drop input that no future output can reach.
    const keepFrom = Math.max(bufferStart, Math.ceil(this.nextOutput / ratio - halfWidth) - 1);
    this.buffer = merged.slice(keepFrom - bufferStart);
    this.bufferStart = keepFrom;
    return Float32Array.from(out);
  }
}

/**
 * Resample a whole buffer at once (pads the end with silence so the output length is exact).
 * @returns {Float32Array} length floor(input.length * toRate / fromRate)
 */
export function resample(input, fromRate, toRate, zeroCrossings = 16) {
  if (fromRate === toRate) return Float32Array.from(input);
  const outLength = Math.floor((input.length * toRate) / fromRate);
  const r = new StreamingResampler(fromRate, toRate, zeroCrossings);
  const head = r.push(input);
  const tail = r.push(new Float32Array(r.halfWidth + 2));
  const out = new Float32Array(outLength);
  out.set(head.subarray(0, outLength));
  if (head.length < outLength) out.set(tail.subarray(0, outLength - head.length), head.length);
  return out;
}
