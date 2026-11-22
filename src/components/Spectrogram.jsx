"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import useMicAnalyser from "../hooks/useMicAnalyser";
import { createFileSource } from "../audio/fileSource";
import { buildLoudnessLut, buildRowMap, fillRow, freqToY, paintColumn } from "../utility/spectrogramColors";
import { createStepClock } from "../utility/frameClock";
import { detectPitch, freqToNote } from "../utility/pitch";
import { categoryColor } from "../utility/categories";
import SoundClassifier from "./SoundClassifier";
import SoundOrb from "./SoundOrb";

const FFT_SIZE = 4096; // 2048 frequency bins
// No smoothing across frames: a spectrogram should show onsets (claps, clicks) sharply.
// Browser voice processing would hide steady sounds like "shhh", so it is off too.
const MIC_OPTIONS = {
  fftSize: FFT_SIZE,
  smoothingTimeConstant: 0,
  audioConstraints: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
};
const PIXELS_PER_SECOND = 60;
const PITCH_CLARITY = 0.85; // below this the sound is too noisy to call a note
const PITCH_WINDOW = 2048; // samples given to YIN (~43 ms at 48 kHz)
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

/** Median of the last three pitch estimates: removes single-frame octave jumps. */
function median3(a, b, c) {
  return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
}

const Spectrogram = () => {
  const canvasRef = useRef(null);
  const wallContainerRef = useRef(null);
  const wallRef = useRef(null); // WebGL wall; null means the 2D canvas fallback is in use
  const wallModRef = useRef(null); // the lazily loaded wall module (row count, frequency -> row)
  const [wallReady, setWallReady] = useState(false);
  const [note, setNote] = useState(null);
  const [accent, setAccent] = useState(null);
  const fileInputRef = useRef(null);
  const { status, error, analyser, start, stop } = useMicAnalyser(MIC_OPTIONS);
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

  // Prefer the WebGL wall; keep the 2D canvas if WebGL isn't available.
  useEffect(() => {
    let wall = null;
    let cancelled = false;
    import("../utility/spectrogramWall")
      .then((mod) => {
        if (cancelled) return;
        wall = mod.createSpectrogramWall(wallContainerRef.current, { background: SILENCE });
        wallModRef.current = mod;
        wallRef.current = wall;
        setWallReady(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      wallRef.current = null;
      wall?.dispose();
    };
  }, []);

  const onResult = useCallback((result) => {
    if (result && !result.quiet && !result.unknown) setAccent(categoryColor(result.top));
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

  // WebGL wall: one mel column per step into the GPU ring buffer, plus the pitch trace.
  useEffect(() => {
    if (!analyser || !wallReady) return undefined;
    const { WALL_ROWS, wallRowForFreq } = wallModRef.current;
    const sampleRate = analyser.context?.sampleRate ?? 48000;
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const timeData = new Float32Array(analyser.fftSize);
    const rowMap = buildRowMap(WALL_ROWS, frequencyData.length, sampleRate).reverse(); // bottom row first
    const column = new Uint8Array(WALL_ROWS);
    const steps = createStepClock(PIXELS_PER_SECOND);
    const recent = [0, 0, 0];
    let pitch = null;
    let stepCount = 0;
    let lastNoteUpdate = 0;
    let frameId = 0;

    const draw = (now = performance.now()) => {
      frameId = requestAnimationFrame(draw);
      const n = steps(now);
      if (n === 0) return;
      analyser.getByteFrequencyData(frequencyData);
      fillRow(column, frequencyData, rowMap);

      // Pitch at 30 Hz is plenty for a smooth trace and keeps YIN's cost low.
      if (stepCount++ % 2 === 0) {
        analyser.getFloatTimeDomainData(timeData);
        const p = detectPitch(timeData.subarray(timeData.length - PITCH_WINDOW), sampleRate);
        if (p && p.clarity >= PITCH_CLARITY) {
          recent.shift();
          recent.push(p.freq);
          pitch = { freq: recent[0] ? median3(...recent) : p.freq, clarity: p.clarity };
        } else {
          pitch = null;
          recent.fill(0);
        }
        if (now - lastNoteUpdate > 120) {
          lastNoteUpdate = now;
          setNote(pitch ? { ...freqToNote(pitch.freq), freq: pitch.freq } : null);
        }
      }
      const row = pitch ? wallRowForFreq(pitch.freq) : null;
      for (let i = 0; i < n; i++) wallRef.current?.push(column, row, pitch?.clarity ?? 0);
    };
    draw();
    return () => {
      cancelAnimationFrame(frameId);
      setNote(null);
    };
  }, [analyser, wallReady]);

  // 2D canvas fallback: shift the image left, paint the newest column on the right.
  useEffect(() => {
    if (!analyser || wallReady) return undefined;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const frequencyData = new Uint8Array(analyser.frequencyBinCount);
    const sampleRate = analyser.context?.sampleRate ?? 48000;
    const steps = createStepClock(PIXELS_PER_SECOND);
    let column = null;
    let rowMap = null;
    let frameId = 0;

    const draw = (now) => {
      frameId = requestAnimationFrame(draw);
      const n = steps(now ?? performance.now());
      if (n === 0) return;
      const { width, height: h } = canvas;
      if (!column || column.height !== h) {
        column = ctx.createImageData(1, h);
        rowMap = buildRowMap(h, frequencyData.length, sampleRate);
      }

      ctx.drawImage(canvas, -n, 0);
      analyser.getByteFrequencyData(frequencyData);
      paintColumn(frequencyData, column.data, LUT, rowMap);
      for (let i = n; i >= 1; i--) ctx.putImageData(column, width - i, 0);
    };
    draw();

    return () => cancelAnimationFrame(frameId);
  }, [analyser, wallReady]);

  return (
    <div data-test="spectrogram-container" className="relative min-h-screen">
      <canvas ref={canvasRef} className={`fixed inset-0 -z-10 h-full w-full ${wallReady ? "hidden" : ""}`} aria-hidden="true" />
      <div ref={wallContainerRef} className="fixed inset-0 -z-10" aria-hidden="true" />
      {/* Mel-scaled frequency axis (the WebGL wall draws its own) */}
      <ol className="pointer-events-none fixed inset-y-0 left-0 -z-[5] text-[10px] text-white/50" aria-hidden="true">
        {height > 0 &&
          !wallReady &&
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

        <SoundOrb analyser={analyser} accent={accent} />

        <p data-test="spectrogram-title-text" className="max-w-xl text-sm">
          Use your microphone, or any audio file if you&apos;d rather not. A quiet room works best.
        </p>

        <p data-test="spectrogram-p-text" className="mt-6 max-w-xl text-sm">
          The spectrogram scrolls right to left. Height is pitch on a mel scale (how we hear it, low notes at the
          bottom) and colour is loudness, from violet when quiet to yellow when loud. Whistle or hum and a cyan line
          traces your melody.
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
        {isOn && (
          <p className="h-5 text-sm tabular-nums" aria-live="off" data-test="pitch-readout">
            {note ? (
              <>
                <span className="text-cyan-300">♪ {note.name}</span>{" "}
                <span className="opacity-70">
                  {note.cents >= 0 ? "+" : ""}
                  {note.cents}¢ · {note.freq.toFixed(0)} Hz
                </span>
              </>
            ) : (
              <span className="opacity-50">♪ no clear pitch</span>
            )}
          </p>
        )}
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

        <SoundClassifier source={file} onResult={onResult} />
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
