import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { MAGMA_GLSL } from "./glsl";
import { createBloom, disposeSprite, labelSprite } from "./sceneKit";

const COUNT = 24000;
const BACKGROUND = 0x07060c;
const LABEL_Y = -2.6; // just under the core, clear of the page header
const LABEL_HOLD = 5; // seconds a label stays fully visible

const vertexShader = /* glsl */ `
attribute vec3 aDir;
attribute float aSeed;
attribute float aBand;          // 0 = lowest frequency row, 1 = highest
uniform sampler2D uBands;       // R = smoothed level, G = accumulated phase, per row
uniform float uPixelRatio;
uniform float uSize;
uniform float uTime;
varying float vAlpha;
varying float vBand;

void main() {
  vec2 b = texture2D(uBands, vec2(aBand, 0.5)).rg;
  float level = b.r;
  // Each particle loops outward from the core. Its band's loudness drives how fast the loop runs
  // (integrated on the CPU as a phase, so speed changes never make particles jump) and how far out it goes.
  float life = fract(aSeed + b.g + uTime * 0.02); // slow drift keeps it alive in silence
  float r = 1.0 + life * (3.2 + 6.0 * level);
  float swirl = life * 0.9 + aSeed * 0.2;
  float c = cos(swirl), s = sin(swirl);
  vec3 dir = vec3(c * aDir.x - s * aDir.z, aDir.y, s * aDir.x + c * aDir.z);
  vec4 mv = modelViewMatrix * vec4(dir * r, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (0.6 + 2.8 * level) * (1.0 - 0.6 * life) * uPixelRatio * (12.0 / -mv.z);
  vAlpha = (1.0 - life) * (0.14 + 0.8 * level);
  vBand = aBand;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uAccent;
varying float vAlpha;
varying float vBand;
${MAGMA_GLSL}

void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d) * vAlpha;
  vec3 color = mix(magma(0.35 + 0.6 * vBand), uAccent, 0.35);
  gl_FragColor = vec4(color * a, a);
}
`;

/**
 * Particle galaxy: thousands of glowing particles stream out of a core. Each particle belongs to a
 * frequency band (bass near the bottom of the sphere, highs near the top); that band's loudness
 * sets its speed, reach, size and brightness. The palette shifts toward the colour of the last
 * recognized sound category.
 *
 * @returns {{ kind: "rows", update(row: Uint8Array): void, addLabel(text: string, color?: string): void, clear(): void, resetView(): void, dispose(): void }}
 */
export function createParticleGalaxy(container, { rows }) {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.domElement.style.display = "block";
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 3, 15);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.autoRotate = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  controls.autoRotateSpeed = 0.35;
  controls.minDistance = 6;
  controls.maxDistance = 40;
  controls.saveState();

  // Per-particle attributes.
  const dirs = new Float32Array(COUNT * 3);
  const seeds = new Float32Array(COUNT);
  const bands = new Float32Array(COUNT);
  for (let i = 0; i < COUNT; i++) {
    const y = Math.random() * 2 - 1;
    const t = Math.random() * Math.PI * 2;
    const rr = Math.sqrt(1 - y * y);
    dirs.set([rr * Math.cos(t), y, rr * Math.sin(t)], i * 3);
    seeds[i] = Math.random();
    // Bass toward the bottom, highs toward the top, with some scatter so bands blend.
    bands[i] = Math.min(1, Math.max(0, (y + 1) / 2 + (Math.random() - 0.5) * 0.15));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
  geometry.setAttribute("aDir", new THREE.BufferAttribute(dirs, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  geometry.setAttribute("aBand", new THREE.BufferAttribute(bands, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);

  const bandData = new Float32Array(rows * 2);
  const bandTexture = new THREE.DataTexture(bandData, rows, 1, THREE.RGFormat, THREE.FloatType);
  bandTexture.magFilter = THREE.LinearFilter;
  bandTexture.needsUpdate = true;

  const accentTarget = new THREE.Color("#fb923c");
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uBands: { value: bandTexture },
      uPixelRatio: { value: renderer.getPixelRatio() },
      uSize: { value: 4.4 },
      uTime: { value: 0 },
      uAccent: { value: accentTarget.clone() },
    },
  });
  scene.add(new THREE.Points(geometry, material));

  // Glowing core that swells with the bass.
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  scene.add(core);

  const post = createBloom(renderer, scene, camera, { strength: 0.65, radius: 0.45, threshold: 0.32 });
  const resize = () => {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    renderer.setSize(w, h);
    post.setSize(w, h);
    camera.aspect = w / h;
    // Portrait screens: widen the view so the cloud isn't cropped at the sides.
    const minHfov = THREE.MathUtils.degToRad(70);
    camera.fov = Math.max(55, THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minHfov / 2) / camera.aspect)));
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  observer?.observe(container);

  const smoothed = new Float32Array(rows);
  let lastUpdate = performance.now();
  let bass = 0;
  let label = null;
  const clock = new THREE.Clock();

  renderer.setAnimationLoop(() => {
    controls.update();
    material.uniforms.uTime.value = clock.getElapsedTime();
    const accent = material.uniforms.uAccent.value.lerp(accentTarget, 0.04);
    core.material.color.copy(accent).lerp(new THREE.Color(0xffffff), 0.35);
    core.scale.setScalar(0.35 + bass * 0.5);
    if (label) {
      const age = clock.getElapsedTime() - label.userData.born;
      label.material.opacity = Math.min(1, age * 2) * Math.max(0, 1 - (age - LABEL_HOLD) / 1.5);
      label.position.y = LABEL_Y + age * 0.08;
      if (age > LABEL_HOLD + 1.5) {
        post.overlay.remove(label);
        disposeSprite(label);
        label = null;
      }
    }
    post.render();
  });

  return {
    kind: "rows",
    update(row) {
      const now = performance.now();
      const dt = Math.min(0.1, (now - lastUpdate) / 1000);
      lastUpdate = now;
      let low = 0;
      for (let j = 0; j < rows; j++) {
        const level = row[j] / 255;
        smoothed[j] += (level - smoothed[j]) * 0.3;
        bandData[j * 2] = smoothed[j];
        bandData[j * 2 + 1] = (bandData[j * 2 + 1] + dt * (0.06 + 0.9 * smoothed[j])) % 1000;
        if (j < rows / 8) low += smoothed[j];
      }
      bass = low / (rows / 8);
      bandTexture.needsUpdate = true;
    },
    addLabel(text, color) {
      if (color) accentTarget.set(color);
      if (label) {
        post.overlay.remove(label);
        disposeSprite(label);
      }
      // Drawn after the bloom, above the cloud, so the glow can't wash the text out.
      label = labelSprite(text, color);
      label.material.opacity = 0;
      label.userData.born = clock.getElapsedTime();
      label.position.set(0, LABEL_Y, 0);
      label.scale.multiplyScalar(1.3);
      post.overlay.add(label);
    },
    clear() {
      smoothed.fill(0);
      for (let j = 0; j < rows; j++) bandData[j * 2] = 0;
      bandTexture.needsUpdate = true;
      bass = 0;
    },
    resetView() {
      controls.reset();
    },
    dispose() {
      renderer.setAnimationLoop(null);
      observer?.disconnect();
      controls.dispose();
      if (label) disposeSprite(label);
      geometry.dispose();
      material.dispose();
      bandTexture.dispose();
      core.geometry.dispose();
      core.material.dispose();
      post.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
