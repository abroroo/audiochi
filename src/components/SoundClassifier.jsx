"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";

// Teachable Machine export, fine-tuned on top of TF.js speech-commands.
const MODEL_BASE_URL = "https://storage.googleapis.com/tm-model/gkl9L4FLn/";

/**
 * Live sound classification with the TF.js speech-commands recognizer.
 * Expects the `speechCommands` global from the CDN scripts loaded by the page.
 */
const SoundClassifier = () => {
  // "idle" | "loading" | "listening" | "error"
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const [labels, setLabels] = useState([]);
  const [scores, setScores] = useState([]);

  const recognizerRef = useRef(null);
  const mountedRef = useRef(true);

  const stopListening = useCallback(async () => {
    const recognizer = recognizerRef.current;
    if (recognizer?.isListening()) {
      try {
        await recognizer.stopListening();
      } catch {
        // Already stopped; nothing to release.
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopListening();
    };
  }, [stopListening]);

  const loadRecognizer = useCallback(async () => {
    if (recognizerRef.current) return recognizerRef.current;
    if (typeof window.speechCommands === "undefined") {
      throw new Error("The speech model library didn't load. Check your connection and refresh the page.");
    }
    const recognizer = window.speechCommands.create(
      "BROWSER_FFT",
      undefined,
      `${MODEL_BASE_URL}model.json`,
      `${MODEL_BASE_URL}metadata.json`
    );
    await recognizer.ensureModelLoaded();
    recognizerRef.current = recognizer;
    return recognizer;
  }, []);

  const start = useCallback(async () => {
    setError(null);
    setStatus("loading");
    try {
      const recognizer = await loadRecognizer();
      if (!mountedRef.current) return;
      const wordLabels = recognizer.wordLabels();
      setLabels(wordLabels);
      setScores(new Array(wordLabels.length).fill(0));

      await recognizer.listen(
        async (result) => {
          if (mountedRef.current) setScores(Array.from(result.scores));
        },
        // Report every frame (including background noise) so the bars always reflect the live scores.
        { probabilityThreshold: 0, invokeCallbackOnNoiseAndUnknown: true, overlapFactor: 0.5 }
      );
      if (mountedRef.current) setStatus("listening");
    } catch (err) {
      if (!mountedRef.current) return;
      setError(
        err?.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser's site settings and try again."
          : err?.message || "Couldn't start the sound model."
      );
      setStatus("error");
    }
  }, [loadRecognizer]);

  const stop = useCallback(async () => {
    await stopListening();
    setStatus("idle");
  }, [stopListening]);

  const topIndex = scores.length ? scores.indexOf(Math.max(...scores)) : -1;
  const isBusy = status === "loading";
  const isListening = status === "listening";

  return (
    <div data-test="sound-prediction-container" className="flex w-full flex-col items-center justify-center text-white">
      <p data-test="sound-prediction-intro" className="my-5 max-w-xl text-center text-sm">
        A transfer-learned model recognizes sounds like claps, snaps and &quot;shhh&quot; in real time.
      </p>

      <button
        data-test={isListening ? "stop-prediction-button" : "start-prediction-button"}
        className="button-28"
        type="button"
        onClick={isListening ? stop : start}
        disabled={isBusy}
        aria-busy={isBusy}
      >
        {isBusy ? "Loading model…" : isListening ? "Stop recognition" : "Recognize sounds"}
      </button>

      {error && (
        <p role="alert" data-test="prediction-error" className="mt-4 max-w-md text-center text-sm text-orange-300">
          {error}
        </p>
      )}

      {labels.length > 0 && (
        <ul data-test="label-container" aria-live="polite" className="mt-6 grid w-full max-w-sm gap-2">
          {labels.map((label, i) => {
            const pct = Math.round((scores[i] ?? 0) * 100);
            const isTop = i === topIndex && isListening;
            return (
              <li key={label} className={`text-sm ${isTop ? "font-semibold" : "opacity-80"}`}>
                <div className="flex justify-between">
                  <span>{label}</span>
                  <span className="tabular-nums">{pct}%</span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded bg-white/15">
                  <div
                    className={`h-full rounded transition-[width] duration-150 ${isTop ? "bg-orange-400" : "bg-white/60"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default SoundClassifier;
