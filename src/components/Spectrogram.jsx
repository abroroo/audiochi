"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import useMicAnalyser from "../hooks/useMicAnalyser";
import { createFileSource } from "../audio/fileSource";
import { buildLoudnessLut, buildRowMap, freqToY, paintColumn } from "../utility/spectrogramColors";
import SoundClassifier from "./SoundClassifier";

const FFT_SIZE = 4096; // 2048 frequency bins
const LUT = buildLoudnessLut();
const SILENCE = `rgb(${LUT[0]}, ${LUT[1]}, ${LUT[2]})`;
const TICKS = [
  [100, "100 Hz"], [250, "250"], [500, "500"], [1000, "1 kHz"], [2000, "2k"], [4000, "4k"], [8000, "8k"], [16000, "16k"],
];

/** Size the canvas to the viewport and clear it to the colour of silence. */
function fitCanvas(canvas) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = SILENCE;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

const Spectrogram = () => {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const { status, error, analyser, start, stop } = useMicAnalyser({ fftSize: FFT_SIZE });
  const [height, setHeight] = useState(0);
  const [file, setFile] = useState(null); // playing file source, shared with the classifier
  const [fileError, setFileError] = useState(null);
  const [fileLoading, setFileLoading] = useState(false);
  const fileRef = useRef(null);
  const isOn = status === "running" || status === "starting";
  const micOn = isOn && !file;

  // Keep the canvas sized to the window.
  useEffect(() => {
    const canvas = canvasRef.current;
    const fit = () => {
      fitCanvas(canvas);
      setHeight(canvas.height);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const stopFile = useCallback(() => {
    fileRef.current?.stop();
    fileRef.current = null;
    setFile(null);
  }, []);

  const stopAll = useCallback(() => {
    stopFile();
    stop();
  }, [stop, stopFile]);

  const startMic = useCallback(() => {
    stopFile();
    start();
  }, [start, stopFile]);

  const onFile = useCallback(
    async (e) => {
      const chosen = e.target.files?.[0];
      e.target.value = ""; // allow picking the same file again
      if (!chosen) return;
      stopAll();
      setFileError(null);
      setFileLoading(true);
      try {
        const src = await createFileSource(chosen);
        fileRef.current = src;
        setFile(src);
        start({ stream: src.stream });
        src.ended.then(() => {
          if (fileRef.current !== src) return;
          fileRef.current = null;
          setFile(null);
          stop();
        });
      } catch (err) {
        setFileError(err.message || "Couldn't play that file.");
      } finally {
        setFileLoading(false);
      }
    },
    [start, stop, stopAll]
  );

  useEffect(() => () => fileRef.current?.stop(), []);

  // Scrolling spectrogram: shift the image 1px left, paint the newest column on the right.
  useEffect(() => {
    if (!analyser) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const sampleRate = analyser.context?.sampleRate ?? 48000;
    let column = null;
    let rowMap = null;
    let frameId = 0;

    const draw = () => {
      frameId = requestAnimationFrame(draw);
      const { width, height: h } = canvas;
      if (!column || column.height !== h) {
        column = ctx.createImageData(1, h);
        rowMap = buildRowMap(h, frequencyData.length, sampleRate);
      }

      ctx.drawImage(canvas, -1, 0);
      analyser.getByteFrequencyData(frequencyData);
      paintColumn(frequencyData, column.data, LUT, rowMap);
      ctx.putImageData(column, width - 1, 0);
    };
    draw();

    return () => cancelAnimationFrame(frameId);
  }, [analyser]);

  return (
    <div data-test="spectrogram-container" className="relative min-h-screen">
      <canvas ref={canvasRef} className="fixed inset-0 -z-10 h-full w-full" aria-hidden="true" />
      {/* Mel-scaled frequency axis */}
      <ol className="pointer-events-none fixed inset-y-0 left-0 -z-[5] text-[10px] text-white/50" aria-hidden="true">
        {height > 0 &&
          TICKS.map(([f, label]) => (
            <li
              key={f}
              className="absolute left-0 flex items-center gap-1 whitespace-nowrap"
              style={{ top: Math.max(2, freqToY(f, height) - 6) }}
            >
              <span className="inline-block h-px w-2 bg-white/40" />
              {label}
            </li>
          ))}
      </ol>

      <main className="mx-auto flex max-w-2xl flex-col items-center gap-2 px-4 pb-20 pt-8 text-center text-white">
        {/* Soft scrim so text stays readable over a bright spectrogram, especially on narrow screens. */}
        <div className="pointer-events-none fixed inset-y-0 left-1/2 -z-[6] w-full max-w-2xl -translate-x-1/2 bg-[#12062a]/55 backdrop-blur-[2px] [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]" />
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
          Use your microphone, or any audio file if you&apos;d rather not. A quiet room works best.
        </p>

        <p data-test="spectrogram-p-text" className="mt-6 max-w-xl text-sm">
          The spectrogram scrolls right to left. Height is pitch on a mel scale (how we hear it, low notes at the
          bottom) and colour is loudness, from violet when quiet to yellow when loud. Try a long &quot;shhh&quot;.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            data-test="spectrogram-toggle-button"
            type="button"
            className="button-28"
            onClick={micOn ? stopAll : startMic}
            aria-pressed={micOn}
          >
            {status === "starting" && !file ? "Waiting for microphone…" : micOn ? "Stop spectrogram" : "Visualize audio"}
          </button>
          <button
            type="button"
            className="button-28"
            data-test="file-button"
            onClick={file ? stopAll : () => fileInputRef.current?.click()}
            disabled={fileLoading}
          >
            {fileLoading ? "Decoding…" : file ? "Stop file" : "Use an audio file"}
          </button>
          <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={onFile} data-test="file-input" aria-label="Audio file" />
        </div>
        {file && (
          <p className="text-xs opacity-80" data-test="file-playing">
            Playing <span className="font-semibold">{file.name}</span> ({file.duration.toFixed(0)} s). No microphone needed.
          </p>
        )}
        {fileError && (
          <p role="alert" className="max-w-md text-sm text-orange-300">
            {fileError}
          </p>
        )}
        {error && (
          <p role="alert" data-test="mic-error" className="max-w-md text-sm text-orange-300">
            {error}
          </p>
        )}

        <SoundClassifier source={file} />
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
