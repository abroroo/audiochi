"use client";
import React, { useState } from "react";
import { MAX_EXAMPLES, MIN_EXAMPLES } from "../ml/fewshot";

const TARGET_EXAMPLES = 5;

/** Teach the model a new sound from a few recordings (few-shot prototypes, stored on this device). */
const TeachPanel = ({ taught, recordExample, forgetSound }) => {
  const [name, setName] = useState("");
  const [recording, setRecording] = useState(false);
  const [message, setMessage] = useState(null);
  const current = taught.find((s) => s.name === name.trim());
  const count = current?.examples.length ?? 0;

  const record = async () => {
    setRecording(true);
    setMessage("Make the sound now…");
    try {
      const n = await recordExample(name);
      setMessage(
        n < MIN_EXAMPLES
          ? `Got it (${n}). ${MIN_EXAMPLES - n} more before it can be recognized.`
          : `Got it (${n}). "${name.trim()}" is now recognized.${n < TARGET_EXAMPLES ? " More examples make it more reliable." : ""}`
      );
    } catch (err) {
      setMessage(err.message);
    } finally {
      setRecording(false);
    }
  };

  return (
    <section data-test="teach-panel" aria-labelledby="teach-heading">
      <h2 id="teach-heading" className="panel-label">Few-shot: teach a sound</h2>
      <p className="mt-1 text-xs text-white/50">
        Name a sound and record it {TARGET_EXAMPLES} times. The model is not retrained: each sound becomes the
        average of its recordings in the model&apos;s embedding space. Saved only on this device.
      </p>
      <div className="mt-3 flex gap-2">
        <label className="sr-only" htmlFor="teach-name">Sound name</label>
        <input
          id="teach-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="e.g. my kettle"
          className="min-w-0 flex-1 border border-white/15 bg-white/5 px-2 py-1 text-xs placeholder:text-white/30 focus:border-orange-400 focus:outline-none"
        />
        <button
          type="button"
          className="btn btn--small"
          onClick={record}
          disabled={recording || !name.trim() || count >= MAX_EXAMPLES}
          data-test="teach-record"
        >
          {recording ? "Listening 2 s…" : `Record ${count + 1}/${TARGET_EXAMPLES}`}
        </button>
      </div>
      {message && <p className="mt-2 text-xs text-white/70" aria-live="polite">{message}</p>}
      {taught.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {taught.map((s) => (
            <li key={s.name} className="flex items-center gap-2 border border-white/20 px-2 py-0.5 font-mono text-[11px]">
              <button type="button" onClick={() => setName(s.name)} className="hover:underline">
                {s.name} <span className="opacity-60">×{s.examples.length}</span>
              </button>
              <button type="button" onClick={() => forgetSound(s.name)} aria-label={`Forget ${s.name}`} className="opacity-60 hover:opacity-100">
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default TeachPanel;
