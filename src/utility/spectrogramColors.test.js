import { buildLoudnessLut, buildRowMap, freqToY, hslToRgb, magma, paintColumn } from "./spectrogramColors";

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

  it("maps silence to dark violet and full volume to bright yellow (magma)", () => {
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

describe("magma", () => {
  it("matches matplotlib's endpoints and midpoint within a few levels", () => {
    // matplotlib magma: 0 -> #000004, 0.5 -> #b73779, 1 -> #fcfdbf
    const close = (a, b) => a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThanOrEqual(6));
    close(magma(0), [0, 0, 4]);
    close(magma(0.5), [183, 55, 121]);
    close(magma(1), [252, 253, 191]);
  });

  it("gets brighter monotonically, so loudness reads correctly even in greyscale", () => {
    const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
    for (let t = 0.05; t <= 1; t += 0.05) expect(luma(magma(t))).toBeGreaterThanOrEqual(luma(magma(t - 0.05)) - 0.5);
  });
});

describe("mel axis", () => {
  it("maps the top row near fMax and the bottom row near fMin", () => {
    const map = buildRowMap(100, 2048, 48000, { fMin: 40, fMax: 16000 });
    const binHz = 24000 / 2048;
    expect(map[0] * binHz).toBeGreaterThan(15000);
    expect(map[99] * binHz).toBeLessThan(80);
    for (let y = 1; y < 100; y++) expect(map[y]).toBeLessThan(map[y - 1]);
  });

  it("gives the 40 Hz–1 kHz range far more rows than a linear axis would", () => {
    const y1k = freqToY(1000, 1000);
    expect(1000 - y1k).toBeGreaterThan(250); // linear would give 1000 * 1/16 ≈ 60 rows
  });

  it("interpolates between bins", () => {
    const lut = buildLoudnessLut();
    const column = new Uint8ClampedArray(4);
    paintColumn(new Uint8Array([0, 200]), column, lut, Float32Array.of(0.5));
    expect(Array.from(column.slice(0, 3))).toEqual(Array.from(lut.slice(100 * 3, 100 * 3 + 3)));
  });
});
