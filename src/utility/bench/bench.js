import { ISO_CSS, translateAlong } from "../iso/iso-kit.mjs";
import {
  CAB_COLS, DRAWER_OUT, ENERGY_DIAL, LEVEL_DIAL, P, buildScene, bladeD, drawerFrontSvg, needleD, reedX,
} from "./scene";
import { ENERGY_RANGE, REEDS, dialAngle, hzText, overallLevel, peakReed, reedFrequency, reedLevels, verdictOf } from "./model";
import { plateHtml } from "../iso/iso-kit.mjs";

const PAPER_COLS = REEDS;
const PAPER_ROWS = 80; // 4 s of history at 20 steps a second
const STYLE_ID = "iso-kit-css";

const BENCH_CSS = `
.bench{height:100%;overflow-y:auto;padding:12px 16px 20px;--anatomy-page:transparent}
.bench .iso-figure{margin:0 auto;max-width:980px}
.bench .iso-plate{background:var(--anatomy-card)}
.bench svg{display:block;width:100%;height:auto}
.bench [data-corner="readout"]{font-variant-numeric:tabular-nums}
`;

/**
 * "How it works": the bench spectrograph figure as a live view. Same interface as the other
 * views (update / setFraction / clear / dispose) plus setResult for the classifier.
 *
 * @param {HTMLElement} container
 * @param {{ threshold: number, labels: string[] }} options
 */
