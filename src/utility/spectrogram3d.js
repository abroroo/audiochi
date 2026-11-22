import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import vertexShader from "./vertexshader";
import fragmentShader from "./fragmentshader";
import { buildRowMap, fillRow } from "./spectrogramColors";

export { fillRow };

export const FREQUENCY_SAMPLES = 128; // Y resolution (frequency rows shown)
export const TIME_SAMPLES = 1000; // X resolution (history length in time steps)
export const FREQUENCY_RANGE = { fMin: 40, fMax: 12000 };

const BACKGROUND = 0x220033;
const X_SIZE = 40;
const Y_BOTTOM = -6.5;
const Y_TOP = 12.5;
const MAX_HEIGHT = 7;

/** Fractional FFT bin for each terrain row, low to high frequency, on a mel scale. */
export function terrainRowMap(bins, sampleRate, rows = FREQUENCY_SAMPLES + 1) {
  return buildRowMap(rows, bins, sampleRate, FREQUENCY_RANGE).reverse();
}


/**
 * Soften a terrain row in place: a [1 2 1] blur across frequency, then blend with the previous row
 * over time. Turns needle-like spikes into ridges without hiding real structure.
 *
 * @param {Uint8Array} row      current row (modified)
 * @param {Float32Array} state  previous smoothed row, same length (modified)
 * @param {number} [keep]       share of the previous row kept (0 = no temporal smoothing)
 */
export function smoothRow(row, state, keep = 0.35) {
  const n = row.length;
  let prev = row[0];
  for (let j = 0; j < n; j++) {
    const cur = row[j];
    const next = j + 1 < n ? row[j + 1] : cur;
    const blurred = (prev + 2 * cur + next) / 4;
    prev = cur;
    state[j] = keep * state[j] + (1 - keep) * blurred;
    row[j] = state[j];
  }
  return row;
}

/**
 * Shift the height history one time step back and append the newest spectrum.
 * The grid is stored column-major: each time step holds (FREQUENCY_SAMPLES + 1) vertices.
 *
 * @param {Uint8Array} heights vertex displacement buffer
 * @param {Uint8Array} spectrum latest frequency data (length ≤ FREQUENCY_SAMPLES + 1)
 * @param {number} [rowLength] vertices per time step
 */
export function pushSpectrum(heights, spectrum, rowLength = FREQUENCY_SAMPLES + 1) {
  heights.copyWithin(0, rowLength);
  heights.set(spectrum.subarray(0, rowLength), heights.length - rowLength);
}

/** Build the scrolling terrain geometry. Rows are evenly spaced; the data itself is mel-mapped. */
function buildGeometry() {
  const xSegments = TIME_SAMPLES;
  const ySegments = FREQUENCY_SAMPLES;
  const xSegmentSize = X_SIZE / xSegments;

  const vertices = new Float32Array((xSegments + 1) * (ySegments + 1) * 3);
  let v = 0;
  for (let i = 0; i <= xSegments; i++) {
    const x = i * xSegmentSize - X_SIZE / 2;
    for (let j = 0; j <= ySegments; j++) {
      vertices[v++] = x;
      vertices[v++] = Y_BOTTOM + ((Y_TOP - Y_BOTTOM) * j) / ySegments;
      vertices[v++] = 0;
    }
  }

  const indices = new Uint32Array(xSegments * ySegments * 6);
  let k = 0;
  for (let i = 0; i < xSegments; i++) {
    for (let j = 0; j < ySegments; j++) {
      const a = i * (ySegments + 1) + (j + 1);
      const b = i * (ySegments + 1) + j;
      const c = (i + 1) * (ySegments + 1) + j;
      const d = (i + 1) * (ySegments + 1) + (j + 1);
      indices.set([a, b, d, b, c, d], k);
      k += 6;
    }
  }

  // Note: Uint8BufferAttribute copies its input, so always write through `displacement.array`.
  const displacement = new THREE.Uint8BufferAttribute((xSegments + 1) * (ySegments + 1), 1);
  displacement.setUsage(THREE.DynamicDrawUsage);
  const heights = displacement.array;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setAttribute("displacement", displacement);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  return { geometry, heights, displacement };
}

/**
 * Mount a 3D scrolling spectrogram into `container`.
 * Owns its renderer and render loop; call `dispose()` to free the WebGL context.
 *
 * @param {HTMLElement} container
 * @returns {{ update(spectrum: Uint8Array): void, clear(): void, resetView(): void, dispose(): void }}
 */
export function createSpectrogram3D(container) {
  const camera = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 1, 1000);
  // Slightly above and to the left, so the terrain reads as 3D before anyone drags it.
  camera.position.set(-12, 24, 56);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);

  const { geometry, heights, displacement } = buildGeometry();
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uMaxHeight: { value: MAX_HEIGHT },
      uBackground: { value: new THREE.Color(BACKGROUND) },
      uLightDirection: { value: new THREE.Vector3(-0.35, 0.55, 0.75).normalize() },
      uFogNear: { value: 55 },
      uFogFar: { value: 110 },
      uGridStep: { value: new THREE.Vector2(X_SIZE / 10, (Y_TOP - Y_BOTTOM) / 8) },
    },
  });
  scene.add(new THREE.Mesh(geometry, material));

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // 3x phones would render 9x the pixels
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener("resize", onResize);

  // Drag to orbit, scroll or pinch to zoom; limits keep the terrain in view and right side up.
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 9.5, 0); // above the terrain centre, so it sits below the page header
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minDistance = 20;
  controls.maxDistance = 120;
  controls.minPolarAngle = 0.3 * Math.PI; // from somewhat above...
  controls.maxPolarAngle = 0.55 * Math.PI; // ...to slightly below
  controls.minAzimuthAngle = -Math.PI / 4; // never edge-on or from behind
  controls.maxAzimuthAngle = Math.PI / 4;
  controls.rotateSpeed = 0.5;
  controls.update();

  renderer.setAnimationLoop(() => {
    controls.update();
    renderer.render(scene, camera);
  });

  return {
    update(spectrum) {
      pushSpectrum(heights, spectrum);
      displacement.needsUpdate = true;
    },
    clear() {
      heights.fill(0);
      displacement.needsUpdate = true;
    },
    /** Back to the default camera angle. */
    resetView() {
      controls.reset();
    },
    dispose() {
      window.removeEventListener("resize", onResize);
      renderer.setAnimationLoop(null);
      controls.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
