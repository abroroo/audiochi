"use client";
import React, { useState } from "react";
import { topK } from "../ml/classifier";
import SaliencyView from "./SaliencyView";
import TeachPanel from "./TeachPanel";

const TOP_N = 5;

/**
 * Classifier panel: live top-5 from Audiochi's own int8 ONNX model (ESC-50), the open-set verdict,
 * saliency on demand, the event log and few-shot teaching. It shows a `useLiveClassifier()` state
 * owned by the page, which starts and stops it together with the audio source.
 *
 * @param {{ classifier: ReturnType<import("../hooks/useLiveClassifier").default> }} props
 */
const SoundClassifier = ({ classifier }) => {
  const { status, error, result, events, labels, space, taught, recordExample, forgetSound, explain } = classifier;
  const [explanation, setExplanation] = useState(null);
  const [explaining, setExplaining] = useState(false);
  const [explainError, setExplainError] = useState(null);
  const isListening = status === "listening";
  const top = result ? topK(result.probs, TOP_N) : [];
  const dimmed = result && (result.quiet || result.unknown);

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

  let state = "Idle. Start an input to classify.";
  if (status === "loading") state = "Loading model…";
  else if (isListening && !result) state = "Filling the first 2 s window…";
  else if (isListening && result?.quiet) state = "Below −55 dB. Treated as silence.";

  return (
    <div data-test="sound-prediction-container" className="flex flex-col gap-5">
      <section aria-labelledby="clf-heading">
        <h2 id="clf-heading" className="panel-label">Classifier</h2>
        <p className="mt-1 text-xs text-white/50" data-test="sound-prediction-intro">
          CNN trained on ESC-50 (50 classes). int8 ONNX, runs on-device every 0.5 s on a 2 s window. ~81% on live
          windows: expect mistakes.
        </p>

        {error && (
          <p role="alert" data-test="prediction-error" className="mt-3 text-xs text-orange-300">
            {error}
          </p>
        )}

        {(!isListening || !result || result.quiet) && !error && (
          <p className="mt-3 font-mono text-xs text-white/60" data-test="classifier-state">
            {state}
          </p>
        )}

        {isListening && result && (
          <>
            {!result.quiet && result.taughtMatch && (
              <p data-test="taught-match" className="mt-3 border-l-2 border-orange-400 pl-2 text-xs">
                Taught sound: <strong>{result.taughtMatch.name}</strong>{" "}
                <span className="font-mono text-white/60">sim {result.taughtMatch.sim.toFixed(2)}</span>
              </p>
            )}
            {!result.quiet && result.unknown && (
              <p data-test="unknown-sound" className="mt-3 border-l-2 border-white/40 pl-2 text-xs text-white/80">
                {result.speech ? "Out of distribution: speech (not one of the 50 classes)." : "Out of distribution: none of the 50 classes."}
              </p>
            )}
            <ul
              data-test="label-container"
              data-energy={result.energy?.toFixed(2)}
              aria-live="polite"
              className={`mt-3 grid gap-2 transition-opacity ${dimmed ? "opacity-40" : ""}`}
            >
              {top.map((i, rank) => {
                const pct = result.probs[i] * 100;
                return (
                  <li key={labels[i]} className={`text-xs ${rank === 0 ? "text-white" : "text-white/60"}`}>
                    <div className="flex justify-between gap-2">
                      <span className="truncate capitalize">{labels[i]}</span>
                      <span className="font-mono tabular-nums">{Math.round(pct)}%</span>
                    </div>
                    <div className="mt-1 h-1 overflow-hidden bg-white/10">
                      <div
                        className={`h-full transition-[width] duration-200 ${rank === 0 ? "bg-orange-400" : "bg-white/40"}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-white/40" data-test="inference-stats">
                {result.quiet ? "silent window" : `inference ${result.ms.toFixed(0)} ms`}
              </span>
              <button
                type="button"
                className="btn btn--small"
                onClick={runExplain}
                disabled={explaining || result.quiet}
                data-test="explain-button"
              >
                {explaining ? "Explaining…" : "Saliency"}
              </button>
            </div>
            {explainError && <p role="alert" className="mt-2 text-xs text-orange-300">{explainError}</p>}
            {explanation && <SaliencyView explanation={explanation} />}
          </>
        )}
      </section>

      {events.length > 0 && (
        <section aria-labelledby="events-heading">
          <h2 id="events-heading" className="panel-label">Event log</h2>
          <ol className="mt-2 grid gap-1 font-mono text-[11px]" data-test="event-list">
            {events.map((e) => (
              <li key={e.at} className="flex justify-between gap-2 text-white/70">
                <span className="truncate">
                  <span className="text-white/40">{new Date(e.at).toLocaleTimeString([], { hour12: false })}</span>{" "}
                  <span className={e.taught ? "text-orange-300" : ""}>{e.label}</span>
                </span>
                <span className="tabular-nums">{Math.round(e.prob * 100)}%</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {space && isListening && <TeachPanel taught={taught} recordExample={recordExample} forgetSound={forgetSound} />}
    </div>
  );
};

export default SoundClassifier;
