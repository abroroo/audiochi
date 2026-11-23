import * as k from "../iso/iso-kit.mjs";
import * as G from "../iso/lathe.mjs";
import { hzToMel } from "../spectrogramColors";
import { VIEW_RANGE, VIEW_ROWS } from "../axes";
import { REEDS, ROWS_PER_REED, ENERGY_RANGE, dialAngle, drawerOf } from "./model";

/*
 * The bench spectrograph, as a drawing. World units are about one screen px; x runs along the
 * bench, y toward the front, z up. Everything static is built once into one SVG string; the
 * parts that move (reeds, stylus carriage, needles, the open drawer, the paper) are built at a
 * rest pose and moved or rebuilt by bench.js.
 */

export const WIDTH = 640;
export const HEIGHT = 400;

// Base plate on feet.
const PLATE = { x: -228, y: -86, w: 444, d: 152, r: 8 };
const PLATE_H = 12;
const FOOT_H = 5;

// Microphone on a stand, front left.
const MIC = [-196, 26];
const MIC_Z = 68;

// Preamp box, back left, with a level dial on top.
const PRE = { x: -214, y: -76, w: 58, d: 46, r: 3 };
const PRE_H = 34;
export const LEVEL_DIAL = { c: [-185, -53], r: 14, top: PRE_H + 6 };

// Filter bank: a comb of reeds, one per mel band, behind the paper.
export const X0 = -120; // paper and reed span: column i of the paper sits under reed i
export const X1 = 60;
export const COL = (X1 - X0) / REEDS;
export const REED_Y = -61;
const BAR = { x: -126, y: -67, w: 192, d: 12, r: 2 };
const BAR_H = 12;
const CLAMP_TOP = 15;
export const REED_ROOT = CLAMP_TOP;
export const REED_TIP = 47;
const FLAG = 5;
const FRAME_TOP = 58;

// Chart recorder: bed, paper, rolls and a stylus on a rail.
const BED = { x: -128, y: -47, w: 196, d: 95, r: 3 };
const BED_H = 9;
export const PAPER_Z = BED_H + 0.3;
export const Y0 = -38; // writing edge: the newest moment
export const Y1 = 40;
const RAIL_Y = -35;
const RAIL_Z = 27;
const BACK_ROLL = { y: -43, z: BED_H, r: 4.5 };
const FRONT_ROLL = { y: 44, z: BED_H + 5, r: 6.5 };

// Classifier cabinet: 50 drawers, one per ESC-50 class, and an energy dial on top.
const CAB = { x: 100, y: -68, w: 100, d: 76, r: 2 };
export const CAB_FRONT = CAB.y + CAB.d;
const CAB_Z0 = 6;
const CAB_Z1 = 112;
export const CAB_COLS = 5;
export const CAB_ROWS = 10;
const DRAWER_W = (CAB.w - 12) / CAB_COLS;
const DRAWER_H = (CAB_Z1 - CAB_Z0 - 14) / CAB_ROWS;
export const DRAWER_OUT = 15;
export const ENERGY_DIAL = { c: [150, -30], r: 30, top: CAB_Z1 + 4 + 8 };

export const P = k.fitProjection(
  [
    ...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0),
    ...k.boxCorners(CAB, 0, ENERGY_DIAL.top + 2),
    [MIC[0], MIC[1], MIC_Z + 28],
    [CAB.x + CAB.w, CAB_FRONT + DRAWER_OUT, CAB_Z1],
  ],
  WIDTH,
  HEIGHT,
  { pad: 26, azimuth: 52, elevation: 32 },
);

const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const byDepth = (points) => [...points].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
const alongX = (o) => G.frameAlong(o, [1, 0, 0]);
const alongY = (o) => G.frameAlong(o, [0, 1, 0]);
const box = (plan, z, h, steps = 3, bevel = 0.4) => k.slabOf(plan, z, h, P, steps, bevel);

/** x of a frequency on the reed/paper axis (same mel scale as the reeds). */
export function xOfFreq(f) {
  const lo = hzToMel(VIEW_RANGE.fMin);
  const hi = hzToMel(VIEW_RANGE.fMax);
  const row = ((hzToMel(f) - lo) / (hi - lo)) * (VIEW_ROWS - 1);
  return X0 + (row / ROWS_PER_REED) * COL;
}
export const reedX = (i) => X0 + (i + 0.5) * COL;

