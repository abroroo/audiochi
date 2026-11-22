import { createStepClock } from "./frameClock";

describe("createStepClock", () => {
  const run = (hz, seconds) => {
    const tick = createStepClock(60);
    let total = 0;
    for (let i = 0; i <= hz * seconds; i++) total += tick((i * 1000) / hz);
    return total;
  };

  it("advances at the same rate on 60 Hz and 120 Hz displays", () => {
    expect(run(60, 2)).toBeCloseTo(121, -1);
    expect(run(120, 2)).toBeCloseTo(121, -1);
    expect(Math.abs(run(60, 2) - run(120, 2))).toBeLessThanOrEqual(1);
  });

  it("caps the catch-up after a long pause", () => {
    const tick = createStepClock(60, 4);
    tick(0);
    expect(tick(10_000)).toBe(4);
  });
});
