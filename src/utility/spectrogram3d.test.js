import { pushSpectrum } from "./spectrogram3d";

// OrbitControls ships as untranspiled ESM; these tests only cover the pure buffer logic.
jest.mock("three/addons/controls/OrbitControls.js", () => ({ OrbitControls: jest.fn() }));

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