/** A needle on a face-up dial, angle 0 toward −y, clockwise from above. */
export function needleD(dial, angle) {
  const [x, y] = dial.c;
  const s = Math.sin(angle);
  const c = Math.cos(angle);
  return k.lineOnTop([x - s * dial.r * 0.18, y + c * dial.r * 0.18], [x + s * (dial.r - 4), y - c * (dial.r - 4)], dial.top + 0.2, P);
}

function arcOnTop(cx, cy, r, a0, a1, z, steps = 32) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    pts.push([cx + Math.sin(a) * r, cy - Math.cos(a) * r]);
  }
  return k.onTop(pts, z, P);
}

function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  for (const [x, y] of byDepth(k.corners(PLATE, 22))) {
    out.push(S(k.cylinder(x, y, 7, -PLATE_H - FOOT_H, 1.6, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 5.4, -PLATE_H - FOOT_H + 1.6, FOOT_H - 1.6, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid", inner: L(k.sideSeam(PLATE, -5, P, 8), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 10);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.2, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));

  // Frequency ruler along the front, one tick per reed, aligned with the paper's columns.
  const strip = { x: X0 - 4, y: 52, w: X1 - X0 + 8, d: 7, r: 1 };
  out.push(S(box(strip, 0, 0.6, 3, 0), { tone: "lo", crease: "none" }));
  const minor = [];
  const major = [];
  for (let i = 0; i <= REEDS; i++) {
    const x = X0 + i * COL;
    (i % 4 === 0 ? major : minor).push(k.lineOnTop([x, strip.y + 0.8], [x, strip.y + 0.8 + (i % 4 === 0 ? 3.8 : 2)], 0.6, P));
  }
  out.push(L(minor.join(""), { tone: "lo" }), L(major.join(""), { tone: "mid" }));
  out.push(L(k.lineOnTop([strip.x + 0.6, strip.y + 0.8], [strip.x + strip.w - 0.6, strip.y + 0.8], 0.6, P), { tone: "lo" }));
  out.push(D([at([strip.x + 2, strip.y + 4.5, 0.6]), at([strip.x + strip.w - 2, strip.y + 4.5, 0.6])], { size: 0.45 }));

  // Label plate with the one engraved word.
  const lp = { x: -214, y: 40, w: 48, d: 16, r: 1.2 };
  out.push(S(box(lp, 0, 0.8, 4, 0.3), { tone: "lo" }));
  out.push(L(k.planOutline(k.insetPlan(lp, 1.6), 0.8, P, 4), { tone: "faint" }));
  out.push(k.faceTextSvg(k.topMatrix([lp.x + 5, lp.y + 7.2], 0.8, P, "x"), "AUDIOCHI", { size: 4.2, tone: "mid" }));
  out.push(L(k.lineOnTop([lp.x + 5, lp.y + 11.4], [lp.x + 30, lp.y + 11.4], 0.8, P), { tone: "lo", free: true }));
  out.push(D([at([lp.x + 2.4, lp.y + 8, 0.8]), at([lp.x + lp.w - 2.4, lp.y + 8, 0.8])], { size: 0.45 }));
  return out.join("");
}

function dialFace(dial, z0, count, every, { puck = "mid" } = {}) {
  const [x, y] = dial.c;
  const out = [];
  out.push(S(k.cylinder(x, y, dial.r + 1.2, z0, 2, P, 56), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, dial.r, z0 + 2, dial.top - z0 - 2, P, 64, 0.7), { tone: puck, crease: "lo" }));
  out.push(L(k.knurl(x, y, dial.r, dial.top - 3, dial.top, Math.round(dial.r * 3.6), P, 0.3), { tone: "lo" }));
  out.push(L(k.sideArc(x, y, dial.r, dial.top - 3, P, 40), { tone: "faint" }));
  out.push(L(k.ring(x, y, dial.r - 2, dial.top, P, 64), { tone: "lo" }));
  const t = k.radialTicks(x, y, dial.r - 3, count, every, dial.top, [1.2, 2.6], P, -0.75 * Math.PI, 1.5 * Math.PI);
  out.push(L(t.minor, { tone: "lo" }), L(t.major, { tone: "mid" }));
  return out.join("");
}

function preamp() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(PRE, 2), 0, 0.1, P)}" style="filter:blur(3px)"/>`];
  out.push(S(k.slabOf(PRE, 0, PRE_H, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(PRE, 6, P, 4), { tone: "faint" }) }));
  out.push(L(k.planOutline(k.insetPlan(PRE, 3.5), PRE_H, P, 4), { tone: "faint" }));
  out.push(D(k.corners(PRE, 3.6).map(([x, y]) => at([x, y, PRE_H])), { size: 0.45 }));
  // Vent slots on the right face, closed outlines in the face plane.
  const right = PRE.x + PRE.w;
  const slots = [];
  for (let i = 0; i < 6; i++) {
    const y0 = PRE.y + 8 + i * 5.4;
    slots.push(k.pathOf([at([right, y0, 14]), at([right, y0 + 2.6, 14]), at([right, y0 + 2.6, 28]), at([right, y0, 28])], true));
  }
  out.push(L(slots.join(""), { tone: "lo" }));
  // Front face: gain knob, filter knob and the mic jack.
  const front = PRE.y + PRE.d;
  for (const [x, r] of [[-203, 5], [-188, 4]]) {
    const F = alongY([x, front, 15]);
    out.push(S(G.disc(0, 1.2, r + 1.4, F, P), { tone: "lo" }));
    out.push(S(G.disc(1.2, 5.2, r, F, P), { tone: "mid", inner: k.fadedSvg(G.ribsOf(F, 1.2, 5.2, r, 28, P, { fade: [0.1, 0.55] }), { tone: "lo" }) }));
    out.push(L(G.circleOf(F, 5.2, r - 1.6, P), { tone: "faint" }));
    out.push(D([at([x, front + 5.2, 15 + r - 1.4])], { size: 0.5, tone: "hi" }));
  }
  const jackF = alongY([-169, front, 12]);
  out.push(S(G.disc(0, 2.4, 3.4, jackF, P), { tone: "mid" }));
  out.push(`<path class="iso-fill" style="fill:var(--anatomy-shade-0)" d="${G.circleOf(jackF, 2.4, 1.8, P)}"/>`);
  out.push(L(G.circleOf(jackF, 2.4, 1.8, P), { tone: "lo" }));
  out.push(dialFace(LEVEL_DIAL, PRE_H, 10, 5));
  return out.join("");
}

