import { FREQUENCY_SAMPLES, fillRow, pushSpectrum, smoothRow, terrainRowMap } from "./spectrogram3d";

// OrbitControls ships as untranspiled ESM; these tests only cover the pure buffer logic.
jest.mock("three/addons/controls/OrbitControls.js", () => ({ OrbitControls: jest.fn() }));
jest.mock("./sceneKit", () => ({}));

describe("pushSpectrum", () => {
  it("scrolls history back one row and writes the newest spectrum into the last row", () => {
    const rowLength = 3;
    // 3 time steps × 3 frequency rows
    const heights = new Uint8Array([1, 1, 1, 2, 2, 2, 3, 3, 3]);
    pushSpectrum(heights, new Uint8Array([9, 8, 7, 6]), rowLength);
    expect(Array.from(heights)).toEqual([2, 2, 2, 3, 3, 3, 9, 8, 7]);
  });

  it("ignores frequency bins beyond the grid height", () => {
    const heights = new Uint8Array(4);
    pushSpectrum(heights, new Uint8Array([5, 6, 7, 8, 9]), 2);
    expect(Array.from(heights)).toEqual([0, 0, 5, 6]);
  });
});

describe("mel rows for the terrain", () => {
  it("runs low to high frequency across 40 Hz–12 kHz", () => {
    const map = terrainRowMap(1024, 48000);
    const binHz = 24000 / 1024;
    expect(map).toHaveLength(FREQUENCY_SAMPLES + 1);
    expect(map[0] * binHz).toBeLessThan(100);
    expect(map[map.length - 1] * binHz).toBeGreaterThan(11000);
    for (let j = 1; j < map.length; j++) expect(map[j]).toBeGreaterThan(map[j - 1]);
  });

  it("interpolates analyser bins onto rows", () => {
    const out = fillRow(new Uint8Array(2), new Uint8Array([0, 100, 200]), Float32Array.of(0.5, 1.75));
    expect(Array.from(out)).toEqual([50, 175]);
  });
});

describe("smoothRow", () => {
  it("blurs an isolated spike across frequency", () => {
    const row = smoothRow(new Uint8Array([0, 0, 200, 0, 0]), new Float32Array(5), 0);
    expect(Array.from(row)).toEqual([0, 50, 100, 50, 0]);
  });

  it("blends with the previous row over time", () => {
    const state = new Float32Array([100, 100, 100]);
    const row = smoothRow(new Uint8Array([0, 0, 0]), state, 0.5);
    expect(Array.from(row)).toEqual([50, 50, 50]);
  });
});
