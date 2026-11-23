import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { createBloom, disposeSprite, labelSprite } from "./sceneKit";
import { magma } from "./spectrogramColors";

const LINES = 64;
const WIDTH = 22;
const SPACING = 0.62; // depth between consecutive moments
const HEIGHT = 3.4;
const DEPTH = (LINES - 1) * SPACING;
const BACKGROUND = 0x07060c;
const BG = new THREE.Color(BACKGROUND).toArray();

/** How far the top of a fill moves from the background toward the ridge colour, for a level 0..255. */
export function fillTopMix(v) {
  return 0.12 + 0.38 * (v / 255);
}

/**
 * Ridgeline: each moment of the spectrum is one glowing line (bass on the left, highs on the
 * right) with a magma gradient fill below it that fades to the background. The fills are opaque,
 * so nearer ridges hide the ones behind them. Older moments recede; the whole object can be
 * orbited and zoomed. Recognized sounds are pinned above the peak of the moment they were heard.
 *
 * @returns {{ kind: "rows", update(row: Uint8Array): void, setFraction(f: number): void, addLabel(text: string, color?: string): void,
 *             clear(): void, resetView(): void, dispose(): void }}
 */
export function createRidgeline(container, { rows }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  scene.fog = new THREE.Fog(BACKGROUND, 20, 60);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(0, 9, 15);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.2, -DEPTH * 0.42);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 12;
  controls.maxDistance = 75;
  controls.minPolarAngle = 0.08 * Math.PI; // almost top-down...
  controls.maxPolarAngle = 0.49 * Math.PI; // ...to just above the floor, never underneath
  controls.rotateSpeed = 0.6;
  controls.update();
  controls.saveState();

  const flow = new THREE.Group();
  scene.add(flow);
  const fillMaterial = new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const lineMaterial = new THREE.LineBasicMaterial({ vertexColors: true });

  // Ring of reusable lines; lines[k] is a group holding one ridge and its fill.
  const lines = [];
  for (let k = 0; k < LINES; k++) {
    const linePos = new Float32Array(rows * 3);
    const lineCol = new Float32Array(rows * 3);
    const fillPos = new Float32Array(rows * 2 * 3);
    const fillCol = new Float32Array(rows * 2 * 3);
    for (let j = 0; j < rows; j++) {
      const x = -WIDTH / 2 + (WIDTH * j) / (rows - 1);
      linePos[j * 3] = x;
      fillPos[j * 6] = x;
      fillPos[j * 6 + 3] = x;
      fillPos[j * 6 + 4] = -0.02; // fill runs down to just below the baseline
      fillCol.set(BG, j * 6);
      fillCol.set(BG, j * 6 + 3); // bottom of the fill is always the background
    }
    const lineGeom = new THREE.BufferGeometry();
    lineGeom.setAttribute("position", new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage));
    lineGeom.setAttribute("color", new THREE.BufferAttribute(lineCol, 3).setUsage(THREE.DynamicDrawUsage));
    const idx = [];
    for (let j = 0; j < rows - 1; j++) {
      const a = j * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    const fillGeom = new THREE.BufferGeometry();
    fillGeom.setAttribute("position", new THREE.BufferAttribute(fillPos, 3).setUsage(THREE.DynamicDrawUsage));
    fillGeom.setAttribute("color", new THREE.BufferAttribute(fillCol, 3).setUsage(THREE.DynamicDrawUsage));
    fillGeom.setIndex(idx);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(fillGeom, fillMaterial));
    group.add(new THREE.Line(lineGeom, lineMaterial));
    group.position.z = -k * SPACING;
    group.userData = { linePos, lineCol, fillPos, fillCol, lineGeom, fillGeom, label: null, peak: 0 };
    flow.add(group);
    lines.push(group);
  }
  let front = 0; // index of the newest line

  const post = createBloom(renderer, scene, camera, { strength: 0.75, radius: 0.35, threshold: 0.3 });
  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h);
    post.setSize(w, h);
    camera.aspect = w / h;
    // Keep the horizontal field of view wide enough that the whole ridge fits on portrait screens.
    const minHfov = THREE.MathUtils.degToRad(56);
    camera.fov = Math.max(42, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minHfov / 2) / camera.aspect)));
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  observer?.observe(container);

  const lut = Array.from({ length: 256 }, (_, v) => magma(0.2 + 0.8 * (v / 255)).map((c) => c / 255));
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    controls.update();
    // Fog follows the zoom, so the far end always fades out but the object never vanishes.
    const d = camera.position.distanceTo(controls.target);
    scene.fog.near = d * 0.55;
    scene.fog.far = d * 1.8;
    for (const g of lines) {
      const l = g.userData.label;
      if (!l) continue;
      // Labels live in the overlay (drawn after the bloom, never hidden by nearer ridges), so they
      // follow their line by hand and fade as it ages.
      const z = g.position.z + flow.position.z;
      l.position.z = z;
      const fade = 1 - Math.min(1, Math.max(0, (-z - 18) / 18));
      l.material.opacity = Math.min(1, (clock.getElapsedTime() - l.userData.born) * 2) * fade;
    }
    post.render();
  });

  function writeLine(group, row) {
    const { linePos, lineCol, fillPos, fillCol, lineGeom, fillGeom } = group.userData;
    let peak = 0;
    for (let j = 0; j < rows; j++) {
      const v = row[j];
      const y = Math.pow(v / 255, 1.5) * HEIGHT;
      linePos[j * 3 + 1] = y;
      fillPos[j * 6 + 1] = y;
      const c = lut[v];
      const m = fillTopMix(v);
      for (let k = 0; k < 3; k++) {
        lineCol[j * 3 + k] = c[k];
        fillCol[j * 6 + k] = BG[k] + (c[k] - BG[k]) * m; // top of the fill
      }
      if (v > row[peak]) peak = j;
    }
    group.userData.peak = peak;
    lineGeom.attributes.position.needsUpdate = true;
    lineGeom.attributes.color.needsUpdate = true;
    fillGeom.attributes.position.needsUpdate = true;
    fillGeom.attributes.color.needsUpdate = true;
  }

  const removeLabel = (g) => {
    if (!g.userData.label) return;
    post.overlay.remove(g.userData.label);
    disposeSprite(g.userData.label);
    g.userData.label = null;
  };

  return {
    kind: "rows",
    update(row) {
      // Recycle the oldest line as the newest, and push everything one step back.
      front = (front - 1 + LINES) % LINES;
      const g = lines[front];
      removeLabel(g);
      writeLine(g, row);
      for (let k = 0; k < LINES; k++) {
        const age = (k - front + LINES) % LINES;
        lines[k].position.z = -age * SPACING;
      }
    },
    setFraction(f) {
      flow.position.z = -f * SPACING;
    },
    addLabel(text, color) {
      const g = lines[front];
      if (g.userData.label) return;
      const s = labelSprite(text, color);
      const { peak, linePos } = g.userData;
      // A silent line (e.g. the view just opened) has no real peak, so centre the label instead.
      const quiet = linePos[peak * 3 + 1] < 0.05 * HEIGHT;
      s.position.set(quiet ? 0 : linePos[peak * 3], (quiet ? 1.5 : linePos[peak * 3 + 1]) + 1.3, g.position.z + flow.position.z);
      s.scale.multiplyScalar(1.15);
      s.material.opacity = 0;
      s.userData.born = clock.getElapsedTime();
      post.overlay.add(s);
      g.userData.label = s;
    },
    clear() {
      const zero = new Uint8Array(rows);
      lines.forEach((g) => {
        writeLine(g, zero);
        removeLabel(g);
      });
    },
    resetView() {
      controls.reset();
    },
    dispose() {
      renderer.setAnimationLoop(null);
      observer?.disconnect();
      controls.dispose();
      for (const g of lines) {
        g.userData.lineGeom.dispose();
        g.userData.fillGeom.dispose();
        if (g.userData.label) disposeSprite(g.userData.label);
      }
      fillMaterial.dispose();
      lineMaterial.dispose();
      post.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
