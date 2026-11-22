import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const BACKGROUND = 0x220033;
const SCALE = 10; // UMAP coordinates are normalized to [-1, 1]
const TRAIL = 40;
export const CATEGORY_COLORS = ["#f59e0b", "#38bdf8", "#f472b6", "#a3e635", "#c084fc"];

function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.6, "rgba(255,255,255,0.9)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/**
 * 3D map of the model's embedding space: one point per ESC-50 clip at its UMAP position, coloured
 * by category. A glowing marker with a trail shows where the live microphone sound lands.
 *
 * @returns {{ setLive, setTaught, dispose }}
 */
export function createSoundMap(container, space, { onHover } = {}) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BACKGROUND);
  scene.fog = new THREE.FogExp2(BACKGROUND, 0.03);
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 4, 24);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.autoRotate = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  controls.autoRotateSpeed = 0.4;
  controls.minDistance = 4;
  controls.maxDistance = 60;

  // Clip points.
  const positions = new Float32Array(space.count * 3);
  const colors = new Float32Array(space.count * 3);
  const palette = CATEGORY_COLORS.map((c) => new THREE.Color(c));
  for (let i = 0; i < space.count; i++) {
    for (let a = 0; a < 3; a++) positions[i * 3 + a] = space.xyz[i * 3 + a] * SCALE;
    const col = palette[Math.floor(space.labels[i] / 10)]; // ESC-50 classes come in blocks of 10
    colors.set([col.r, col.g, col.b], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  const texture = dotTexture();
  const material = new THREE.PointsMaterial({
    size: 0.5, map: texture, vertexColors: true, transparent: true, depthWrite: false, alphaTest: 0.05,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);

  // Hover highlight.
  const highlight = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true })
  );
  highlight.visible = false;
  scene.add(highlight);

  // Live marker and its trail.
  const live = new THREE.Mesh(new THREE.SphereGeometry(0.35, 24, 24), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, color: 0xfb923c, transparent: true, opacity: 0.8, depthWrite: false }));
  halo.scale.setScalar(2.4);
  live.add(halo);
  live.visible = false;
  scene.add(live);
  const trailPositions = new Float32Array(TRAIL * 3);
  const trailGeometry = new THREE.BufferGeometry();
  trailGeometry.setAttribute("position", new THREE.BufferAttribute(trailPositions, 3).setUsage(THREE.DynamicDrawUsage));
  trailGeometry.setDrawRange(0, 0);
  const trail = new THREE.Line(trailGeometry, new THREE.LineBasicMaterial({ color: 0xfb923c, transparent: true, opacity: 0.6 }));
  scene.add(trail);
  const target = new THREE.Vector3();
  let trailCount = 0;
  let trailTick = 0;

  // Taught sounds.
  const taughtGroup = new THREE.Group();
  scene.add(taughtGroup);
  const taughtGeometry = new THREE.OctahedronGeometry(0.45);
  const taughtMaterial = new THREE.MeshBasicMaterial({ color: 0xfb923c, wireframe: true });

  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.2;
  const pointer = new THREE.Vector2();
  let pointerActive = false;
  let hovered = -1;
  const onPointerMove = (e) => {
    const r = renderer.domElement.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    pointerActive = true;
  };
  const onPointerLeave = () => {
    pointerActive = false;
  };
  renderer.domElement.addEventListener("pointermove", onPointerMove);
  renderer.domElement.addEventListener("pointerdown", onPointerMove); // tap to label on touch screens
  renderer.domElement.addEventListener("pointerleave", onPointerLeave);

  const resize = () => {
    const { clientWidth: w, clientHeight: h } = container;
    renderer.setSize(w, h);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  renderer.setAnimationLoop(() => {
    controls.update();
    if (live.visible) {
      live.position.lerp(target, 0.12);
      halo.material.opacity = 0.55 + 0.25 * Math.sin(performance.now() / 300);
      if (++trailTick % 3 === 0) {
        trailPositions.copyWithin(3, 0, (TRAIL - 1) * 3);
        trailPositions.set([live.position.x, live.position.y, live.position.z], 0);
        trailCount = Math.min(TRAIL, trailCount + 1);
        trailGeometry.setDrawRange(0, trailCount);
        trailGeometry.attributes.position.needsUpdate = true;
      }
    }
    taughtGroup.children.forEach((m) => (m.rotation.y += 0.01));

    let next = -1;
    if (pointerActive) {
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObject(points)[0];
      if (hit) next = hit.index;
    }
    if (next !== hovered) {
      hovered = next;
      highlight.visible = next >= 0;
      if (next >= 0) highlight.position.fromArray(positions, next * 3);
      onHover?.(next >= 0 ? next : null);
    }
    renderer.render(scene, camera);
  });

  return {
    /** Move the live marker to a UMAP position ([-1, 1]^3), or hide it with null. */
    setLive(position) {
      if (!position) {
        live.visible = false;
        trailCount = 0;
        trailGeometry.setDrawRange(0, 0);
        return;
      }
      target.set(position[0] * SCALE, position[1] * SCALE, position[2] * SCALE);
      if (!live.visible) live.position.copy(target);
      live.visible = true;
    },
    /** Show taught sounds at their positions: [{ name, position }]. */
    setTaught(items) {
      taughtGroup.clear();
      for (const { position } of items) {
        const m = new THREE.Mesh(taughtGeometry, taughtMaterial);
        m.position.set(position[0] * SCALE, position[1] * SCALE, position[2] * SCALE);
        taughtGroup.add(m);
      }
    },
    dispose() {
      renderer.setAnimationLoop(null);
      window.removeEventListener("resize", resize);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerMove);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      controls.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose();
        o.material?.map?.dispose();
        o.material?.dispose();
      });
      taughtGeometry.dispose();
      taughtMaterial.dispose();
      texture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