function reedFrame() {
  const out = [];
  const posts = [{ x: BAR.x - 7, y: BAR.y - 4, w: 6, d: 6, r: 1 }, { x: BAR.x + BAR.w + 1, y: BAR.y - 4, w: 6, d: 6, r: 1 }];
  for (const p of posts) {
    out.push(S(box(p, 0, FRAME_TOP, 3, 0.4), { tone: "mid" }));
    out.push(D([at([p.x + 3, p.y + 3, FRAME_TOP])], { size: 0.45 }));
  }
  const rail = { x: posts[0].x, y: BAR.y - 4, w: posts[1].x + posts[1].w - posts[0].x, d: 4.5, r: 1 };
  out.push(S(box(rail, FRAME_TOP - 6, 6, 3, 0.4), { tone: "mid" }));
  // Frequency scale hanging from the rail's front edge: a tick per reed, majors at 100 Hz, 1 kHz, 10 kHz.
  const face = rail.y + rail.d;
  const top = FRAME_TOP;
  const minor = [];
  for (let i = 0; i <= REEDS; i++) {
    const x = X0 + i * COL;
    minor.push(k.segment([x, face, top], [x, face, top - 1.8], P));
  }
  const major = [100, 1000, 10000].map((f) => k.segment([xOfFreq(f), face, top], [xOfFreq(f), face, top - 3.8], P));
  out.push(L(minor.join(""), { tone: "lo" }), L(major.join(""), { tone: "hi" }));
  return out.join("");
}

function comb() {
  const out = [];
  out.push(S(k.slabOf(BAR, 0, BAR_H, P, 3, 0.6), { tone: "mid", inner: L(k.sideSeam(BAR, 4, P, 3), { tone: "faint" }) }));
  const clamp = { x: BAR.x + 2, y: REED_Y - 3, w: BAR.w - 4, d: 6, r: 1 };
  out.push(S(box(clamp, BAR_H, CLAMP_TOP - BAR_H, 3, 0.4), { tone: "mid" }));
  // A clamp screw between every pair of reeds.
  const screws = [];
  for (let i = 0; i <= REEDS; i += 2) screws.push(at([X0 + i * COL, REED_Y + 1.6, CLAMP_TOP]));
  out.push(D(screws, { size: 0.42, tone: "mid" }));
  out.push(D([at([BAR.x + 3, BAR.y + 2.4, BAR_H]), at([BAR.x + BAR.w - 3, BAR.y + 2.4, BAR_H])], { size: 0.45 }));
  return out.join("");
}

