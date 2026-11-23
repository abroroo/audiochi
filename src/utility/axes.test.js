import {
  HZ_TICKS, NOTE_TICKS, VIEW_ROWS, WALL_ROWS, WALL_SECONDS,
  smoothRow, timeTicks, viewRowMap, wallRowForFreq, wallRowMap, wallTopFraction,
} from "./axes";

describe("wall axis geometry", () => {
  it("puts 40 Hz on the bottom row and 16 kHz on the top row", () => {
    expect(wallRowForFreq(40)).toBeCloseTo(0, 6);
    expect(wallRowForFreq(16000)).toBeCloseTo(WALL_ROWS - 1, 6);
  });

  it("places tick labels at the centre of the row that shows their frequency", () => {
    // Row r is drawn in the band [r, r+1) counted from the bottom; its centre is r + 0.5.
    expect(wallTopFraction(40)).toBeCloseTo(1 - 0.5 / WALL_ROWS, 6);
    expect(wallTopFraction(16000)).toBeCloseTo(0.5 / WALL_ROWS, 6);
  });

  it("agrees with the analyser row map: the tick for f sits on the row that samples f", () => {
    const sr = 48000;
    const bins = 2048;
    const binHz = sr / 2 / bins;
    const map = wallRowMap(bins, sr);
    for (const [f] of HZ_TICKS.slice(0, -1)) {
      const row = Math.round(wallRowForFreq(f));
      expect(map[row] * binHz).toBeGreaterThan(f * 0.95);
      expect(map[row] * binHz).toBeLessThan(f * 1.05);
    }
  });

  it("gives the 40 Hz–1 kHz range far more room than a linear axis would", () => {
    expect(1 - wallTopFraction(1000)).toBeGreaterThan(0.25); // linear would give ~6%
  });

  it("orders every tick from low (bottom) to high (top)", () => {
    const tops = [...HZ_TICKS, ...NOTE_TICKS].sort((a, b) => a[0] - b[0]).map(([f]) => wallTopFraction(f));
    for (let i = 1; i < tops.length; i++) expect(tops[i]).toBeLessThan(tops[i - 1]);
  });

  it("labels time in seconds ago, newest at the right edge", () => {
    const ticks = timeTicks(10, 2);
    expect(ticks.map((t) => t.seconds)).toEqual([0, 2, 4, 6, 8, 10]);
    expect(ticks[0].left).toBe(1);
    expect(ticks[5].left).toBeCloseTo(0, 9);
    expect(timeTicks().at(-1).seconds).toBeLessThanOrEqual(WALL_SECONDS);
  });
});

describe("3D view rows", () => {
  it("runs low to high frequency across 40 Hz–12 kHz", () => {
    const map = viewRowMap(2048, 48000);
    const binHz = 24000 / 2048;
    expect(map).toHaveLength(VIEW_ROWS);
    expect(map[0] * binHz).toBeLessThan(100);
    expect(map[map.length - 1] * binHz).toBeGreaterThan(11000);
    for (let j = 1; j < map.length; j++) expect(map[j]).toBeGreaterThan(map[j - 1]);
  });

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
