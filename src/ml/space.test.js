import fs from "fs";
import path from "path";
import { centroidSims, decodeSpace, nearest, placeIn3D, project, soundsLikeSpeech } from "./space";
import { MIN_EXAMPLES, loadSounds, matchTaught, prototypeOf, sanitizeSounds, saveSounds } from "./fewshot";
import { gridCells, importance, occlusionBatch } from "./saliency";
import { energyScore, loadClassifier } from "./classifier";

const root = path.join(__dirname, "../..");
const space = decodeSpace(JSON.parse(fs.readFileSync(path.join(root, "public/models/audiochi-esc50.space.json"))));
const golden = JSON.parse(fs.readFileSync(path.join(__dirname, "__fixtures__/space_golden.json")));

describe("embedding space (parity with training/audiochi_train/embedding_space.py)", () => {
  it("decodes the shipped file", () => {
    expect(space.count).toBe(2000);
    expect(space.vectors.length).toBe(2000 * space.dims);
    expect(space.xyz.length).toBe(2000 * 3);
    expect(space.centroids.length).toBe(50 * space.dims);
  });

  it("projects raw embeddings exactly like Python", () => {
    golden.embeddings.forEach((e, i) => {
      const z = project(space, e);
      golden.projected[i].forEach((v, j) => expect(z[j]).toBeCloseTo(v, 3));
    });
  });

  it("finds the same nearest ESC-50 clips as Python", () => {
    golden.embeddings.forEach((e, i) => {
      const got = nearest(space, project(space, e)).map((n) => n.index);
      // int8 ties can swap neighbours at the tail; the top 5 must match exactly.
      expect(got.slice(0, 5)).toEqual(golden.nearest[i].slice(0, 5));
    });
  });

  it("places a clip inside the map near its neighbours", () => {
    const p = placeIn3D(space, nearest(space, project(space, golden.embeddings[1])));
    p.forEach((v) => expect(Math.abs(v)).toBeLessThanOrEqual(1));
  });
});

describe("teach a sound (few-shot prototypes)", () => {
  const unit = (v) => {
    const n = Math.hypot(...v);
    return Float32Array.from(v, (x) => x / n);
  };
  const a = [unit([1, 0.1, 0]), unit([1, -0.1, 0]), unit([1, 0, 0.1])];

  it("prototype is the normalized mean", () => {
    const p = prototypeOf(a);
    expect(Math.hypot(...p)).toBeCloseTo(1, 5);
    expect(p[0]).toBeGreaterThan(0.99);
  });

  it("matches only when the taught sound beats every ESC-50 class and the floor", () => {
    const sounds = [{ name: "kettle", examples: a }];
    expect(matchTaught(unit([1, 0, 0]), sounds, 0.5, 0.6)?.name).toBe("kettle");
    expect(matchTaught(unit([1, 0, 0]), sounds, 0.9999, 0.6)).toBeNull(); // an ESC-50 class is closer
    expect(matchTaught(unit([0, 1, 0]), sounds, 0, 0.6)).toBeNull(); // too far from the prototype
  });

  it(`ignores sounds with fewer than ${MIN_EXAMPLES} examples`, () => {
    expect(matchTaught(unit([1, 0, 0]), [{ name: "x", examples: a.slice(0, 1) }], 0, 0)).toBeNull();
  });

  it("drops malformed storage instead of trusting it", () => {
    const clean = sanitizeSounds([{ name: " ok ", examples: [[1, 2, 3], [1, 2], ["x", 1, 1]] }, { name: 5 }, null], 3);
    expect(clean).toHaveLength(1);
    expect(clean[0].name).toBe("ok");
    expect(clean[0].examples).toHaveLength(1);
    expect(sanitizeSounds("nope", 3)).toEqual([]);
  });

  it("round-trips through storage and survives storage errors", () => {
    const mem = new Map();
    const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    saveSounds([{ name: "kettle", examples: a }], storage);
    expect(loadSounds(3, storage)[0].examples).toHaveLength(3);
    const broken = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("full"); } };
    expect(loadSounds(3, broken)).toEqual([]);
    expect(() => saveSounds([], broken)).not.toThrow();
  });
});

