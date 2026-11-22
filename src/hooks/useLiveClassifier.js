"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { describeMicError, externalStream } from "./useMicAnalyser";
import { loadClassifier, rmsDb } from "../ml/classifier";
import { StreamingResampler } from "../ml/resample";
import { SPACE_URL, centroidSims, decodeSpace, nearest, placeIn3D, project, soundsLikeSpeech } from "../ml/space";
import { MAX_EXAMPLES, MAX_SOUNDS, loadSounds, matchTaught, saveSounds } from "../ml/fewshot";

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

/** The embedding space is optional: without it the app still classifies, minus the extra features. */
export async function loadSpace() {
  try {
    const res = await fetch(SPACE_URL);
    return res.ok ? decodeSpace(await res.json()) : null;
  } catch {
    return null;
  }
}

/**
 * Live sound classification: mic -> AudioWorklet PCM -> 16 kHz resampling -> sliding 2 s window
 * -> log-mel -> int8 ONNX model, every 500 ms. On top of the model's embedding it adds
 * unknown-sound detection, sounds taught by the user, a position in the 3D sound map and
 * on-demand saliency.
 */
export default function useLiveClassifier() {
  // "idle" | "loading" | "listening" | "error"
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [events, setEvents] = useState([]);
  const [labels, setLabels] = useState([]);
  const [space, setSpace] = useState(null);
  const [taught, setTaught] = useState([]);

  const classifierRef = useRef(null);
  const spaceRef = useRef(null);
  const taughtRef = useRef([]);
  const audioRef = useRef(null); // { stream, ownsStream, ctx, node, timer }
  const sessionRef = useRef(0);
  const lastRef = useRef(null); // latest { logmel, top, at } for explain()
  const captureRef = useRef(null); // pending "teach" capture
  const lockRef = useRef(Promise.resolve()); // one ONNX run at a time

  const exclusive = useCallback((fn) => {
    const next = lockRef.current.then(fn, fn);
    lockRef.current = next.catch(() => {});
    return next;
  }, []);

  const updateTaught = useCallback((sounds) => {
    taughtRef.current = sounds;
    setTaught(sounds);
    saveSounds(sounds);
  }, []);

  const teardown = useCallback(() => {
    const audio = audioRef.current;
    audioRef.current = null;
    captureRef.current?.reject(new Error("Stopped listening."));
    captureRef.current = null;
    if (!audio) return;
    clearInterval(audio.timer);
    audio.node?.port.close();
    audio.node?.disconnect();
    if (audio.ownsStream) audio.stream?.getTracks().forEach((t) => t.stop());
    if (audio.ctx && audio.ctx.state !== "closed") audio.ctx.close().catch(() => {});
  }, []);

  const stop = useCallback(() => {
    sessionRef.current += 1;
    teardown();
    setStatus("idle");
    setResult(null);
  }, [teardown]);

  /** Analyse one window: the embedding-space features layered on the class probabilities. */
  const analyse = useCallback((clf, { probs, embedding, unknown, energy }) => {
    const sp = spaceRef.current;
    const top = probs.indexOf(Math.max(...probs));
    if (!sp || !embedding) return { top, vec: null, unknown, energy };
    const vec = project(sp, embedding);
    const neighbours = nearest(sp, vec);
    const bestEsc = Math.max(...centroidSims(sp, vec));
    const taughtMatch = matchTaught(vec, taughtRef.current, bestEsc, sp.taughtMinSim ?? 0.5);
    const speech = !taughtMatch && soundsLikeSpeech(sp, vec, bestEsc);
    // A taught sound is by definition not one of the 50 classes, so it overrides "unknown".
    return {
      top, vec, energy, taughtMatch, speech,
      unknown: !taughtMatch && (unknown || speech),
      position: placeIn3D(sp, neighbours),
    };
  }, []);

  const start = useCallback(async (options) => {
    const external = externalStream(options);
    const session = ++sessionRef.current;
    teardown();
    setError(null);
    setStatus("loading");
    try {
      if ((!external && !navigator.mediaDevices?.getUserMedia) || typeof AudioWorkletNode === "undefined") {
        throw new Error("This browser can't capture audio for the model. Try a recent Chrome, Firefox or Safari.");
      }
      if (!classifierRef.current) {
        const [clf, sp] = await Promise.all([loadOrt().then(loadClassifier), loadSpace()]);
        classifierRef.current = clf;
        spaceRef.current = sp;
        setSpace(sp);
        if (sp) {
          taughtRef.current = loadSounds(sp.dims);
          setTaught(taughtRef.current);
        }
      }
      const clf = classifierRef.current;
      setLabels(clf.labels);

      const stream =
        external ??
        (await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        }));
      if (session !== sessionRef.current) {
        if (!external) stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      await ctx.audioWorklet.addModule("/worklets/pcm-capture.js");
      const node = new AudioWorkletNode(ctx, "pcm-capture");
      ctx.createMediaStreamSource(stream).connect(node);
      if (ctx.state === "suspended") await ctx.resume().catch(() => {});

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
          const out = await exclusive(() => clf.classify(wave));
          if (session !== sessionRef.current) return;
          const a = analyse(clf, out);
          const now = Date.now();
          lastRef.current = { logmel: out.logmel, top: a.top, quiet, at: now };
          setResult({ probs: out.probs, ms: out.ms, quiet, level, ...a, vec: undefined });

          const capture = captureRef.current;
          if (capture && now >= capture.dueAt) {
            captureRef.current = null;
            if (quiet) capture.reject(new Error("Too quiet. Make the sound louder or closer."));
            else if (!a.vec) capture.reject(new Error("Teaching needs the embedding file, which didn't load."));
            else capture.resolve(a.vec);
          }

          const label = a.taughtMatch?.name ?? clf.labels[a.top];
          const prob = a.taughtMatch ? a.taughtMatch.sim : out.probs[a.top];
          const confident = a.taughtMatch || (out.probs[a.top] >= EVENT_THRESHOLD && !a.unknown);
          const isNew = label !== lastEvent.label || now - lastEvent.at > EVENT_COOLDOWN_MS;
          if (!quiet && confident && isNew) {
            lastEvent = { label, at: now };
            setEvents((prev) => [{ label, prob, at: now, taught: !!a.taughtMatch }, ...prev].slice(0, MAX_EVENTS));
          }
        } finally {
          busy = false;
        }
      }, INFERENCE_INTERVAL_MS);

      audioRef.current = { stream, ownsStream: !external, ctx, node, timer };
      setStatus("listening");
    } catch (err) {
      if (session !== sessionRef.current) return;
      teardown();
      const isMediaError = err?.name && err.name !== "Error" && err.name !== "TypeError";
      setError(isMediaError ? describeMicError(err) : err?.message || "Couldn't start the sound model.");
      setStatus("error");
    }
  }, [teardown, analyse, exclusive]);

  /**
   * Record one example of a taught sound: waits for a fresh 2 s window, then stores its embedding.
   * Rejects if not listening, too quiet, or the sound is full.
   */
  const recordExample = useCallback(
    (rawName) => {
      const name = rawName.trim().slice(0, 40);
      if (!name) return Promise.reject(new Error("Give the sound a name first."));
      if (!audioRef.current) return Promise.reject(new Error("Start listening first."));
      const existing = taughtRef.current.find((s) => s.name === name);
      if (!existing && taughtRef.current.length >= MAX_SOUNDS) {
        return Promise.reject(new Error(`You can teach up to ${MAX_SOUNDS} sounds. Remove one first.`));
      }
      if (existing && existing.examples.length >= MAX_EXAMPLES) {
        return Promise.reject(new Error(`"${name}" already has ${MAX_EXAMPLES} examples.`));
      }
      captureRef.current?.reject(new Error("Replaced by a newer recording."));
      return new Promise((resolve, reject) => {
        // The window must be entirely recorded after the click, so wait one window length.
        const dueAt = Date.now() + (classifierRef.current?.meta.windowSeconds ?? 2) * 1000;
        captureRef.current = { resolve, reject, dueAt };
      }).then((vec) => {
        const sounds = taughtRef.current.filter((s) => s.name !== name);
        const prev = taughtRef.current.find((s) => s.name === name);
        updateTaught([...sounds, { name, examples: [...(prev?.examples ?? []), vec] }]);
        return (prev?.examples.length ?? 0) + 1;
      });
    },
    [updateTaught]
  );

  const forgetSound = useCallback(
    (name) => updateTaught(taughtRef.current.filter((s) => s.name !== name)),
    [updateTaught]
  );

  /** Occlusion saliency for the latest window and its top class. */
  const explain = useCallback(async () => {
    const clf = classifierRef.current;
    const last = lastRef.current;
    if (!clf || !last) throw new Error("Nothing heard yet.");
    const res = await exclusive(() => clf.explain(last.logmel, last.top));
    return { ...res, logmel: last.logmel, label: clf.labels[last.top], nMels: clf.meta.nMels };
  }, [exclusive]);

  useEffect(
    () => () => {
      sessionRef.current += 1;
      teardown();
      classifierRef.current?.release();
    },
    [teardown]
  );

  return { status, error, result, events, labels, space, taught, start, stop, recordExample, forgetSound, explain };
}
