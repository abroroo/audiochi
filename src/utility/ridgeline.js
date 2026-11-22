import * as THREE from "three";
import { createBloom, disposeSprite, labelSprite } from "./sceneKit";
import { magma } from "./spectrogramColors";

const LINES = 64;
const WIDTH = 22;
const SPACING = 0.62; // depth between consecutive moments
const HEIGHT = 3.4;
const BACKGROUND = 0x05020b;

/**
 * Ridgeline waves: each moment of the spectrum is one glowing line (bass on the left, highs on the
 * right), and older moments recede into the distance. Every line has a background-coloured fill
 * under it, so nearer peaks hide the lines behind them, the classic stacked-ridgeline look.
 * Recognized sounds are pinned above the peak of the moment they were heard.
 *
 * @returns {{ update(row: Uint8Array): void, setFraction(f: number): void, addLabel(text: string, color?: string): void, clear(): void, dispose(): void }}
 */
export function createRidgeline(container, { rows }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  scene.fog = new THREE.Fog(BACKGROUND, 14, 44);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(0, 7, 13);
  camera.lookAt(0, 1.5, -14);

  const flow = new THREE.Group();
  scene.add(flow);
  const fillMaterial = new THREE.MeshBasicMaterial({
    color: BACKGROUND, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
  });
  const lineMaterial = new THREE.LineBasicMaterial({ vertexColors: true });

  // Ring of reusable lines; lines[k] is a group holding one ridge and its occluding fill.
  const lines = [];
  for (let k = 0; k < LINES; k++) {
    const linePos = new Float32Array(rows * 3);
    const lineCol = new Float32Array(rows * 3);
    const fillPos = new Float32Array(rows * 2 * 3);
    for (let j = 0; j < rows; j++) {
      const x = -WIDTH / 2 + (WIDTH * j) / (rows - 1);
      linePos[j * 3] = x;
      fillPos[j * 6] = x;
      fillPos[j * 6 + 3] = x;
      fillPos[j * 6 + 4] = -0.02; // fill runs down to just below the baseline
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
    fillGeom.setIndex(idx);
    const group = new THREE.Group();
    group.add(new THREE.Mesh(fillGeom, fillMaterial));
    group.add(new THREE.Line(lineGeom, lineMaterial));
    group.position.z = -k * SPACING;
    group.userData = { linePos, lineCol, fillPos, lineGeom, fillGeom, label: null, peak: 0 };
    flow.add(group);
    lines.push(group);
  }
  let front = 0; // index of the newest line

  const post = createBloom(renderer, scene, camera, { strength: 0.9, radius: 0.35, threshold: 0.25 });
  const resize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    post.setSize(w, h);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  const pointer = new THREE.Vector2();
  const onPointerMove = (e) => pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  window.addEventListener("pointermove", onPointerMove);

  const lut = Array.from({ length: 256 }, (_, v) => magma(0.2 + 0.8 * (v / 255)).map((c) => c / 255));
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    camera.position.x += (pointer.x * 3 - camera.position.x) * 0.04;
    camera.position.y += (7 - pointer.y * 2 - camera.position.y) * 0.04;
    camera.lookAt(0, 1.5, -14);
    for (const g of lines) {
      const l = g.userData.label;
      if (l) l.material.opacity = Math.min(1, (clock.getElapsedTime() - l.userData.born) * 2);
    }
    post.composer.render();
  });

  function writeLine(group, row) {
    const { linePos, lineCol, fillPos, lineGeom, fillGeom } = group.userData;
    let peak = 0;
    for (let j = 0; j < rows; j++) {
      const v = row[j];
      const y = Math.pow(v / 255, 1.5) * HEIGHT;
      linePos[j * 3 + 1] = y;
      fillPos[j * 6 + 1] = y;
      const c = lut[v];
      lineCol[j * 3] = c[0];
      lineCol[j * 3 + 1] = c[1];
      lineCol[j * 3 + 2] = c[2];
      if (v > row[peak]) peak = j;
    }
    group.userData.peak = peak;
    lineGeom.attributes.position.needsUpdate = true;
    lineGeom.attributes.color.needsUpdate = true;
    fillGeom.attributes.position.needsUpdate = true;
  }

  return {
    update(row) {
      // Recycle the oldest line as the newest, and push everything one step back.
      front = (front - 1 + LINES) % LINES;
      const g = lines[front];
      if (g.userData.label) {
        g.remove(g.userData.label);
        disposeSprite(g.userData.label);
        g.userData.label = null;
      }
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
      s.position.set(linePos[peak * 3], linePos[peak * 3 + 1] + 1.1, 0);
      s.scale.multiplyScalar(0.75);
      s.material.opacity = 0;
      s.userData.born = clock.getElapsedTime();
      g.add(s);
      g.userData.label = s;
    },
    clear() {
      const zero = new Uint8Array(rows);
      lines.forEach((g) => writeLine(g, zero));
    },
    dispose() {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
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