/** One reed's flag (the white tip), built at the reed's rest position. */
export function flagSvg(i) {
  const x = reedX(i);
  const plan = { x: x - 1.7, y: REED_Y - 0.7, w: 3.4, d: 1.4, r: 0.3 };
  return S(box(plan, REED_TIP - FLAG, FLAG, 2, 0), { tone: "hi", crease: "lo" });
}
export const bladeD = (i, dx) => k.segment([reedX(i), REED_Y, REED_ROOT], [reedX(i) + dx, REED_Y, REED_TIP - FLAG], P);

function reeds() {
  const out = [];
  for (let i = 0; i < REEDS; i++) {
    out.push(`<path data-blade="${i}" class="iso-line" data-tone="mid" d="${bladeD(i, 0)}" style="stroke-width:0.8"/>`);
    out.push(`<g data-flag="${i}">${flagSvg(i)}</g>`);
  }
  return out.join("");
}

function cabinet() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(CAB, 1), 0, 0.1, P)}" style="filter:blur(4px)"/>`];
  const plinth = k.insetPlan(CAB, 2.5);
  out.push(S(k.slabOf(plinth, 0, CAB_Z0, P, 3, 0), { tone: "lo" }));
  out.push(S(k.slabOf(CAB, CAB_Z0, CAB_Z1 - CAB_Z0, P, 3, 0.6), { tone: "mid" }));
  const cap = k.insetPlan(CAB, -1.5);
  out.push(S(k.slabOf(cap, CAB_Z1, 4, P, 3, 0.8), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(cap, 4), CAB_Z1 + 4, P, 3), { tone: "faint" }));
  out.push(D(k.corners(cap, 3.6).map(([x, y]) => at([x, y, CAB_Z1 + 4])), { size: 0.45 }));
  // Side panel seams on the right face.
  const right = CAB.x + CAB.w;
  out.push(L([CAB.y + CAB.d / 3, CAB.y + (2 * CAB.d) / 3].map((y) => k.segment([right, y, CAB_Z0], [right, y, CAB_Z1], P)).join(""), { tone: "faint" }));
  for (let index = 0; index < CAB_COLS * CAB_ROWS; index++) out.push(`<g data-front="${index}">${drawerFrontSvg(index, 0)}</g>`);
  out.push(dialFace(ENERGY_DIAL, CAB_Z1 + 4, 18, 3, { puck: "hi" }));
  return out.join("");
}

/** Drawer slot geometry: where its front sits. */
export function drawerPlan(index) {
  const { row, col } = drawerOf(index, CAB_COLS);
  const x = CAB.x + 6 + col * DRAWER_W + 0.6;
  const z = CAB_Z1 - 8 - (row + 1) * DRAWER_H + 0.5;
  return { x, z, w: DRAWER_W - 1.2, h: DRAWER_H - 1 };
}

/** A drawer front pulled `out` units toward the viewer, with its pull and card holder. */
export function drawerFrontSvg(index, out, { lit = false } = {}) {
  const { x, z, w, h } = drawerPlan(index);
  const y = CAB_FRONT + out;
  const parts = [];
  if (out > 0.05) {
    // The drawer's box: the part that has left the cabinet (sides, floor and the card it holds).
    const body = { x: x + 0.6, y: CAB_FRONT, w: w - 1.2, d: out, r: 0.3 };
    parts.push(S(box(body, z + 0.6, h - 1.6, 2, 0), { tone: "mid", crease: "faint" }));
    parts.push(L(k.planOutline(k.insetPlan(body, 0.8), z + h - 1, P, 2), { tone: "lo" }));
  }
  const front = { x, y, w, d: 1.2, r: 0.4 };
  parts.push(S(box(front, z, h, 2, 0.3), { tone: lit ? "hi" : "mid", lit, crease: lit ? "lo" : "faint" }));
  // Card holder (a closed frame) and the pull, in the plane of the front.
  const fy = y + 1.2;
  const hx0 = x + w * 0.22;
  const hx1 = x + w * 0.78;
  const holder = k.pathOf([at([hx0, fy, z + h * 0.78]), at([hx1, fy, z + h * 0.78]), at([hx1, fy, z + h * 0.52]), at([hx0, fy, z + h * 0.52])], true);
  parts.push(L(holder, { tone: lit ? "hi" : "lo" }));
  parts.push(D([at([x + w / 2, fy, z + h * 0.28])], { size: 0.55, tone: lit ? "hi" : "mid" }));
  return parts.join("");
}

