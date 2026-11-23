import { REEDS, dialAngle, drawerOf, hzText, overallLevel, peakReed, reedFrequency, reedLevels, verdictOf } from "./model";

describe("bench model", () => {
  it("averages mel rows into 32 reeds, bass first", () => {
    const row = new Uint8Array(129);
    row.fill(255, 0, 4);
    const levels = reedLevels(row);
    expect(levels).toHaveLength(REEDS);
    expect(levels[0]).toBeCloseTo(1);
    expect(levels[1]).toBe(0);
  });

  it("reed frequencies rise on the mel scale within 40 Hz–12 kHz", () => {
    expect(reedFrequency(0)).toBeGreaterThan(40);
    expect(reedFrequency(REEDS - 1)).toBeLessThan(12000);
    for (let i = 1; i < REEDS; i++) expect(reedFrequency(i)).toBeGreaterThan(reedFrequency(i - 1));
  });

  it("finds the loudest reed, or none below the floor", () => {
    expect(peakReed(new Float32Array([0.1, 0.5, 0.3]))).toBe(1);
    expect(peakReed(new Float32Array([0.05, 0.1]))).toBeNull();
    expect(overallLevel(new Float32Array([0.2, 0.4]))).toBeCloseTo(0.3);
  });

  it("maps values onto a 270° dial and clamps", () => {
    expect(dialAngle(-18, [-18, 0])).toBeCloseTo(-0.75 * Math.PI);
    expect(dialAngle(0, [-18, 0])).toBeCloseTo(0.75 * Math.PI);
    expect(dialAngle(5, [-18, 0])).toBeCloseTo(0.75 * Math.PI);
  });

  it("fills drawers row by row", () => {
    expect(drawerOf(0)).toEqual({ row: 0, col: 0 });
    expect(drawerOf(42)).toEqual({ row: 8, col: 2 });
  });

  it("opens the predicted drawer only for a known sound", () => {
    const labels = ["dog", "rooster"];
    const known = verdictOf({ top: 1, probs: [0.1, 0.9], energy: -9, unknown: false }, labels, -5.45);
    expect(known).toMatchObject({ drawer: 1, known: true });
    expect(known.text).toContain("rooster 90%");
    const unknown = verdictOf({ top: 0, probs: [0.6, 0.4], energy: -3, unknown: true }, labels, -5.45);
    expect(unknown).toMatchObject({ drawer: null, known: false });
    expect(unknown.text).toMatch(/^unknown/);
    expect(verdictOf({ quiet: true }, labels, -5.45).drawer).toBeNull();
    expect(verdictOf(null, labels, -5.45).text).toBe("listening…");
  });

  it("formats Hz", () => {
    expect(hzText(950)).toBe("950 Hz");
    expect(hzText(1234)).toBe("1.2 kHz");
  });
});
