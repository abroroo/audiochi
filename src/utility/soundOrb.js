import * as THREE from "three";

export const ORB_BANDS = 64;

// Ashima Arts / Stefan Gustavson 3D simplex noise (MIT), for organic surface motion.
const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 1.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}
`;

const vertexShader = /* glsl */ `
uniform sampler2D uBands; // 64 mel bands, bass first
uniform float uTime;
uniform float uBass;
varying float vBand;
varying vec3 vNormal;
varying vec3 vViewPosition;
${NOISE_GLSL}

void main() {
  vec3 n = normalize(position);
  // A slowly drifting noise field assigns each patch of the surface a frequency band, so every
  // part of the spectrum has its own region and the whole orb comes alive, not just one belt.
  float u = clamp(0.5 + 0.65 * snoise(n * 1.2 + vec3(uTime * 0.05)), 0.0, 1.0);
  float band = texture2D(uBands, vec2(u, 0.5)).r;
  float ripple = 0.5 + 0.5 * snoise(n * 2.6 + vec3(0.0, uTime * 0.35, 0.0));
  float idle = 0.025 * sin(uTime * 1.3 + n.x * 3.0);
  float r = 1.0 + uBass * 0.18 + band * 0.38 * ripple + idle;
  vBand = band;
  vec4 viewPosition = modelViewMatrix * vec4(n * r, 1.0);
  vViewPosition = viewPosition.xyz;
  vNormal = normalMatrix * n;
  gl_Position = projectionMatrix * viewPosition;
}
`;

const fragmentShader = /* glsl */ `
uniform vec3 uAccent;
varying float vBand;
varying vec3 vNormal;
varying vec3 vViewPosition;

void main() {
  // True surface normal of the displaced mesh, from screen-space derivatives.
  vec3 normal = normalize(cross(dFdx(vViewPosition), dFdy(vViewPosition)));
  vec3 viewDir = normalize(-vViewPosition);
  float fresnel = pow(1.0 - max(dot(normalize(vNormal), viewDir), 0.0), 2.2);
  float light = max(dot(normal, normalize(vec3(-0.4, 0.7, 0.6))), 0.0);
  vec3 deep = vec3(0.09, 0.03, 0.2);
  vec3 color = deep * (0.6 + 0.8 * light)
             + uAccent * (fresnel * 0.9 + 0.12 * light + vBand * 0.9 * light)
             + vec3(1.0, 0.95, 0.9) * pow(vBand, 3.0) * 0.6;
  gl_FragColor = vec4(color, 1.0);
}
`;

function haloTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,0.9)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.35)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/**
 * A glowing orb that ripples with the spectrum: bass swells it, each band drives the surface at its
 * latitude, and its rim takes the colour of the sound the model last recognized. Transparent
 * canvas, so whatever is behind it shows through.
 *
 * @returns {{ setBands(bands: Uint8Array): void, setAccent(color: string): void, dispose(): void }}
 */
export function createSoundOrb(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
  camera.position.set(0, 0, 6.2);

  const bandsData = new Uint8Array(ORB_BANDS);
  const bandsTexture = new THREE.DataTexture(bandsData, ORB_BANDS, 1, THREE.RedFormat, THREE.UnsignedByteType);
  bandsTexture.magFilter = THREE.LinearFilter;
  bandsTexture.needsUpdate = true;

  const accent = new THREE.Color("#fb923c");
  const material = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    uniforms: {
      uBands: { value: bandsTexture },
      uTime: { value: 0 },
      uBass: { value: 0 },
      uAccent: { value: accent.clone() },
    },
  });
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 28), material);
  scene.add(orb);

  const halo = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: haloTexture(), color: accent.clone(), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending })
  );
  halo.scale.setScalar(4.2);
  halo.renderOrder = -1;
  scene.add(halo);

  const resize = () => {
    const s = container.clientWidth || 220;
    renderer.setSize(s, container.clientHeight || s);
    camera.aspect = s / Math.max(1, container.clientHeight || s);
    camera.updateProjectionMatrix();
  };
  resize();
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
  observer?.observe(container);

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const clock = new THREE.Clock();
  let bass = 0;
  let energy = 0;
  renderer.setAnimationLoop(() => {
    const t = clock.getElapsedTime();
    material.uniforms.uTime.value = reducedMotion ? 0 : t;
    material.uniforms.uBass.value = bass;
    material.uniforms.uAccent.value.lerp(accent, 0.05);
    halo.material.color.copy(material.uniforms.uAccent.value);
    halo.material.opacity = 0.18 + energy * 0.55;
    halo.scale.setScalar(3.6 + energy * 1.6);
    if (!reducedMotion) orb.rotation.y = t * 0.15;
    renderer.render(scene, camera);
  });

  return {
    setBands(bands) {
      bandsData.set(bands.subarray(0, ORB_BANDS));
      bandsTexture.needsUpdate = true;
      let low = 0;
      let all = 0;
      for (let i = 0; i < ORB_BANDS; i++) {
        all += bands[i];
        if (i < 10) low += bands[i];
      }
      // Smoothed so the orb breathes rather than flickers.
      bass += (low / (10 * 255) - bass) * 0.25;
      energy += (all / (ORB_BANDS * 255) - energy) * 0.15;
    },
    setAccent(color) {
      accent.set(color);
    },
    dispose() {
      renderer.setAnimationLoop(null);
      observer?.disconnect();
      orb.geometry.dispose();
      material.dispose();
      bandsTexture.dispose();
      halo.material.map.dispose();
      halo.material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
