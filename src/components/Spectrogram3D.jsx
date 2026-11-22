"use client";
import React, { useEffect, useRef } from "react";
import Link from "next/link";
import useMicAnalyser from "../hooks/useMicAnalyser";
import { createSpectrogram3D, fillRow, FREQUENCY_SAMPLES, smoothRow, terrainRowMap } from "../utility/spectrogram3d";
import { createStepClock } from "../utility/frameClock";

// 1024 bins (~23 Hz each at 48 kHz) resampled onto 129 mel rows: smooth low end, sharp highs.
// Browser voice processing is off so the terrain shows the room as it is.
const MIC_OPTIONS = {
  fftSize: 2048,
  smoothingTimeConstant: 0.2, // light; smoothRow does the shaping
  audioConstraints: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
};
const STEPS_PER_SECOND = 60;

const Spectrogram3D = () => {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const { status, error, analyser, start, stop } = useMicAnalyser(MIC_OPTIONS);
  const isOn = status === "running" || status === "starting";

  // Mount the WebGL scene once; free the GPU context on unmount.
  useEffect(() => {
    let view;
    try {
      view = createSpectrogram3D(containerRef.current);
      viewRef.current = view;
    } catch {
      return undefined; // WebGL unavailable; the page still renders its controls.
    }
    return () => {
      viewRef.current = null;
      view.dispose();
    };
  }, []);

  // Feed analyser data into the terrain while the mic is running.
  useEffect(() => {
    if (!analyser) {
      viewRef.current?.clear();
      return undefined;
    }
    const data = new Uint8Array(analyser.frequencyBinCount);
    const rowMap = terrainRowMap(data.length, analyser.context?.sampleRate ?? 48000);
    const row = new Uint8Array(FREQUENCY_SAMPLES + 1);
    const smoothState = new Float32Array(row.length);
    const steps = createStepClock(STEPS_PER_SECOND);
    let frameId = 0;
    const tick = (now) => {
      frameId = requestAnimationFrame(tick);
      const n = steps(now ?? performance.now());
      if (n === 0) return;
      analyser.getByteFrequencyData(data);
      smoothRow(fillRow(row, data, rowMap), smoothState);
      for (let i = 0; i < n; i++) viewRef.current?.update(row);
    };
    tick();
    return () => cancelAnimationFrame(frameId);
  }, [analyser]);

  return (
    <div className="relative min-h-screen">
      <div ref={containerRef} className="fixed inset-0" aria-hidden="true" />

      <main className="pointer-events-none relative flex flex-col items-center gap-3 px-4 pt-8 text-center text-white [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <h1>3D Spectrogram</h1>
          <Link href="/" className="button-28 button-28--small">
            View in 2D &#10548;
          </Link>
        </div>
        <p data-test="spectrogram-p-text" className="max-w-xl text-sm">
          Sound as a moving landscape: time runs left to right, pitch goes front to back, and louder sounds rise
          higher and glow brighter. Drag to look around, scroll or pinch to zoom.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" className="button-28" onClick={isOn ? stop : () => start()} aria-pressed={isOn}>
            {status === "starting" ? "Waiting for microphone…" : isOn ? "Stop" : "Visualize in 3D"}
          </button>
          <button type="button" className="button-28 button-28--small" onClick={() => viewRef.current?.resetView()}>
            Reset view
          </button>
        </div>
        {error && (
          <p role="alert" className="max-w-md text-sm text-orange-300">
            {error}
          </p>
        )}
      </main>

      <footer data-test="author-tag" className="pointer-events-none fixed bottom-4 left-0 w-full text-center text-xs text-[#a89bb3]">
        by{" "}
        <a target="_blank" rel="noopener noreferrer" href="https://github.com/abroroo" className="pointer-events-auto underline">
          abroro
        </a>
      </footer>
    </div>
  );
};

export default Spectrogram3D;
