"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import useMicAnalyser from "../hooks/useMicAnalyser";
import useLiveClassifier from "../hooks/useLiveClassifier";
import { createFileSource } from "../audio/fileSource";
import { createSpectrogram3D, fillRow, FREQUENCY_SAMPLES, smoothRow, terrainRowMap } from "../utility/spectrogram3d";
import { createStepClock } from "../utility/frameClock";

// 1024 bins (~23 Hz each at 48 kHz) resampled onto 129 mel rows: smooth low end, sharp highs.
// Browser voice processing is off so the view shows the room as it is.
const MIC_OPTIONS = {
  fftSize: 2048,
  smoothingTimeConstant: 0.2, // light; smoothRow does the shaping
  audioConstraints: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
};

const MODES = {
  tunnel: {
    label: "Tunnel",
    stepsPerSecond: 45,
    text: "Fly through your sound. Time streams toward you, pitch runs around the wall (bass on the floor, highs on the ceiling) and loud sounds push in and glow. Sounds the model recognizes float past. Move the pointer or drag to look around.",
  },
  landscape: {
    label: "Landscape",
    stepsPerSecond: 60,
    text: "Sound as a moving landscape: time runs left to right, pitch goes front to back, and louder sounds rise higher and glow brighter. Drag to look around, scroll or pinch to zoom.",
  },
};

async function createView(mode, container) {
  if (mode === "tunnel") {
    // Loaded on demand: the bloom post-processing code is only needed for the tunnel.
    const { createSoundTunnel } = await import("../utility/soundTunnel");
    return createSoundTunnel(container, { rows: FREQUENCY_SAMPLES + 1 });
  }
  return createSpectrogram3D(container);
}

const Spectrogram3D = () => {
  const containerRef = useRef(null);
  const viewRef = useRef(null);
  const fileInputRef = useRef(null);
  const fileRef = useRef(null);
  const [mode, setMode] = useState("tunnel");
  const [viewError, setViewError] = useState(null);
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState(null);
  const { status, error, analyser, start, stop } = useMicAnalyser(MIC_OPTIONS);
  const classifier = useLiveClassifier();
  const isOn = status === "running" || status === "starting";

  // Mount the WebGL view for the current mode; free the GPU context when it changes or unmounts.
  useEffect(() => {
    let view = null;
    let cancelled = false;
    setViewError(null);
    createView(mode, containerRef.current)
      .then((v) => {
        if (cancelled) v.dispose();
        else viewRef.current = view = v;
      })
      .catch(() => !cancelled && setViewError("This browser couldn't start WebGL, so the 3D view can't be shown."));
    return () => {
      cancelled = true;
      viewRef.current = null;
      view?.dispose();
    };
  }, [mode]);

  // Feed analyser data into the view at a fixed rate.
  useEffect(() => {
    if (!analyser) {
      viewRef.current?.clear();
      return undefined;
    }
    const data = new Uint8Array(analyser.frequencyBinCount);
    const rowMap = terrainRowMap(data.length, analyser.context?.sampleRate ?? 48000);
    const row = new Uint8Array(FREQUENCY_SAMPLES + 1);
    const smoothState = new Float32Array(row.length);
    const steps = createStepClock(MODES[mode].stepsPerSecond);
    let frameId = 0;
    const tick = (now) => {
      frameId = requestAnimationFrame(tick);
      const n = steps(now ?? performance.now());
      viewRef.current?.setFraction?.(steps.fraction());
      if (n === 0) return;
      analyser.getByteFrequencyData(data);
      smoothRow(fillRow(row, data, rowMap), smoothState);
      for (let i = 0; i < n; i++) viewRef.current?.update(row);
    };
    tick();
    return () => cancelAnimationFrame(frameId);
  }, [analyser, mode]);

  // Each newly recognized sound becomes a label in the scene (the tunnel shows them).
  const lastEventRef = useRef(0);
  useEffect(() => {
    const latest = classifier.events[0];
    if (!latest || latest.at === lastEventRef.current) return;
    lastEventRef.current = latest.at;
    viewRef.current?.addLabel?.(latest.label);
  }, [classifier.events]);

  const stopFile = useCallback(() => {
    fileRef.current?.stop();
    fileRef.current = null;
    setFile(null);
  }, []);

  const stopAll = useCallback(() => {
    stopFile();
    stop();
    classifier.stop();
  }, [stop, stopFile, classifier]);

  const startMic = useCallback(() => {
    stopFile();
    start();
    classifier.start(); // labels are a bonus: if the model can't load, the visual still runs
  }, [start, stopFile, classifier]);

  const onFile = useCallback(
    async (e) => {
      const chosen = e.target.files?.[0];
      e.target.value = "";
      if (!chosen) return;
      stopAll();
      setFileError(null);
      try {
        const src = await createFileSource(chosen);
        fileRef.current = src;
        setFile(src);
        start({ stream: src.stream });
        classifier.start({ stream: src.stream });
        src.ended.then(() => {
          if (fileRef.current !== src) return;
          fileRef.current = null;
          setFile(null);
          stop();
          classifier.stop();
        });
      } catch (err) {
        setFileError(err.message || "Couldn't play that file.");
      }
    },
    [start, stop, stopAll, classifier]
  );

  useEffect(() => () => fileRef.current?.stop(), []);

  return (
    <div className="relative min-h-screen">
      <div ref={containerRef} className="fixed inset-0" aria-hidden="true" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-gradient-to-b from-black/60 to-transparent" aria-hidden="true" />

      <main className="pointer-events-none relative flex flex-col items-center gap-3 px-4 pt-8 text-center text-white [&_a]:pointer-events-auto [&_button]:pointer-events-auto">
        <div className="flex flex-wrap items-center justify-center gap-3">
          <h1>3D Spectrogram</h1>
          <Link href="/" className="button-28 button-28--small">
            View in 2D &#10548;
          </Link>
        </div>
        <div role="radiogroup" aria-label="3D view" className="flex gap-1 rounded-full border border-white/30 p-1 text-sm">
          {Object.entries(MODES).map(([key, m]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={mode === key}
              onClick={() => setMode(key)}
              className={`rounded-full px-4 py-1 ${mode === key ? "bg-white text-[#220033]" : "hover:bg-white/10"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p data-test="spectrogram-p-text" className="max-w-xl text-sm [text-shadow:0_1px_6px_rgba(0,0,0,0.8)]">
          {MODES[mode].text}
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" className="button-28" onClick={isOn && !file ? stopAll : startMic} aria-pressed={isOn && !file}>
            {status === "starting" && !file ? "Waiting for microphone…" : isOn && !file ? "Stop" : "Visualize in 3D"}
          </button>
          <button type="button" className="button-28" onClick={file ? stopAll : () => fileInputRef.current?.click()}>
            {file ? "Stop file" : "Use an audio file"}
          </button>
          <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={onFile} aria-label="Audio file" />
          {mode === "landscape" && (
            <button type="button" className="button-28 button-28--small" onClick={() => viewRef.current?.resetView?.()}>
              Reset view
            </button>
          )}
        </div>
        {file && <p className="text-xs opacity-80">Playing <span className="font-semibold">{file.name}</span></p>}
        {(error || fileError || viewError) && (
          <p role="alert" className="max-w-md text-sm text-orange-300">
            {error || fileError || viewError}
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