describe("occlusion saliency", () => {
  it("grid covers the whole window exactly once", () => {
    const cells = gridCells(201, 64, { timeCells: 10, melCells: 8 });
    expect(cells).toHaveLength(80);
    const seen = new Uint8Array(201 * 64);
    for (const { t0, t1, m0, m1 } of cells) for (let t = t0; t < t1; t++) for (let m = m0; m < m1; m++) seen[t * 64 + m]++;
    expect(seen.every((v) => v === 1)).toBe(true);
  });

  it("masks only the cell, with the window mean", () => {
    const data = Float32Array.from({ length: 4 * 2 }, (_, i) => i); // mean 3.5
    const cells = gridCells(4, 2, { timeCells: 2, melCells: 1 });
    const batch = occlusionBatch(data, 4, 2, cells);
    expect(Array.from(batch.subarray(0, 8))).toEqual([3.5, 3.5, 3.5, 3.5, 4, 5, 6, 7]);
    expect(Array.from(batch.subarray(8))).toEqual([0, 1, 2, 3, 3.5, 3.5, 3.5, 3.5]);
  });

  it("importance is the clipped, normalized probability drop", () => {
    expect(Array.from(importance(0.8, [0.4, 0.9, 0.6]))).toEqual([1, 0, expect.closeTo(0.5, 5)]);
  });

  it("explain runs every masked copy in one batch", async () => {
    const meta = { model: "m.onnx", labels: ["a", "b"], temperature: 1, windowSeconds: 1, sampleRate: 16000,
      nFft: 512, hop: 160, nMels: 64, fMin: 50, fMax: 8000 };
    const run = jest.fn(async ({ logmel }) => {
      const b = logmel.dims[0];
      return { logits: { data: Float32Array.from({ length: b * 2 }, (_, i) => (i % 2 ? 0 : 2)) } };
    });
    const ort = {
      InferenceSession: { create: async () => ({ run, outputNames: ["logits"] }) },
      Tensor: function Tensor(type, data, dims) { Object.assign(this, { type, data, dims }); },
    };
    const clf = await loadClassifier(ort, { fetchImpl: async () => ({ ok: true, json: async () => meta }) });
    const { weights, cells } = await clf.explain({ data: new Float32Array(101 * 64), frames: 101 }, 0);
    expect(cells).toHaveLength(80);
    expect(weights).toHaveLength(80);
    expect(run).toHaveBeenLastCalledWith({ logmel: expect.objectContaining({ dims: [80, 1, 101, 64] }) });
  });
});

describe("unknown-sound energy score", () => {
  it("equals -logsumexp and is higher for flat (unsure) logits", () => {
    expect(energyScore([0, 0])).toBeCloseTo(-Math.log(2), 6);
    expect(energyScore([1000, 0])).toBeCloseTo(-1000, 6); // no overflow
    expect(energyScore([0.1, 0.2, 0.1])).toBeGreaterThan(energyScore([9, 0.2, 0.1]));
  });
});

describe("centroids", () => {
  it("a clip is most similar to its own class centroid, and is not speech", () => {
    const vec = project(space, golden.embeddings[0]);
    const sims = centroidSims(space, vec);
    expect(sims.indexOf(Math.max(...sims))).toBe(space.labels[0]);
    expect(soundsLikeSpeech(space, vec, Math.max(...sims))).toBe(false);
  });

  it("the speech prototype itself is speech", () => {
    const vec = space.speechPrototype;
    expect(vec).not.toBeNull();
    expect(soundsLikeSpeech(space, vec, Math.max(...centroidSims(space, vec)))).toBe(true);
  });
});
