import { detectPitch, freqToNote, midiToFreq } from "./pitch";

const sr = 48000;
const tone = (f, n = 2048, harmonics = [1]) =>
  Float32Array.from({ length: n }, (_, i) => harmonics.reduce((s, a, k) => s + (a * Math.sin(2 * Math.PI * f * (k + 1) * i / sr)) / (k + 1), 0) * 0.4);

describe("detectPitch (YIN)", () => {
  it.each([110, 220, 440, 659.25, 987.77])("finds a %f Hz sine within 0.5%", (f) => {
    const p = detectPitch(tone(f), sr);
    expect(Math.abs(p.freq - f) / f).toBeLessThan(0.005);
    expect(p.clarity).toBeGreaterThan(0.9);
  });

  it("finds the fundamental of a harmonic-rich tone, not an overtone", () => {
    const p = detectPitch(tone(196, 2048, [1, 0.8, 0.6, 0.5]), sr);
    expect(Math.abs(p.freq - 196)).toBeLessThan(2);
  });

  it("returns null for silence and for noise", () => {
    expect(detectPitch(new Float32Array(2048), sr)).toBeNull();
    let seed = 1;
    const noise = Float32Array.from({ length: 2048 }, () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.5);
    expect(detectPitch(noise, sr)).toBeNull();
  });
});

describe("freqToNote", () => {
  it("names notes and cents", () => {
    expect(freqToNote(440)).toEqual({ name: "A4", cents: 0 });
    expect(freqToNote(261.63).name).toBe("C4");
    expect(freqToNote(445).cents).toBe(20);
    expect(midiToFreq(60)).toBeCloseTo(261.63, 1);
  });
});
