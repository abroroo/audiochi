"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { describeMicError } from "./useMicAnalyser";
import { loadClassifier, rmsDb } from "../ml/classifier";
import { StreamingResampler } from "../ml/resample";

const INFERENCE_INTERVAL_MS = 500;
const QUIET_DB = -55; // below this RMS level the window is treated as silence
const EVENT_THRESHOLD = 0.4;
const EVENT_COOLDOWN_MS = 5000; // same sound is re-listed only after this gap
const MAX_EVENTS = 6;

async function loadOrt() {
  const ort = await import("onnxruntime-web/wasm");
  // Serve the WebAssembly runtime from the CDN build that matches the installed package.
  ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ort.env.versions.web}/dist/`;
  ort.env.wasm.numThreads = 1; // multi-threading needs cross-origin isolation headers
  return ort;
}

/**
 * Live sound classification: mic -> AudioWorklet PCM -> 16 kHz resampling -> sliding 2 s window
 * -> log-mel -> int8 ONNX model, every 500 ms.
 */
export default function useLiveClassifier() {
  // "idle" | "loading" | "listening" | "error"
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null); // { probs, ms, quiet, level }
  const [events, setEvents] = useState([]);
  const [labels, setLabels] = useState([]);

  const classifierRef = useRef(null);
  const audioRef = useRef(null); // { stream, ctx, node, timer }
  const sessionRef = useRef(0);

  const teardown = useCallback(() => {
    const audio = audioRef.current;
    audioRef.current = null;
    if (!audio) return;
    clearInterval(audio.timer);
    audio.node?.port.close();
    audio.node?.disconnect();
    audio.stream?.getTracks().forEach((t) => t.stop());
    if (audio.ctx && audio.ctx.state !== "closed") audio.ctx.close().catch(() => {});
  }, []);

  const stop = useCallback(() => {
    sessionRef.current += 1;
    teardown();
    setStatus("idle");
    setResult(null);
  }, [teardown]);

  const start = useCallback(async () => {
    const session = ++sessionRef.current;
    teardown();
    setError(null);
    setStatus("loading");
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === "undefined") {
        throw new Error("This browser can't capture audio for the model. Try a recent Chrome, Firefox or Safari.");
      }
      if (!classifierRef.current) classifierRef.current = await loadClassifier(await loadOrt());
      const clf = classifierRef.current;
      setLabels(clf.labels);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      await ctx.audioWorklet.addModule("/worklets/pcm-capture.js");
      const node = new AudioWorkletNode(ctx, "pcm-capture");
      ctx.createMediaStreamSource(stream).connect(node);

      // Ring buffer of the latest window at the model's sample rate.
      const resampler = new StreamingResampler(ctx.sampleRate, clf.meta.sampleRate);
      const windowBuf = new Float32Array(clf.windowSamples);
      let filled = 0;
      node.port.onmessage = ({ data }) => {
        const chunk = resampler.push(data);
        if (chunk.length >= windowBuf.length) {
          windowBuf.set(chunk.subarray(chunk.length - windowBuf.length));
        } else {
          windowBuf.copyWithin(0, chunk.length);
          windowBuf.set(chunk, windowBuf.length - chunk.length);
        }
        filled = Math.min(windowBuf.length, filled + chunk.length);
      };

      let busy = false;
      let lastEvent = { label: null, at: 0 };
      const timer = setInterval(async () => {
        if (busy || filled < windowBuf.length || session !== sessionRef.current) return;
        busy = true;
        try {
          const wave = windowBuf.slice();
          const level = rmsDb(wave);
          const quiet = level < QUIET_DB;
          const { probs, ms } = await clf.classify(wave);
          if (session !== sessionRef.current) return;
          setResult({ probs, ms, quiet, level });

          const top = probs.indexOf(Math.max(...probs));
          const now = Date.now();
          const isNew = clf.labels[top] !== lastEvent.label || now - lastEvent.at > EVENT_COOLDOWN_MS;
          if (!quiet && probs[top] >= EVENT_THRESHOLD && isNew) {
            lastEvent = { label: clf.labels[top], at: now };
            setEvents((prev) => [{ label: clf.labels[top], prob: probs[top], at: now }, ...prev].slice(0, MAX_EVENTS));
          }
        } finally {
          busy = false;
        }
      }, INFERENCE_INTERVAL_MS);

      audioRef.current = { stream, ctx, node, timer };
      setStatus("listening");
    } catch (err) {
      if (session !== sessionRef.current) return;
      teardown();
      const isMediaError = err?.name && err.name !== "Error" && err.name !== "TypeError";
      setError(isMediaError ? describeMicError(err) : err?.message || "Couldn't start the sound model.");
      setStatus("error");
    }
  }, [teardown]);

  useEffect(
    () => () => {
      sessionRef.current += 1;
      teardown();
      classifierRef.current?.release();
    },
    [teardown]
  );

  return { status, error, result, events, labels, start, stop };
}
