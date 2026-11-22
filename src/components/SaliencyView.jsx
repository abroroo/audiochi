"use client";
import React, { useEffect, useRef } from "react";
import { buildLoudnessLut } from "../utility/spectrogramColors";

/**
 * The 2 s log-mel window the model saw (time left to right, low pitch at the bottom) with the
 * occlusion-saliency grid drawn over it: brighter outline = masking that region hurt the
 * prediction more.
 */
const SaliencyView = ({ explanation }) => {
  const canvasRef = useRef(null);
  const { logmel, cells, weights, label, nMels, ms } = explanation;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;
    const { data, frames } = logmel;
    canvas.width = frames;
    canvas.height = nMels;

    // Spectrogram: scale dB to 0..255 over the window's own range (top 60 dB).
    let max = -Infinity;
    for (const v of data) max = Math.max(max, v);
    const floor = max - 60;
    const lut = buildLoudnessLut();
    const img = ctx.createImageData(frames, nMels);
    for (let t = 0; t < frames; t++) {
      for (let m = 0; m < nMels; m++) {
        const v = Math.round((255 * (Math.max(floor, data[t * nMels + m]) - floor)) / 60);
        const px = ((nMels - 1 - m) * frames + t) * 4;
        img.data[px] = lut[v * 3];
        img.data[px + 1] = lut[v * 3 + 1];
        img.data[px + 2] = lut[v * 3 + 2];
        img.data[px + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);

    // Saliency: dim unimportant cells, outline the important ones.
    cells.forEach(({ t0, t1, m0, m1 }, i) => {
      const w = weights[i];
      const y = nMels - m1;
      ctx.fillStyle = `rgba(0, 0, 0, ${0.7 * (1 - w)})`;
      ctx.fillRect(t0, y, t1 - t0, m1 - m0);
      if (w > 0.5) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${w})`;
        ctx.lineWidth = 0.6;
        ctx.strokeRect(t0 + 0.3, y + 0.3, t1 - t0 - 0.6, m1 - m0 - 0.6);
      }
    });
  }, [logmel, cells, weights, nMels]);

  return (
    <figure className="mt-4" data-test="saliency-view">
      <canvas
        ref={canvasRef}
        className="h-32 w-full rounded border border-white/20 [image-rendering:pixelated]"
        role="img"
        aria-label={`Spectrogram with the regions the model relied on to hear ${label} highlighted`}
      />
      <figcaption className="mt-1 flex flex-wrap justify-between gap-x-3 text-left text-xs opacity-70">
        <span>
          Snapshot when you clicked. Bright = what the model used to hear{" "}
          <span className="capitalize">{label}</span>
        </span>
        <span className="whitespace-nowrap tabular-nums">{cells.length} masked runs · {ms.toFixed(0)} ms</span>
      </figcaption>
    </figure>
  );
};

export default SaliencyView;
