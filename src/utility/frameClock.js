/**
 * Turns animation frames into a fixed scroll rate, so spectrograms move at the same speed on
 * 60 Hz, 120 Hz and throttled displays (requestAnimationFrame alone ties speed to refresh rate).
 *
 * @param {number} stepsPerSecond columns to advance per second
 * @param {number} [maxSteps] cap after a long pause (tab in background), so nothing jumps
 * @returns {(now: number) => number} call once per frame with a timestamp in ms; returns whole steps due
 */
export function createStepClock(stepsPerSecond, maxSteps = 4) {
  let last = null;
  let carry = 0;
  return (now) => {
    if (last === null) {
      last = now;
      return 1;
    }
    carry += ((now - last) / 1000) * stepsPerSecond;
    last = now;
    const steps = Math.floor(carry);
    carry -= steps;
    return Math.min(steps, maxSteps);
  };
}
