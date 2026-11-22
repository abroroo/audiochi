import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";

/**
 * A text sprite for a recognized sound, with a soft coloured glow.
 * @param {string} text
 * @param {string} [glow] CSS colour of the glow
 */
export function labelSprite(text, glow = "rgba(251, 146, 60, 0.9)") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const g = canvas.getContext("2d");
  g.font = "600 54px Inter, system-ui, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = glow;
  g.shadowBlur = 24;
  g.fillStyle = "#fff7ed";
  g.fillText(text, 256, 64, 490);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(4.4, 1.1, 1);
  return sprite;
}

export function disposeSprite(sprite) {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}

/**
 * Bloom post-processing chain: render, glow on bright pixels, output.
 * @returns {{ composer: EffectComposer, bloom: UnrealBloomPass, setSize(w: number, h: number): void, dispose(): void }}
 */
export function createBloom(renderer, scene, camera, { strength = 0.8, radius = 0.45, threshold = 0.5 } = {}) {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), strength, radius, threshold);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  return {
    composer,
    bloom,
    setSize(w, h) {
      composer.setSize(w, h);
      bloom.resolution.set(w / 2, h / 2); // half resolution: the glow is blurry anyway
    },
    dispose() {
      bloom.dispose();
      composer.dispose();
    },
  };
}
