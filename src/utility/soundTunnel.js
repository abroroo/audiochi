import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { GRID_GLSL, MAGMA_GLSL } from "./glsl";
import { pushRing, ringRowIndex } from "./tunnelMath";

const BACKGROUND = 0x0d0418;
const RINGS = 270; // history: RINGS / steps per second (6 s at 45/s)
const SEGMENTS = 160; // vertices around each ring
const RADIUS = 7;
const LENGTH = 120;
const SPACING = LENGTH / (RINGS - 1);
const INWARD = 0.62; // loudest sound pushes the wall 62% of the way to the centre

const vertexShader = /* glsl */ `
attribute vec2 aCoord;          // (ring 0..1 oldest->newest, angle 0..1)
attribute float displacement;   // loudness 0..255
uniform float uRadius;
uniform float uLength;
uniform float uInward;
varying float vLevel;
varying vec2 vCoord;
varying vec3 vViewPosition;

void main() {
  // The bottom fifth of the analyser range is room noise: treat it as a calm, dark wall.
  vLevel = clamp((displacement / 255.0 - 0.2) / 0.8, 0.0, 1.0);
  vCoord = aCoord;
  float phi = aCoord.y * 6.28318530718 - 1.57079632679; // start at the floor
  float r = uRadius * (1.0 - uInward * pow(vLevel, 1.5));
  vec3 p = vec3(cos(phi) * r, sin(phi) * r, -aCoord.x * uLength);
  vec4 viewPosition = modelViewMatrix * vec4(p, 1.0);
  vViewPosition = viewPosition.xyz;
  gl_Position = projectionMatrix * viewPosition;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uBackground;
uniform float uFogNear;
uniform float uFogFar;
uniform float uRings;
varying float vLevel;
varying vec2 vCoord;
varying vec3 vViewPosition;
${MAGMA_GLSL}
${GRID_GLSL}

void main() {
  vec3 base = magma(0.06 + 0.9 * vLevel);
  vec3 normal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  vec3 viewDir = normalize(-vViewPosition);
  float facing = abs(dot(normal, viewDir)); // headlight: the camera carries the light

  vec3 color = base * (0.18 + 0.6 * facing)
             + base * pow(vLevel, 3.0) * 1.2; // only loud sound is emissive, so bloom picks out peaks

  // Neon grid on the quiet wall: a ring every 10 time steps, 32 lines around.
  float grid = gridLine(vec2(vCoord.x * uRings / 10.0, vCoord.y * 32.0), vec2(1.0));
  color += vec3(0.45, 0.25, 0.95) * grid * 0.16 * (1.0 - smoothstep(0.1, 0.4, vLevel));

  float fog = smoothstep(uFogNear, uFogFar, length(vViewPosition));
  gl_FragColor = vec4(mix(color, uBackground, fog), 1.0);
}
`;

function buildGeometry() {
  const perRing = SEGMENTS + 1;
  const coords = new Float32Array(RINGS * perRing * 2);
  for (let r = 0; r < RINGS; r++) {
    for (let a = 0; a < perRing; a++) {
      const i = (r * perRing + a) * 2;
      coords[i] = r / (RINGS - 1);
      coords[i + 1] = a / SEGMENTS;
    }
  }
  const indices = new Uint32Array((RINGS - 1) * SEGMENTS * 6);
  let k = 0;
  for (let r = 0; r < RINGS - 1; r++) {
    for (let a = 0; a < SEGMENTS; a++) {
      const p0 = r * perRing + a;
      const p1 = p0 + 1;
      const p2 = p0 + perRing;
      const p3 = p2 + 1;
      indices.set([p0, p2, p1, p1, p2, p3], k);
      k += 6;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("aCoord", new THREE.BufferAttribute(coords, 2));
  // Note: Uint8BufferAttribute copies its input, so always write through `displacement.array`.
  const displacement = new THREE.Uint8BufferAttribute(RINGS * perRing, 1);
  displacement.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("displacement", displacement);
  // Positions are computed in the shader; a dummy attribute gives three.js a vertex count and bounds.
  geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(RINGS * perRing * 3), 3));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -LENGTH / 2), LENGTH);
  return { geometry, displacement };
}

function labelSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  g.font = "600 54px Inter, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = "rgba(251, 146, 60, 0.9)";
  g.shadowBlur = 24;
  g.fillStyle = "#fff7ed";
  g.fillText(text, 256, 64, 490);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, opacity: 0 }));
  sprite.scale.set(4.4, 1.1, 1);
  return sprite;
}

/**
 * The spectrogram wrapped into a tunnel you fly through. Time streams toward the viewer, pitch runs
 * around the wall (bass on the floor, highs on the ceiling) and loudness pushes the wall inward and
 * makes it glow. Labels for detected sounds float past with the flow.
 *
 * @returns {{ update(row: Uint8Array, fraction?: number): void, addLabel(text: string): void,
 *             setFraction(f: number): void, clear(): void, dispose(): void }}
 */
export function createSoundTunnel(container, { rows }) {
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);
  camera.position.set(0, 0, 2);

  const { geometry, displacement } = buildGeometry();
  const heights = displacement.array;
  const rowIndex = ringRowIndex(SEGMENTS, rows);
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.DoubleSide,
    uniforms: {
      uRadius: { value: RADIUS },
      uLength: { value: LENGTH },
      uInward: { value: INWARD },
      uRings: { value: RINGS },
      uBackground: { value: new THREE.Color(BACKGROUND) },
      uFogNear: { value: 30 },
      uFogFar: { value: 112 },
    },
  });
  // The tunnel and its labels move together; the group slides by a fraction of a ring between
  // data steps so motion is smooth at any frame rate.
  const flow = new THREE.Group();
  const tunnel = new THREE.Mesh(geometry, material);
  tunnel.frustumCulled = false;
  flow.add(tunnel);
  scene.add(flow);
  const labels = [];

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.7, 0.4, 0.55);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  const pointer = new THREE.Vector2();
  const onPointerMove = (e) => {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  };
  window.addEventListener("pointermove", onPointerMove);

  const resize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.resolution.set(w / 2, h / 2);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  const lookAt = new THREE.Vector3(0, 0, -60);
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    // Look around a little with the pointer; drift and roll slowly unless reduced motion is on.
    const drift = reducedMotion ? 0 : 1;
    camera.position.x += (pointer.x * 2.2 + Math.sin(t * 0.3) * 0.6 * drift - camera.position.x) * 0.05;
    camera.position.y += (-pointer.y * 1.6 + Math.cos(t * 0.23) * 0.4 * drift - camera.position.y) * 0.05;
    camera.lookAt(lookAt);
    camera.rotation.z = Math.sin(t * 0.12) * 0.12 * drift;

    for (let i = labels.length - 1; i >= 0; i--) {
      const s = labels[i];
      const age = t - s.userData.born;
      s.material.opacity = Math.min(1, age / 0.8) * (s.position.z > -6 ? Math.max(0, (2 - s.position.z) / 8) : 1);
      if (s.position.z > 2) {
        flow.remove(s);
        s.material.map.dispose();
        s.material.dispose();
        labels.splice(i, 1);
      }
    }
    composer.render();
  });

  return {
    /** Advance one ring with the newest spectrum (one value per frequency row). */
    update(row) {
      pushRing(heights, row, rowIndex);
      displacement.needsUpdate = true;
      for (const s of labels) s.position.z += SPACING;
    },
    /** Sub-step progress (0–1) toward the next ring, for smooth motion. */
    setFraction(f) {
      flow.position.z = f * SPACING;
    },
    /** A detected sound: its name appears far down the tunnel and floats past. */
    addLabel(text) {
      const s = labelSprite(text);
      const side = Math.random() < 0.5 ? -1 : 1;
      const phi = Math.PI / 2 + side * (0.35 + Math.random() * 0.6); // upper sides, clear of the floor
      s.position.set(Math.cos(phi) * RADIUS * 0.5, Math.sin(phi) * RADIUS * 0.5, -LENGTH * 0.8);
      s.userData.born = clock.getElapsedTime();
      flow.add(s);
      labels.push(s);
    },
    clear() {
      heights.fill(0);
      displacement.needsUpdate = true;
    },
    dispose() {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      for (const s of labels) {
        s.material.map.dispose();
        s.material.dispose();
      }
      geometry.dispose();
      material.dispose();
      bloom.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
