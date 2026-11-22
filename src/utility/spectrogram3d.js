import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import vertexShader from "./vertexshader";
import fragmentShader from "./fragmentshader";

export const FREQUENCY_SAMPLES = 128; // Y resolution (frequency bins shown)
export const TIME_SAMPLES = 1000; // X resolution (history length in frames)

const BACKGROUND = 0x220033;
const X_SIZE = 40;
const Y_SIZE = 20;

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

/** Build the scrolling terrain geometry with a log-like frequency spacing on Y. */
function buildGeometry() {
  const xSegments = TIME_SAMPLES;
  const ySegments = FREQUENCY_SAMPLES;
  const xSegmentSize = X_SIZE / xSegments;
  const yPowMax = Math.log(Y_SIZE);
  const yHalfSize = Y_SIZE / 1.6;

  const vertices = new Float32Array((xSegments + 1) * (ySegments + 1) * 3);
  let v = 0;
  for (let i = 0; i <= xSegments; i++) {
    const x = i * xSegmentSize - X_SIZE / 2;
    for (let j = 0; j <= ySegments; j++) {
      const power = ((ySegments - j) / ySegments) * yPowMax;
      vertices[v++] = x;
      vertices[v++] = -Math.exp(power) + yHalfSize + 1;
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
  geometry.computeVertexNormals();
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
  camera.position.z = 60;
  camera.position.y = 8; // shift the terrain below the page header

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);

  const { geometry, heights, displacement } = buildGeometry();
  const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader });
  scene.add(new THREE.Mesh(geometry, material));

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
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
  controls.target.set(0, 8, 0);
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
