import { pushRing, ringRowIndex } from "./tunnelMath";
import { createStepClock } from "./frameClock";

describe("ringRowIndex", () => {
  it("puts bass on the floor and highs on the ceiling, mirrored with no seam", () => {
    const idx = ringRowIndex(8, 5);
    expect(Array.from(idx)).toEqual([0, 1, 2, 3, 4, 3, 2, 1, 0]);
  });
});

describe("pushRing", () => {
  it("scrolls one ring and writes the newest spectrum into the last ring", () => {
    const idx = ringRowIndex(2, 2); // [0, 1, 0]
    const disp = new Uint8Array([1, 1, 1, 2, 2, 2]);
    pushRing(disp, new Uint8Array([10, 20]), idx);
    expect(Array.from(disp)).toEqual([2, 2, 2, 10, 20, 10]);
  });
});

describe("step clock fraction", () => {
  it("reports sub-step progress for smooth motion", () => {
    const tick = createStepClock(10);
    tick(0);
    tick(150); // 1.5 steps
    expect(tick.fraction()).toBeCloseTo(0.5, 5);
  });
});
