import { buildLoudnessLut, hslToRgb, paintColumn } from "./spectrogramColors";

describe("hslToRgb", () => {
  it.each([
    [[0, 1, 0.5], [255, 0, 0]],
    [[120, 1, 0.5], [0, 255, 0]],
    [[240, 1, 0.5], [0, 0, 255]],
    [[0, 0, 1], [255, 255, 255]],
    [[0, 0, 0], [0, 0, 0]],
  ])("hsl%j → rgb %j", (hsl, rgb) => {
    expect(hslToRgb(...hsl)).toEqual(rgb);
  });

  it("wraps hues above 360°", () => {
    expect(hslToRgb(400, 1, 0.5)).toEqual(hslToRgb(40, 1, 0.5));
  });
});

describe("buildLoudnessLut", () => {
  const lut = buildLoudnessLut();

  it("has one RGB triple per byte value", () => {
    expect(lut).toHaveLength(256 * 3);
  });

  it("maps silence to dark purple and full volume to bright orange", () => {
    const [r0, g0, b0] = lut.slice(0, 3);
    expect(b0).toBeGreaterThan(g0); // purple: blue/red, no green
    expect(r0 + g0 + b0).toBeLessThan(120); // dark

    const [r, g, b] = lut.slice(255 * 3);
    expect(r).toBeGreaterThan(b); // orange: red-dominant
    expect(r + g + b).toBeGreaterThan(500); // bright
  });
});

describe("paintColumn", () => {
  const lut = buildLoudnessLut();

  it("puts low-frequency bins at the bottom of the column", () => {
    const freq = new Uint8Array([255, 0, 0, 0]); // only the lowest bin is loud
    const column = new Uint8ClampedArray(4 * 4); // 4px tall
    paintColumn(freq, column, lut);

    const bottom = Array.from(column.slice(12, 15));
    const top = Array.from(column.slice(0, 3));
    expect(bottom).toEqual(Array.from(lut.slice(255 * 3, 255 * 3 + 3)));
    expect(top).toEqual(Array.from(lut.slice(0, 3)));
  });

  it("writes fully opaque pixels even when the column is taller than the bin count", () => {
    const freq = new Uint8Array([10, 20]);
    const column = new Uint8ClampedArray(4 * 7);
    paintColumn(freq, column, lut);
    for (let y = 0; y < 7; y++) expect(column[y * 4 + 3]).toBe(255);
  });
});
