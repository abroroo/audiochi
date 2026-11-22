import golden from "./__fixtures__/logmel_golden.json";
import { createLogMel, hzToMel, melFilterbank, melToHz } from "./logmel";
import { resample, StreamingResampler } from "./resample";
import { loadClassifier, rmsDb, softmax, topK } from "./classifier";

const config = {
  sampleRate: golden.sampleRate,
  nFft: golden.nFft,
  hop: golden.hop,
  nMels: golden.nMels,
  fMin: golden.fMin,
  fMax: golden.fMax,
};

describe("mel scale", () => {
  it("round-trips Hz through the Slaney mel scale", () => {
    for (const hz of [0, 50, 440, 999, 1000, 1001, 4000, 8000]) {
      expect(melToHz(hzToMel(hz))).toBeCloseTo(hz, 6);
    }
  });

  it("produces the same filterbank as librosa", () => {
    const bands = melFilterbank(config);
    expect(bands).toHaveLength(golden.melBands.length);
    bands.forEach((band, m) => {
      expect(band.start).toBe(golden.melBands[m].start);
      expect(band.weights).toHaveLength(golden.melBands[m].weights.length);
      band.weights.forEach((w, i) => expect(w).toBeCloseTo(golden.melBands[m].weights[i], 6));
    });
  });
});

describe("log-mel front end", () => {
  it("matches the Python training pipeline on the golden signal", () => {
    const { data, frames } = createLogMel(config)(Float32Array.from(golden.wave));
    expect(frames).toBe(golden.logmel.length);
    let maxDiff = 0;
    golden.logmel.forEach((row, t) =>
      row.forEach((v, m) => {
        maxDiff = Math.max(maxDiff, Math.abs(data[t * config.nMels + m] - v));
      })
    );
    expect(maxDiff).toBeLessThan(0.01); // dB
  });

  it("rejects input too short to pad", () => {
    expect(() => createLogMel(config)(new Float32Array(100))).toThrow(/reflect padding/);
  });
});

describe("resample", () => {
  const tone = (hz, rate, seconds) =>
    Float32Array.from({ length: rate * seconds }, (_, i) => Math.sin((2 * Math.PI * hz * i) / rate));

  it("converts length by the rate ratio", () => {
    expect(resample(new Float32Array(48000), 48000, 16000)).toHaveLength(16000);
    expect(resample(new Float32Array(44100), 44100, 16000)).toHaveLength(16000);
  });

  it("keeps an in-band tone at full amplitude", () => {
    const out = resample(tone(1000, 48000, 0.5), 48000, 16000);
    expect(rmsDb(out.subarray(1000, 7000))).toBeCloseTo(-3.01, 0); // sine RMS = -3 dBFS
  });

  it("streams chunk by chunk with the same result as one-shot resampling", () => {
    const input = tone(700, 44100, 0.5);
    const whole = resample(input, 44100, 16000);
    const r = new StreamingResampler(44100, 16000);
    const parts = [];
    for (let i = 0; i < input.length; i += 2048) parts.push(...r.push(input.subarray(i, i + 2048)));
    expect(parts.length).toBeGreaterThan(whole.length - 200);
    for (let i = 0; i < parts.length; i += 97) expect(parts[i]).toBeCloseTo(whole[i], 5);
  });

  it("is fast enough for live use (2 s of 48 kHz audio)", () => {
    const t0 = performance.now();
    resample(tone(440, 48000, 2), 48000, 16000);
    expect(performance.now() - t0).toBeLessThan(250);
  });

  it("removes content above the new Nyquist instead of aliasing it", () => {
    const out = resample(tone(12000, 48000, 0.5), 48000, 16000);
    expect(rmsDb(out.subarray(1000, 7000))).toBeLessThan(-40);
  });
});

describe("classifier helpers", () => {
  it("softmax sums to 1 and temperature flattens it", () => {
    const sharp = softmax([2, 1, 0]);
    const soft = softmax([2, 1, 0], 3);
    expect(sharp.reduce((a, b) => a + b)).toBeCloseTo(1);
    expect(soft[0]).toBeLessThan(sharp[0]);
  });

  it("softmax is stable for large logits", () => {
    expect(softmax([1000, 999]).every(Number.isFinite)).toBe(true);
  });

  it("topK returns indices in descending order", () => {
    expect(topK([0.1, 0.5, 0.2, 0.9], 2)).toEqual([3, 1]);
  });

  it("loadClassifier wires metadata, features and the ONNX session together", async () => {
    const meta = { ...config, model: "m.onnx", labels: ["a", "b"], temperature: 1, windowSeconds: 1 };
    const run = jest.fn(async ({ logmel }) => {
      expect(logmel.dims).toEqual([1, 1, 101, 64]);
      return { logits: { data: Float32Array.from([3, 0]) } };
    });
    const ort = {
      InferenceSession: { create: jest.fn(async () => ({ run })) },
      Tensor: class {
        constructor(type, data, dims) {
          Object.assign(this, { type, data, dims });
        }
      },
    };
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => meta }));
    const clf = await loadClassifier(ort, { fetchImpl });

    expect(ort.InferenceSession.create).toHaveBeenCalledWith("/models/m.onnx", expect.anything());
    expect(clf.windowSamples).toBe(16000);
    const { probs } = await clf.classify(new Float32Array(16000));
    expect(probs[0]).toBeGreaterThan(0.9);
  });

  it("loadClassifier reports a missing model", async () => {
    const fetchImpl = async () => ({ ok: false, status: 404 });
    await expect(loadClassifier({}, { fetchImpl })).rejects.toThrow(/404/);
  });
});
