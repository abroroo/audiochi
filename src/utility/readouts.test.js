import { createFpsMeter, fmt, levelDbfs, median3 } from "./readouts";

describe("readouts", () => {
  it("median3 drops a single outlier", () => {
    expect(median3(220, 440, 221)).toBe(221);
    expect(median3(5, 1, 3)).toBe(3);
  });

  it("levelDbfs: full-scale square wave is 0 dB, half amplitude is about -6 dB, silence is -Infinity", () => {
    expect(levelDbfs(Float32Array.of(1, -1, 1, -1))).toBeCloseTo(0, 6);
    expect(levelDbfs(Float32Array.of(0.5, -0.5))).toBeCloseTo(-6.02, 2);
    expect(levelDbfs(new Float32Array(8))).toBe(-Infinity);
  });

  it("fps meter counts frames over the last second", () => {
    const tick = createFpsMeter();
    let fps = 0;
    for (let t = 0; t <= 2000; t += 1000 / 60) fps = tick(t);
    expect(fps).toBeGreaterThan(58);
    expect(fps).toBeLessThan(62);
  });

  it("fmt uses a real minus sign, units, and an em dash for missing values", () => {
    expect(fmt(-23.4, 0, "dBFS")).toBe("−23 dBFS");
    expect(fmt(440, 1, "Hz")).toBe("440.0 Hz");
    expect(fmt(null)).toBe("—");
    expect(fmt(-Infinity, 0, "dBFS")).toBe("—");
  });
});
