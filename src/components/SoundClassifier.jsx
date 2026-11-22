"use client";
import React, { useEffect, useState } from "react";
import useLiveClassifier from "../hooks/useLiveClassifier";
import { topK } from "../ml/classifier";
import SaliencyView from "./SaliencyView";
import TeachPanel from "./TeachPanel";

const TOP_N = 5;

/** Live ESC-50 sound classification with Audiochi's own int8 ONNX model. */
/** @param {{ source?: { stream: MediaStream } | null }} props  an audio file playing instead of the mic */
const SoundClassifier = ({ source = null }) => {
  const { status, error, result, events, labels, space, taught, start, stop, recordExample, forgetSound, explain } =
    useLiveClassifier();
  const [explanation, setExplanation] = useState(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState(null);
  const isListening = status === "listening";
  const isBusy = status === "loading";
  const top = result ? topK(result.probs, TOP_N) : [];
  const dimmed = result && (result.quiet || result.unknown);

  // Classify a playing file automatically, and stop when it ends or is stopped.
  useEffect(() => {
    if (!source) return undefined;
    start({ stream: source.stream });
    return () => stop();
  }, [source, start, stop]);

  const runExplain = async () => {
    setExplaining(true);
    setExplainError(null);
    try {
      setExplanation(await explain());
    } catch (err) {
      setExplainError(err.message || "Couldn't explain this prediction.");
    } finally {
      setExplaining(false);
    }
  };

  return (
    <div data-test="sound-prediction-container" className="flex w-full flex-col items-center justify-center text-white">
      <p data-test="sound-prediction-intro" className="my-5 max-w-xl text-center text-sm">
        A CNN I trained on ESC-50 recognizes 50 everyday sounds (dogs, rain, keyboards, clapping and more),
        running fully in your browser.
      </p>

      <button
        data-test={isListening ? "stop-prediction-button" : "start-prediction-button"}
        className="button-28"
        type="button"
        onClick={isListening ? stop : () => start()}
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

      {isListening && (
        <div className="mt-6 w-full max-w-sm">
          {!result ? (
            <p className="text-center text-sm opacity-80">Listening…</p>
          ) : (
            <>
              {!result.quiet && result.taughtMatch && (
                <p data-test="taught-match" className="mb-3 rounded border border-orange-400 px-3 py-2 text-center text-sm">
                  Your sound: <strong>{result.taughtMatch.name}</strong>{" "}
                  <span className="tabular-nums opacity-70">similarity {result.taughtMatch.sim.toFixed(2)}</span>
                </p>
              )}
              {!result.quiet && result.unknown && (
                <p data-test="unknown-sound" className="mb-3 rounded border border-white/30 px-3 py-2 text-center text-sm">
                  {result.speech
                    ? "Sounds like speech. Speech isn't one of the 50 sounds I learned."
                    : "Not sure. This doesn't sound like any of the 50 sounds I learned."}
                </p>
              )}
              <ul
                data-test="label-container"
                data-energy={result.energy?.toFixed(2)}
                aria-live="polite"
                className={`grid gap-2 transition-opacity ${dimmed ? "opacity-40" : ""}`}
              >
                {top.map((i, rank) => {
                  const pct = Math.round(result.probs[i] * 100);
                  return (
                    <li key={labels[i]} className={`text-sm ${rank === 0 ? "font-semibold" : "opacity-80"}`}>
                      <div className="flex justify-between capitalize">
                        <span>{labels[i]}</span>
                        <span className="tabular-nums">{pct}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded bg-white/15">
                        <div
                          className={`h-full rounded transition-[width] duration-200 ${rank === 0 ? "bg-orange-400" : "bg-white/60"}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-center text-xs opacity-70" data-test="inference-stats">
                {result.quiet ? "Too quiet. Make a sound." : `Inference ${result.ms.toFixed(0)} ms · int8 ONNX · on-device`}
              </p>
              <div className="mt-2 flex justify-center">
                <button
                  type="button"
                  className="button-28 button-28--small"
                  onClick={runExplain}
                  disabled={explaining || result.quiet}
                  data-test="explain-button"
                >
                  {explaining ? "Explaining…" : "What did it listen to?"}
                </button>
              </div>
              {explainError && <p role="alert" className="mt-2 text-center text-xs text-orange-300">{explainError}</p>}
              {explanation && <SaliencyView explanation={explanation} />}
            </>
          )}

          {events.length > 0 && (
            <div className="mt-4">
              <h2 className="mb-1 text-xs uppercase tracking-wider opacity-70">Heard</h2>
              <ol className="flex flex-wrap gap-2" data-test="event-list">
                {events.map((e) => (
                  <li
                    key={e.at}
                    className={`rounded-full border px-3 py-1 text-xs ${e.taught ? "border-orange-400" : "border-white/30 capitalize"}`}
                  >
                    {e.label} <span className="tabular-nums opacity-70">{Math.round(e.prob * 100)}%</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {space && <TeachPanel taught={taught} recordExample={recordExample} forgetSound={forgetSound} />}
        </div>
      )}
    </div>
  );
};

export default SoundClassifier;
