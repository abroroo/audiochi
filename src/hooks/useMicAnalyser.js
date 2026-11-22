"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Turn a getUserMedia / AudioContext error into a message a user can act on.
 */
export function describeMicError(error) {
  switch (error?.name) {
    case "NotAllowedError":
    case "SecurityError":
      return "Microphone access was blocked. Allow it in your browser's site settings and try again.";
    case "NotFoundError":
    case "OverconstrainedError":
      return "No microphone was found. Plug one in and try again.";
    case "NotReadableError":
      return "Your microphone is being used by another app. Close it and try again.";
    default:
      return "Couldn't start the microphone. Please try again.";
  }
}

/**
 * Owns the full microphone → AudioContext → AnalyserNode lifecycle.
 *
 * Everything that must be torn down (media tracks, audio context) lives in refs,
 * so cleanup never reads stale React state. `stop()` and unmount release all of it.
 *
 * @param {object} options
 * @param {number} options.fftSize AnalyserNode FFT size (power of two, 32–32768).
 * @param {number} [options.smoothingTimeConstant] AnalyserNode smoothing (0–1).
 * @param {MediaTrackConstraints|boolean} [options.audioConstraints] getUserMedia audio constraints.
 */
export default function useMicAnalyser({
  fftSize,
  smoothingTimeConstant = 0.8,
  audioConstraints = true,
}) {
  // "idle" | "starting" | "running" | "error"
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [analyser, setAnalyser] = useState(null);

  const streamRef = useRef(null);
  const contextRef = useRef(null);
  // Incremented on every start/stop so a getUserMedia promise that resolves
  // after the user already pressed Stop (or unmounted) can detect it is stale.
  const sessionRef = useRef(0);

  const release = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    const ctx = contextRef.current;
    contextRef.current = null;
    if (ctx && ctx.state !== "closed") {
      ctx.close().catch(() => {});
    }
  }, []);

  const stop = useCallback(() => {
    sessionRef.current += 1;
    release();
    setAnalyser(null);
    setStatus("idle");
  }, [release]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("This browser can't access a microphone. Try a recent Chrome, Firefox or Safari over HTTPS.");
      setStatus("error");
      return;
    }

    const session = ++sessionRef.current;
    release();
    setError(null);
    setStatus("starting");

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      if (session !== sessionRef.current) {
        // Stopped or restarted while the permission prompt was open.
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioCtx();
      const node = ctx.createAnalyser();
      node.fftSize = fftSize;
      node.smoothingTimeConstant = smoothingTimeConstant;
      ctx.createMediaStreamSource(stream).connect(node);

      streamRef.current = stream;
      contextRef.current = ctx;
      setAnalyser(node);
      setStatus("running");
    } catch (err) {
      if (session !== sessionRef.current) return;
      release();
      setError(describeMicError(err));
      setStatus("error");
    }
  }, [audioConstraints, fftSize, smoothingTimeConstant, release]);

  // Release the mic and audio context when the component unmounts.
  useEffect(
    () => () => {
      sessionRef.current += 1;
      release();
    },
    [release]
  );

  return { status, error, analyser, start, stop };
}