export function thresholdSvg(threshold) {
  const { c, r, top } = ENERGY_DIAL;
  const a = dialAngle(threshold, ENERGY_RANGE);
  const zone = arcOnTop(c[0], c[1], r - 7.5, a, 0.75 * Math.PI, top);
  const tick = k.lineOnTop([c[0] + Math.sin(a) * (r - 9.5), c[1] - Math.cos(a) * (r - 9.5)], [c[0] + Math.sin(a) * (r - 2.2), c[1] - Math.cos(a) * (r - 2.2)], top, P);
  return `${L(zone, { tone: "mid" }).replace("<path ", '<path style="stroke-width:1.6" ')}${L(tick, { tone: "hi" }).replace("<path ", '<path style="stroke-width:1" ')}${L(k.ring(c[0], c[1], 2, top, P, 20), { tone: "mid" })}`;
}

// "No match" lamp in front of the cabinet: lit when the energy score rejects the sound.
const LAMP = [150, 38];
function lamp(lit) {
  const [x, y] = LAMP;
  const out = [];
  out.push(S(k.cylinder(x, y, 7, 6, 8, P, 40, 0.5), { tone: lit ? "hi" : "mid", lit, crease: lit ? "lo" : "faint" }));
  out.push(L(k.ring(x, y, 4.6, 14, P, 32), { tone: lit ? "hi" : "lo" }));
  out.push(L(k.sideArc(x, y, 7, 10, P, 32), { tone: "faint" }));
  return out.join("");
}
function lampBase() {
  const [x, y] = LAMP;
  const base = { x: x - 12, y: y - 9, w: 24, d: 18, r: 2 };
  const out = [`<path class="iso-halo" d="${k.haloOf(base, 0, 0.1, P)}" style="filter:blur(3px)"/>`];
  out.push(S(box(base, 0, 4, 3, 0.5), { tone: "mid" }));
  out.push(D(k.corners(base, 2.6).map(([cx, cy]) => at([cx, cy, 4])), { size: 0.45 }));
  out.push(S(k.cylinder(x, y, 8.4, 4, 2, P, 40), { tone: "mid" }));
  return out.join("");
}

function recorderBack() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(BED, 2), 0, 0.1, P)}" style="filter:blur(4px)"/>`];
  out.push(S(k.slabOf(BED, 0, BED_H, P, 4, 0.8), { tone: "mid", inner: L(k.sideSeam(BED, 3, P, 4), { tone: "faint" }) }));
  // The paper's blank sheet; the live spectrogram image lies on it.
  const sheet = { x: X0, y: BACK_ROLL.y, w: X1 - X0, d: FRONT_ROLL.y - BACK_ROLL.y, r: 0 };
  out.push(S(k.slabOf(sheet, BED_H, 0.3, P, 1, 0), { tone: "lo", flat: true }));
  return out.join("");
}

function roll({ y, z, r }, core) {
  const out = [];
  const blocks = [X0 - 8, X1 + 1.5];
  for (const bx of blocks) {
    const plan = { x: bx, y: y - 5, w: 6.5, d: 10, r: 1 };
    out.push(S(box(plan, BED_H, z - BED_H + r + 2, 3, 0.4), { tone: "mid" }));
  }
  const F = alongX([X0 - 1.5, y, z]);
  out.push(S(G.disc(0, 1.2, r + 2, F, P), { tone: "mid" }));
  out.push(S(G.disc(1.2, X1 - X0 + 1.8, core ?? r, F, P), { tone: "hi", crease: "lo" }));
  out.push(S(G.disc(X1 - X0 + 1.8, X1 - X0 + 3, r + 2, F, P), { tone: "mid" }));
  out.push(D([at([X1 + 4.75, y, z + r + 1.6])], { size: 0.45 }));
  return out.join("");
}