export function createBench(container, { threshold, labels = [] }) {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = ISO_CSS + BENCH_CSS;
    document.head.appendChild(style);
  }
  const root = document.createElement("div");
  root.className = "bench iso";
  root.dataset.theme = "dark";
  root.innerHTML = plateHtml({
    fig: "Fig 1",
    title: "Bench spectrograph",
    hint: "Play a sample or use the mic",
    readout: "listening…",
    keys: [
      { mark: "raised", label: "32 reeds: one per mel band, each shakes with its band's energy" },
      { mark: "flat", label: "Paper: the bands over the last 4 s, newest at the stylus" },
      { mark: "lit", label: "The drawer the network picks, of 50, or the no-match lamp" },
    ],
    caption:
      "Sound comes in at the mic and is split into mel bands, the way the reeds split it. The paper keeps those bands over time: that picture is a spectrogram. The network reads its own 2 s, 64-band version of it every half second and opens one of 50 drawers. The dial on top reads the energy score; past the heavier arc (−5.45) the sound is unlike anything it was trained on: no drawer opens and the lamp in front lights.",
    body: `<div class="iso-stage">${buildScene({ threshold })}</div>`,
  });
  container.appendChild(root);

  const svg = root.querySelector("svg");
  // Fit the card to the stage height, so the whole machine and its readout are in view; the legend scrolls below.
  const figure = root.querySelector(".iso-figure");
  const fit = () => {
    const h = container.clientHeight || 600;
    figure.style.maxWidth = `${Math.max(320, Math.min(1100, (h - 28) * 1.5))}px`;
  };
  fit();
  const sizer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
  sizer?.observe(container);
  const q = (part) => svg.querySelector(`[data-part="${part}"]`);
  const readout = root.querySelector("[data-readout]");
  const blades = [...svg.querySelectorAll("[data-blade]")];
  const flags = [...svg.querySelectorAll("[data-flag]")];
  const fronts = [...svg.querySelectorAll("[data-front]")];
  const carriage = q("carriage");
  const drawerSlot = q("drawer");
  const paperImage = q("paper");
  const levelNeedle = q("level-needle");
  const energyNeedle = q("energy-needle");
  const lampOn = q("lamp-on");
  const lampOff = q("lamp-off");
  const setLamp = (on) => {
    lampOn.style.display = on ? "" : "none";
    lampOff.style.display = on ? "none" : "";
  };

  // The paper is a small canvas: one column per reed, one row per step, scrolled toward the front.
  const paper = document.createElement("canvas");
  paper.width = PAPER_COLS;
  paper.height = PAPER_ROWS;
  const pen = paper.getContext("2d");
  pen.fillStyle = "#16161a";
  pen.fillRect(0, 0, PAPER_COLS, PAPER_ROWS);
  const line = pen.createImageData(PAPER_COLS, 1);
  let paperDirty = true;
  let lastPaper = 0;

  const levels = new Float32Array(REEDS);
  const swing = new Float32Array(REEDS); // eased reed amplitude
  let carriageX = reedX(REEDS / 2);
  let carriageTarget = carriageX;
  let peakHz = null;
  let level = 0;
  let levelShown = 0;
  let energy = ENERGY_RANGE[0];
  let energyShown = energy;
  let drawer = null; // { index, out, target }
  let verdict = { text: "listening…" };
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  function setDrawer(index) {
    if (drawer && drawer.index === index) {
      drawer.target = DRAWER_OUT;
      return;
    }
    if (drawer) drawer.target = 0; // the old one closes first, then the new one opens
    if (index !== null) drawer = drawer && drawer.out > 0.2 ? { ...drawer, next: index } : { index, out: 0, target: DRAWER_OUT };
    else if (drawer) drawer.next = null;
  }

  function drawDrawer() {
    if (!drawer) {
      drawerSlot.innerHTML = "";
      return;
    }
    fronts.forEach((f, i) => (f.style.display = i === drawer.index && drawer.out > 0.05 ? "none" : ""));
    drawerSlot.innerHTML = drawer.out > 0.05 ? drawerFrontSvg(drawer.index, drawer.out, { lit: true }) : "";
  }

  let last = performance.now();
  let frame = 0;
  let visible = true;
  const loop = (now) => {
    frame = requestAnimationFrame(loop);
    if (!visible) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const ease = (tau) => (reduced ? 1 : 1 - Math.exp(-dt / tau));
    const t = now / 1000;

    // Reeds: amplitude follows the band energy; the blur of a shaking reed is drawn as a sway.
    for (let i = 0; i < REEDS; i++) {
      swing[i] += (levels[i] - swing[i]) * ease(0.08);
      const dx = reduced ? 0 : swing[i] * 2.6 * Math.sin(t * (38 + i * 1.7) + i);
      blades[i].setAttribute("d", bladeD(i, dx));
      flags[i].setAttribute("transform", translateAlong(P, [dx, 0, 0]));
    }
    carriageX += (carriageTarget - carriageX) * ease(0.18);
    carriage.setAttribute("transform", translateAlong(P, [carriageX, 0, 0]));
    levelShown += (level - levelShown) * ease(0.15);
    levelNeedle.setAttribute("d", needleD(LEVEL_DIAL, dialAngle(levelShown, [0, 0.6])));
    energyShown += (energy - energyShown) * ease(0.35);
    energyNeedle.setAttribute("d", needleD(ENERGY_DIAL, dialAngle(energyShown, ENERGY_RANGE)));

    if (drawer) {
      drawer.out += (drawer.target - drawer.out) * ease(0.22);
      if (drawer.target === 0 && drawer.out < 0.05) {
        fronts[drawer.index].style.display = "";
        drawer = drawer.next != null ? { index: drawer.next, out: 0, target: DRAWER_OUT } : null;
      }
      drawDrawer();
    }

    if (paperDirty && now - lastPaper > 66) {
      lastPaper = now;
      paperDirty = false;
      paperImage.setAttribute("href", paper.toDataURL());
    }
  };
  frame = requestAnimationFrame(loop);

  const observer = typeof IntersectionObserver !== "undefined" ? new IntersectionObserver((e) => (visible = e[e.length - 1].isIntersecting)) : null;
  observer?.observe(root);

  const say = () => {
    const text = `${verdict.text}${peakHz ? ` · peak ${hzText(peakHz)}` : ""}`;
    if (readout.textContent !== text) readout.textContent = text;
  };

  return {
    kind: "bench",
    update(row) {
      reedLevels(row, levels);
      level = overallLevel(levels);
      const peak = peakReed(levels);
      if (peak !== null) {
        carriageTarget = reedX(peak);
        peakHz = reedFrequency(peak);
      } else peakHz = null;
      // Scroll the paper one row toward the front and write the newest bands at the stylus.
      pen.drawImage(paper, 0, 0, PAPER_COLS, PAPER_ROWS - 1, 0, 1, PAPER_COLS, PAPER_ROWS - 1);
      for (let i = 0; i < PAPER_COLS; i++) {
        const v = Math.pow(levels[i], 1.3);
        line.data[i * 4] = 22 + v * 225;
        line.data[i * 4 + 1] = 22 + v * 215;
        line.data[i * 4 + 2] = 26 + v * 200;
        line.data[i * 4 + 3] = 255;
      }
      pen.putImageData(line, 0, 0);
      paperDirty = true;
      say();
    },
    setResult(result) {
      verdict = verdictOf(result, labels, threshold);
      if (verdict.energy !== null) energy = verdict.energy;
      setDrawer(verdict.drawer);
      setLamp(verdict.known === false || !!result?.unknown);
      say();
    },
    setLabels(next) {
      labels = next;
    },
    setFraction() {},
    clear() {
      levels.fill(0);
      level = 0;
      peakHz = null;
      verdict = { text: "listening…" };
      setDrawer(null);
      setLamp(false);
      say();
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      sizer?.disconnect();
      root.remove();
    },
  };
}

export const BENCH_COLS = CAB_COLS;
export { ENERGY_DIAL };
