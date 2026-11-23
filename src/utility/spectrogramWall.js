import * as THREE from "three";
import { MAGMA_GLSL } from "./glsl";
import { WALL_COLS, WALL_ROWS, wallRowForFreq } from "./axes";

export { WALL_ROWS, wallRowForFreq };

const vertexShader = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); // the 1x1 plane fills clip space exactly
}
`;

const fragmentShader = /* glsl */ `
uniform sampler2D uData;     // R = loudness, G = pitch trace
uniform float uHead;         // ring-buffer position of the oldest column (0..1)
uniform vec2 uTexel;
varying vec2 vUv;
${MAGMA_GLSL}

vec2 sampleAt(vec2 uv) {
  // Sample column centres only, so the newest and oldest columns never blend at the seam.
  float col = (floor(uv.x / uTexel.x) + 0.5) * uTexel.x;
  return texture2D(uData, vec2(fract(uHead + col), uv.y)).rg;
}

void main() {
  vec2 s = sampleAt(vUv);
  // Subtle vertical glow (along frequency only), so time stays sharp for reading onsets.
  float glow = 0.0;
  for (int i = 1; i <= 2; i++) {
    float o = float(i) * 2.0 * uTexel.y;
    glow += sampleAt(vUv + vec2(0.0, o)).r + sampleAt(vUv - vec2(0.0, o)).r;
  }
  glow /= 4.0;
  vec3 color = magma(0.03 + 0.97 * s.r) + magma(0.6) * pow(glow, 3.0) * 0.25;
  // Pitch trace: saturated cyan with a dark outline, so it reads even on top of a bright harmonic.
  float halo = max(sampleAt(vUv + vec2(0.0, 2.0 * uTexel.y)).g, sampleAt(vUv - vec2(0.0, 2.0 * uTexel.y)).g);
  color *= 1.0 - 0.6 * halo * (1.0 - s.g);
  color = mix(color, vec3(0.1, 0.85, 1.0), s.g);
  gl_FragColor = vec4(color, 1.0);
}
`;

/**
 * Flat, measurable spectrogram: a GPU ring-buffer texture (one column per time step, no image
 * copying) drawn edge to edge. Mel rows bottom to top, newest column on the right. Axes are drawn
 * by the page from the same geometry (see axes.js), so they line up with the data exactly.
 *
 * @returns {{ kind: "wall", push(levels: Uint8Array, pitchRow?: number|null, clarity?: number): void, clear(): void, dispose(): void }}
 */
export function createSpectrogramWall(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);
  renderer.domElement.style.display = "block";

  const scene = new THREE.Scene();
  const camera = new THREE.Camera();

  const data = new Uint8Array(WALL_COLS * WALL_ROWS * 2);
  const dataTexture = new THREE.DataTexture(data, WALL_COLS, WALL_ROWS, THREE.RGFormat, THREE.UnsignedByteType);
  dataTexture.wrapS = THREE.RepeatWrapping;
  dataTexture.magFilter = THREE.LinearFilter;
  dataTexture.minFilter = THREE.LinearFilter;
  dataTexture.needsUpdate = true;

  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    depthTest: false,
    uniforms: {
      uData: { value: dataTexture },
      uHead: { value: 0 },
      uTexel: { value: new THREE.Vector2(1 / WALL_COLS, 1 / WALL_ROWS) },
    },
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
  plane.frustumCulled = false;
  scene.add(plane);

  let head = -1;
  let dirty = true;
  const resize = () => {
    renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
    dirty = true;
  };
  resize();
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  observer?.observe(container);

  renderer.setAnimationLoop(() => {
    if (!dirty) return;
    dataTexture.needsUpdate = true;
    dirty = false;
    renderer.render(scene, camera);
  });

  return {
    kind: "wall",
    push(levels, pitchRow = null, clarity = 0) {
      head = (head + 1) % WALL_COLS;
      for (let y = 0; y < WALL_ROWS; y++) {
        const i = (y * WALL_COLS + head) * 2;
        data[i] = levels[y];
        data[i + 1] = 0;
      }
      if (pitchRow !== null) {
        const c = Math.round(pitchRow);
        const strength = 255 * clarity;
        for (let dy = -1; dy <= 1; dy++) {
          const y = c + dy;
          if (y >= 0 && y < WALL_ROWS) data[(y * WALL_COLS + head) * 2 + 1] = dy === 0 ? strength : strength * 0.6;
        }
      }
      material.uniforms.uHead.value = (head + 1) / WALL_COLS;
      dirty = true;
    },
    clear() {
      data.fill(0);
      dirty = true;
    },
    dispose() {
      renderer.setAnimationLoop(null);
      observer?.disconnect();
      dataTexture.dispose();
      plane.geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
