import * as THREE from "three";
import { MAGMA_GLSL } from "./glsl";
import { AXIS_RANGE, hzToMel } from "./spectrogramColors";
import { midiToFreq } from "./pitch";

export const WALL_ROWS = 256; // mel rows (texture height)
const COLS = 1024; // history columns (texture width), ring buffer
const TILT_Y = -0.2; // radians: the wall recedes to the left, into the past
const TILT_X = 0.05;
const PARALLAX = 0.05;

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uData;     // R = loudness, G = pitch trace
uniform sampler2D uLabels;   // axis ticks and labels, drawn on a canvas
uniform float uHead;         // ring-buffer position of the newest column (0..1)
uniform vec2 uTexel;
uniform vec3 uBackground;
varying vec2 vUv;
${MAGMA_GLSL}

vec2 sampleAt(vec2 uv) {
  return texture2D(uData, vec2(fract(uHead + uv.x), uv.y)).rg;
}

void main() {
  vec2 s = sampleAt(vUv);
  float level = s.r;

  // Cheap glow: a small cross blur of loudness, added back as light.
  float glow = 0.0;
  for (int i = 1; i <= 3; i++) {
    float o = float(i) * 2.0;
    glow += sampleAt(vUv + vec2(uTexel.x * o, 0.0)).r + sampleAt(vUv - vec2(uTexel.x * o, 0.0)).r;
    glow += sampleAt(vUv + vec2(0.0, uTexel.y * o)).r + sampleAt(vUv - vec2(0.0, uTexel.y * o)).r;
  }
  glow /= 12.0;

  vec3 color = magma(0.1 + 0.9 * level) + magma(0.5 + 0.5 * glow) * pow(glow, 2.0) * 0.9;

  // Pitch trace: a bright cyan line with a soft halo.
  color = mix(color, vec3(0.55, 0.95, 1.0), s.g);
  color += vec3(0.2, 0.6, 0.8) * sampleAt(vUv + vec2(0.0, uTexel.y * 3.0)).g * 0.35;
  color += vec3(0.2, 0.6, 0.8) * sampleAt(vUv - vec2(0.0, uTexel.y * 3.0)).g * 0.35;

  vec4 labels = texture2D(uLabels, vUv);
  color = mix(color, labels.rgb, labels.a);

  // The oldest edge fades into the background, adding depth to the tilt.
  color = mix(uBackground, color, smoothstep(0.0, 0.18, vUv.x));
  gl_FragColor = vec4(color, 1.0);
}
`;

/** Texture row (0 = bottom) for a frequency on the wall's mel axis. */
export function wallRowForFreq(freq, rows = WALL_ROWS, { fMin, fMax } = AXIS_RANGE) {
  return ((hzToMel(freq) - hzToMel(fMin)) / (hzToMel(fMax) - hzToMel(fMin))) * (rows - 1);
}

const HZ_TICKS = [
  [100, "100 Hz"], [250, "250"], [500, "500"], [1000, "1 kHz"], [2000, "2k"], [4000, "4k"], [8000, "8k"], [16000, "16k"],
];
const NOTE_TICKS = [36, 48, 60, 72, 84, 96].map((m) => [midiToFreq(m), `C${m / 12 - 1}`]);

function labelTexture() {
  const canvas = document.createElement("canvas");
  canvas.width = 2048;
  canvas.height = 1024;
  const g = canvas.getContext("2d");
  const y = (f) => canvas.height * (1 - wallRowForFreq(f) / (WALL_ROWS - 1));
  g.font = "500 22px Inter, system-ui, sans-serif";
  g.textBaseline = "middle";
  for (const [f, text] of HZ_TICKS) {
    g.fillStyle = "rgba(255,255,255,0.07)";
    g.fillRect(0, y(f), canvas.width, 2);
    g.fillStyle = "rgba(255,255,255,0.55)";
    g.textAlign = "left";
    g.fillText(text, 330, y(f) - 14); // clear of the faded oldest edge
  }
  for (const [f, text] of NOTE_TICKS) {
    g.fillStyle = "rgba(140,235,255,0.6)";
    g.textAlign = "right";
    // Inset: the plane is wider than the view, and the near (right) edge is cropped by the tilt.
    g.fillText(text, canvas.width * 0.86, y(f));
    g.fillRect(canvas.width * 0.86 + 8, y(f), 20, 2);
  }
  // No colour-space conversion: like the magma colours, label pixels go to the screen as authored.
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  return texture;
}

/**
 * The spectrogram as a glowing wall in perspective: a GPU ring-buffer texture (one column per time
 * step, no image copying) on a tilted plane that leans with the pointer. Mel axis in Hz on the left,
 * musical notes on the right, and an optional pitch trace.
 *
 * @returns {{ push(levels: Uint8Array, pitchRow?: number|null, clarity?: number): void, clear(): void, dispose(): void }}
 */
export function createSpectrogramWall(container, { background }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(background);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
  camera.position.set(0, 0, 10);

  const data = new Uint8Array(COLS * WALL_ROWS * 2);
  const dataTexture = new THREE.DataTexture(data, COLS, WALL_ROWS, THREE.RGFormat, THREE.UnsignedByteType);
  dataTexture.wrapS = THREE.RepeatWrapping;
  dataTexture.magFilter = THREE.LinearFilter;
  dataTexture.minFilter = THREE.LinearFilter;
  dataTexture.needsUpdate = true;
  const labels = labelTexture();

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uData: { value: dataTexture },
      uLabels: { value: labels },
      uHead: { value: 0 },
      uTexel: { value: new THREE.Vector2(1 / COLS, 1 / WALL_ROWS) },
      uBackground: { value: new THREE.Color(background) },
    },
  });
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  scene.add(wall);

  const resize = () => {
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
    // Size the plane so the tilted wall still covers the whole view.
    const viewH = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.position.z;
    wall.scale.set(viewH * camera.aspect * 1.18, viewH * 1.08, 1);
  };
  resize();
  window.addEventListener("resize", resize);

  const pointer = new THREE.Vector2();
  const onPointerMove = (e) => pointer.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  window.addEventListener("pointermove", onPointerMove);

  let head = -1;
  let dirty = false;
  renderer.setAnimationLoop(() => {
    wall.rotation.y += (TILT_Y + pointer.x * PARALLAX - wall.rotation.y) * 0.06;
    wall.rotation.x += (TILT_X + pointer.y * PARALLAX - wall.rotation.x) * 0.06;
    if (dirty) {
      dataTexture.needsUpdate = true;
      dirty = false;
    }
    renderer.render(scene, camera);
  });

  return {
    push(levels, pitchRow = null, clarity = 0) {
      head = (head + 1) % COLS;
      for (let y = 0; y < WALL_ROWS; y++) {
        const i = (y * COLS + head) * 2;
        data[i] = levels[y];
        data[i + 1] = 0;
      }
      if (pitchRow !== null) {
        const c = Math.round(pitchRow);
        const strength = 255 * clarity;
        for (let dy = -1; dy <= 1; dy++) {
          const y = c + dy;
          if (y >= 0 && y < WALL_ROWS) data[(y * COLS + head) * 2 + 1] = dy === 0 ? strength : strength * 0.5;
        }
      }
      material.uniforms.uHead.value = (head + 1) / COLS;
      dirty = true;
    },
    clear() {
      data.fill(0);
      dirty = true;
    },
    dispose() {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      dataTexture.dispose();
      labels.dispose();
      wall.geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
