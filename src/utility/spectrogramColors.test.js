import { buildLoudnessLut, buildRowMap, fillRow, magma } from "./spectrogramColors";

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

  it("interpolates analyser bins onto rows", () => {
    const out = fillRow(new Uint8Array(2), new Uint8Array([0, 100, 200]), Float32Array.of(0.5, 1.75));
    expect(Array.from(out)).toEqual([50, 175]);
  });
});