function stylusFrame() {
  const out = [];
  const posts = [{ x: BED.x - 7, y: RAIL_Y - 2.5, w: 5, d: 5, r: 1 }, { x: BED.x + BED.w + 2, y: RAIL_Y - 2.5, w: 5, d: 5, r: 1 }];
  for (const p of posts) {
    out.push(S(box(p, 0, RAIL_Z + 4, 3, 0.4), { tone: "mid" }));
    out.push(D([at([p.x + 2.5, p.y + 2.5, RAIL_Z + 4])], { size: 0.45 }));
  }
  const rail = { x: posts[0].x + 1, y: RAIL_Y - 1.5, w: posts[1].x + posts[1].w - posts[0].x - 2, d: 3, r: 1.2 };
  out.push(S(box(rail, RAIL_Z, 3, 3, 0.3), { tone: "mid", crease: "none" }));
  return out.join("");
}

/** Stylus carriage at x = 0; bench.js slides it along the rail to the loudest reed. */
export function carriageSvg() {
  const out = [];
  const body = { x: -6, y: RAIL_Y - 4.5, w: 12, d: 9, r: 1.6 };
  out.push(S(box(body, RAIL_Z - 3, 9, 3, 0.5), { tone: "mid" }));
  out.push(D([at([-3.5, RAIL_Y + 3, RAIL_Z + 6]), at([3.5, RAIL_Y + 3, RAIL_Z + 6])], { size: 0.42 }));
  // Pen arm reaching back to the writing edge, and the pen.
  const arm = { x: -1.6, y: Y0 - 1, w: 3.2, d: RAIL_Y - 4.5 - Y0 + 1.5, r: 0.6 };
  out.push(S(box(arm, RAIL_Z - 2, 2.4, 2, 0), { tone: "mid" }));
  out.push(S(k.cylinder(0, Y0, 1.3, PAPER_Z + 2.5, RAIL_Z - 2 - PAPER_Z - 2.5, P, 20), { tone: "hi", crease: "lo" }));
  out.push(S(k.cylinder(0, Y0, 0.6, PAPER_Z, 2.5, P, 14), { tone: "hi" }));
  return out.join("");
}

function crank() {
  const { y, z } = FRONT_ROLL;
  const F = alongX([X1 + 8, y, z]);
  const out = [];
  out.push(S(G.disc(0, 3, 2.2, F, P), { tone: "mid" }));
  const arm = { x: X1 + 11, y: y - 2, w: 2.4, d: 13, r: 1 };
  out.push(S(box(arm, z - 2, 4, 2, 0.3), { tone: "mid" }));
  out.push(S(k.cylinder(X1 + 12.2, y + 9, 2.2, z + 2, 6, P, 18), { tone: "mid" }));
  out.push(L(k.knurl(X1 + 12.2, y + 9, 2.2, z + 2, z + 8, 16, P), { tone: "lo" }));
  return out.join("");
}

function micStand() {
  const [x, y] = MIC;
  const out = [`<path class="iso-halo" d="${k.haloOf({ x: x - 12, y: y - 12, w: 24, d: 24, r: 12 }, 0, 0.1, P)}" style="filter:blur(3px)"/>`];
  out.push(S(k.cylinder(x, y, 13, 0, 3, P, 56, 0.7), { tone: "mid" }));
  out.push(L(k.ring(x, y, 9.5, 3, P, 48), { tone: "faint" }));
  out.push(S(k.cylinder(x, y, 4, 3, 3, P, 24), { tone: "mid" }));
  out.push(S(k.cylinder(x, y, 1.5, 6, 34, P, 16), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(x, y, 2.8, 40, 4, P, 20), { tone: "mid" }));
  out.push(L(k.knurl(x, y, 2.8, 40, 44, 14, P), { tone: "lo" }));
  out.push(S(k.cylinder(x, y, 1.5, 44, MIC_Z - 44 - 4, P, 16), { tone: "mid", crease: "none" }));
  out.push(S(k.cylinder(x, y, 4.2, MIC_Z - 4, 4, P, 24), { tone: "mid" }));
  // Capsule with its grille.
  out.push(S(k.cylinder(x, y, 7, MIC_Z, 24, P, 40, 0.6), { tone: "hi", crease: "lo" }));
  out.push(L(k.knurl(x, y, 7, MIC_Z + 3, MIC_Z + 21, 30, P, 0.3), { tone: "lo" }));
  out.push(L([MIC_Z + 3, MIC_Z + 21].map((z) => k.sideArc(x, y, 7, z, P, 32)).join(""), { tone: "lo" }));
  out.push(S(k.cylinder(x, y, 5.4, MIC_Z + 24, 3, P, 32, 0.4), { tone: "hi", crease: "lo" }));
  out.push(D(k.pointsAt(Array.from({ length: 12 }, (_, i) => [x + Math.cos((i / 12) * 2 * Math.PI) * 3, y + Math.sin((i / 12) * 2 * Math.PI) * 3, MIC_Z + 27]), P), { size: 0.4, tone: "lo" }));
  return out.join("");
}

