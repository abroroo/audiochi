import { buildLoudnessLut } from "./spectrogramColors";
import { WALL_COLS, WALL_ROWS } from "./axes";

const LUT = buildLoudnessLut();

/**
 * 2D-canvas fallback for the flat spectrogram when WebGL is unavailable. Same geometry as the
 * WebGL wall (WALL_COLS x WALL_ROWS, stretched to the container), so the same axes apply.
 *
 * @returns {{ kind: "wall", push(levels: Uint8Array, pitchRow?: number|null, clarity?: number): void, clear(): void, dispose(): void }}
 */
export function createCanvasWall(container) {
  const canvas = document.createElement("canvas");
  canvas.width = WALL_COLS;
  canvas.height = WALL_ROWS;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No 2D canvas available.");
  Object.assign(canvas.style, { display: "block", width: "100%", height: "100%" });
  container.appendChild(canvas);
  const column = ctx.createImageData(1, WALL_ROWS);

  const clear = () => {
    ctx.fillStyle = `rgb(${LUT[0]}, ${LUT[1]}, ${LUT[2]})`;
    ctx.fillRect(0, 0, WALL_COLS, WALL_ROWS);
  };
  clear();

  return {
    kind: "wall",
    push(levels, pitchRow = null, clarity = 0) {
      ctx.drawImage(canvas, -1, 0);
      const px = column.data;
      for (let y = 0; y < WALL_ROWS; y++) {
        const v = levels[y] * 3;
        const p = (WALL_ROWS - 1 - y) * 4; // row 0 is the bottom of the canvas
        px[p] = LUT[v];
        px[p + 1] = LUT[v + 1];
        px[p + 2] = LUT[v + 2];
        px[p + 3] = 255;
      }
      if (pitchRow !== null && clarity > 0) {
        const p = (WALL_ROWS - 1 - Math.round(pitchRow)) * 4;
        if (p >= 0 && p < px.length) px.set([140, 242, 255, 255], p);
      }
      ctx.putImageData(column, WALL_COLS - 1, 0);
    },
    clear,
    dispose() {
      canvas.remove();
    },
  };
}
