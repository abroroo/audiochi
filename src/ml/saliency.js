/**
 * "What did the model listen to?": occlusion saliency (Zeiler & Fergus, 2014).
 *
 * The log-mel window is split into a grid of time x frequency cells. Each cell is masked in turn
 * (filled with the window's mean level, the same fill SpecAugment used in training) and the whole
 * set is run as one batch. A cell's importance is how much masking it lowers the predicted class's
 * probability. Works with any black-box model, so it runs on the int8 ONNX model in the browser.
 */

export const DEFAULT_GRID = { timeCells: 10, melCells: 8 };

/** Grid cell boundaries: [start, end) in frames and mel bins. */
export function gridCells(frames, nMels, { timeCells, melCells } = DEFAULT_GRID) {
  const cells = [];
  for (let m = 0; m < melCells; m++) {
    for (let t = 0; t < timeCells; t++) {
      cells.push({
        t0: Math.floor((t * frames) / timeCells),
        t1: Math.floor(((t + 1) * frames) / timeCells),
        m0: Math.floor((m * nMels) / melCells),
        m1: Math.floor(((m + 1) * nMels) / melCells),
      });
    }
  }
  return cells;
}

/** One masked copy of `data` (frames x nMels, row-major) per cell, stacked into a batch. */
export function occlusionBatch(data, frames, nMels, cells) {
  let mean = 0;
  for (let i = 0; i < data.length; i++) mean += data[i];
  mean /= data.length;
  const size = frames * nMels;
  const batch = new Float32Array(cells.length * size);
  cells.forEach(({ t0, t1, m0, m1 }, c) => {
    const offset = c * size;
    batch.set(data, offset);
    for (let t = t0; t < t1; t++) batch.fill(mean, offset + t * nMels + m0, offset + t * nMels + m1);
  });
  return batch;
}

/** Probability drop per cell, clipped at 0 and scaled so the most important cell is 1. */
export function importance(baseProb, maskedProbs) {
  const drops = Float32Array.from(maskedProbs, (p) => Math.max(0, baseProb - p));
  const max = drops.reduce((a, b) => Math.max(a, b), 0);
  if (max > 0) for (let i = 0; i < drops.length; i++) drops[i] /= max;
  return drops;
}