const wire = (points, opts) => k.wireSvg(at(points[0]), at(points[points.length - 1]), { via: points.slice(1, -1).map(at), tone: "lo", size: 1, ...opts });

function micCable() {
  const [x, y] = MIC;
  return wire([[x + 9, y - 9, 1.5], [x + 14, y - 30, 0], [-169, PRE.y + PRE.d + 12, 0], [-169, PRE.y + PRE.d + 2.4, 12]]);
}
function signalCables() {
  return [
    wire([[PRE.x + PRE.w, -50, 8], [PRE.x + PRE.w + 8, -50, 0], [BAR.x - 12, REED_Y + 12, 0], [BAR.x + 4, BAR.y + BAR.d, 6]]),
    wire([[BAR.x + BAR.w, REED_Y, 6], [BAR.x + BAR.w + 18, REED_Y, 0], [86, REED_Y, 0], [86, CAB_FRONT - 2, 0], [CAB.x + 4, CAB_FRONT - 2.5, 3]]),
  ].join("");
}

/** The whole static drawing, with slots for the live parts. */
export function buildScene({ threshold }) {
  const body = [
    plate(),
    preamp(),
    micCable(),
    `<path data-part="level-needle" class="iso-line" data-tone="hi" data-free="start" d="${needleD(LEVEL_DIAL, dialAngle(0, [0, 1]))}" style="stroke-width:1"/>`,
    micStand(),
    reedFrame(),
    comb(),
    reeds(),
    signalCables(),
    cabinet(),
    thresholdSvg(threshold),
    `<path data-part="energy-needle" class="iso-line" data-tone="hi" data-free="start" d="${needleD(ENERGY_DIAL, dialAngle(ENERGY_RANGE[0], ENERGY_RANGE))}" style="stroke-width:1.2"/>`,
    `<g data-part="drawer"></g>`,
    wire([[CAB.x + 50, CAB_FRONT - 2.5, 2], [CAB.x + 50, LAMP[1] - 9, 0], [LAMP[0] - 12, LAMP[1] - 6, 2]]),
    lampBase(),
    `<g data-part="lamp-off">${lamp(false)}</g><g data-part="lamp-on" style="display:none">${lamp(true)}</g>`,
    recorderBack(),
    `<image data-part="paper" preserveAspectRatio="none" width="1" height="1" transform="${paperMatrix()}" style="image-rendering:auto"/>`,
    roll(BACK_ROLL),
    stylusFrame(),
    `<g data-part="carriage" transform="${k.translateAlong(P, [reedX(REEDS / 2), 0, 0])}">${carriageSvg()}</g>`,
    roll(FRONT_ROLL, FRONT_ROLL.r),
    crank(),
  ];
  return k.figureSvg({
    width: WIDTH,
    height: HEIGHT,
    label:
      "A bench spectrograph. A microphone feeds a preamp; a comb of 32 reeds, one per mel band, shakes with each band's energy; a chart recorder writes the bands as a spectrogram on moving paper, its stylus riding to the loudest band; a cabinet of 50 drawers, one per sound class, opens the drawer the network picks, and a dial on top reads the energy score against the unknown-sound threshold.",
    body,
  });
}

/** Maps the unit square of the paper image onto the paper on the bed: u along x, v from the writing edge toward the front. */
export function paperMatrix() {
  const o = at([X0, Y0, PAPER_Z]);
  const u = at([X1, Y0, PAPER_Z]);
  const v = at([X0, Y1, PAPER_Z]);
  return `matrix(${u[0] - o[0]} ${u[1] - o[1]} ${v[0] - o[0]} ${v[1] - o[1]} ${o[0]} ${o[1]})`;
}

export { k };
