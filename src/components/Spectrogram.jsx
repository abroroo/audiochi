"use client";
import React, { useEffect, useRef } from "react";
import Link from "next/link";
import useMicAnalyser from "../hooks/useMicAnalyser";
import { buildLoudnessLut, paintColumn } from "../utility/spectrogramColors";
import SoundClassifier from "./SoundClassifier";

const BACKGROUND = "#220033";
const FFT_SIZE = 4096; // 2048 frequency bins

/** Size the canvas to the viewport and clear it to the background colour. */
function fitCanvas(canvas) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

const Spectrogram = () => {
  const canvasRef = useRef(null);
  const { status, error, analyser, start, stop } = useMicAnalyser({ fftSize: FFT_SIZE });
  const isOn = status === "running" || status === "starting";

  // Keep the canvas sized to the window.
  useEffect(() => {
    const canvas = canvasRef.current;
    fitCanvas(canvas);
    const onResize = () => fitCanvas(canvas);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Scrolling spectrogram: shift the image 1px left, paint the newest column on the right.
  useEffect(() => {
    if (!analyser) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const lut = buildLoudnessLut();
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    let column = null;
    let frameId = 0;

    const draw = () => {
      frameId = requestAnimationFrame(draw);
      const { width, height } = canvas;
      if (!column || column.height !== height) column = ctx.createImageData(1, height);

      ctx.drawImage(canvas, -1, 0);
      analyser.getByteFrequencyData(frequencyData);
      paintColumn(frequencyData, column.data, lut);
      ctx.putImageData(column, width - 1, 0);
    };
    draw();

    return () => cancelAnimationFrame(frameId);
  }, [analyser]);

  return (
    <div data-test="spectrogram-container" className="relative min-h-screen">
      <canvas ref={canvasRef} className="fixed inset-0 -z-10 h-full w-full" aria-hidden="true" />

      <main className="flex flex-col items-center gap-2 px-4 pb-20 pt-8 text-center text-white">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <h1 data-test="spectrogram-title">Sound Recognition</h1>
          <Link href="/viewIn3D" className="button-28 button-28--small">
            View in 3D &#10548;
          </Link>
          <Link href="/explore" className="button-28 button-28--small">
            Sound map &#10548;
          </Link>
        </div>

        <p data-test="spectrogram-title-text" className="max-w-xl text-sm">
          This experiment needs your microphone. It works best in a quiet room.
        </p>

        <p data-test="spectrogram-p-text" className="mt-6 max-w-xl text-sm">
          The spectrogram scrolls right to left: height is pitch (low notes at the bottom) and colour is loudness,
          from purple when quiet to orange when loud. Try a long &quot;shhh&quot; to see it light up.
        </p>
        <button
          data-test="spectrogram-toggle-button"
          type="button"
          className="button-28"
          onClick={isOn ? stop : start}
          aria-pressed={isOn}
        >
          {status === "starting" ? "Waiting for microphone…" : isOn ? "Stop spectrogram" : "Visualize audio"}
        </button>
        {error && (
          <p role="alert" data-test="mic-error" className="max-w-md text-sm text-orange-300">
            {error}
          </p>
        )}

        <SoundClassifier />
      </main>

      <footer data-test="author-tag" className="absolute bottom-4 left-0 w-full text-center text-xs text-[#a89bb3]">
        by{" "}
        <a target="_blank" rel="noopener noreferrer" href="https://github.com/abroroo" className="underline">
          abroro
        </a>
      </footer>
    </div>
  );
};

export default Spectrogram;
