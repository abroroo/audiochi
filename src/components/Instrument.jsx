"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import useAudioSource from "../hooks/useAudioSource";
import useMicAnalyser from "../hooks/useMicAnalyser";
import useLiveClassifier from "../hooks/useLiveClassifier";
import { fillRow } from "../utility/spectrogramColors";
import { createStepClock } from "../utility/frameClock";
import { detectPitch, freqToNote } from "../utility/pitch";
import { categoryColor } from "../utility/categories";
import { createFpsMeter, fmt, levelDbfs, median3 } from "../utility/readouts";
import { createCanvasWall } from "../utility/canvasWall";
import {
  HZ_TICKS, NOTE_TICKS, VIEW_ROWS, WALL_ROWS, WALL_SECONDS, WALL_STEPS_PER_SECOND,
  smoothRow, timeTicks, viewRowMap, wallRowForFreq, wallRowMap, wallTopFraction,
} from "../utility/axes";
import SoundClassifier from "./SoundClassifier";
import SampleMenu from "./SampleMenu";

// 2048 bins: fine low-frequency detail for the mel rows. No frame smoothing, so onsets stay sharp.
const ANALYSER_OPTIONS = { fftSize: 4096, smoothingTimeConstant: 0 };
const PITCH_CLARITY = 0.85; // below this the sound is too noisy to call a note
const PITCH_WINDOW = 2048; // samples given to YIN (~43 ms at 48 kHz)
const PITCH_MAX_HZ = 2000; // whistles reach ~2 kHz; a lower cap reports them an octave low
const WINDOW_CENTRE_S = 1; // the classifier's 2 s window is centred 1 s in the past
const EMPTY_METER = { freq: null, note: null, db: null, fps: null };

const VIEWS = {
  spectrogram: { label: "Spectrogram", rate: WALL_STEPS_PER_SECOND, hint: "mel 40 Hz–16 kHz · newest right · cyan = pitch (YIN)" },
  ridgeline: { label: "Ridgeline", rate: 16, hint: "mel 40 Hz–12 kHz, bass left · drag to orbit · scroll to zoom" },
  galaxy: { label: "Galaxy", rate: 60, hint: "one particle stream per mel band, bass at the bottom · drag to orbit" },
  bench: { label: "How it works", rate: 20, hint: "the pipeline as a machine: mic → mel bands → spectrogram → 50 classes" },
};

let modelMeta = null;
const loadModelMeta = async () => {
  if (!modelMeta) modelMeta = await (await fetch("/models/audiochi-esc50.json")).json();
  return modelMeta;
};

async function createView(key, container) {
  if (key === "ridgeline") return (await import("../utility/ridgeline")).createRidgeline(container, { rows: VIEW_ROWS });
  if (key === "galaxy") return (await import("../utility/particleGalaxy")).createParticleGalaxy(container, { rows: VIEW_ROWS });
  if (key === "bench") {
    const [{ createBench }, meta] = await Promise.all([import("../utility/bench/bench"), loadModelMeta()]);
    return createBench(container, { threshold: meta.unknownEnergyThreshold, labels: meta.labels });
  }
  try {
    return (await import("../utility/spectrogramWall")).createSpectrogramWall(container);
  } catch {
    return createCanvasWall(container); // no WebGL: same geometry, drawn on a 2D canvas
  }
}

/** Frequency, note, time ticks and recognition markers over the flat spectrogram. */
function WallAxes({ markers, live, onMarkerDone }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden font-mono text-[10px]" aria-hidden="true">
      {HZ_TICKS.filter(([f]) => f < 16000).map(([f, text]) => (
        <div key={f} className="absolute inset-x-0 border-t border-white/10" style={{ top: `${wallTopFraction(f) * 100}%` }}>
          <span className="absolute left-1 -translate-y-1/2 bg-black/50 px-1 text-white/70">{f === 100 ? "100 Hz" : text}</span>
        </div>
      ))}
      {NOTE_TICKS.map(([f, text]) => (
        <span
          key={text}
          className="absolute right-1 -translate-y-1/2 bg-black/50 px-1 text-cyan-200/80"
          style={{ top: `${wallTopFraction(f) * 100}%` }}
        >
          {text}
        </span>
      ))}
      {markers.map((m) => (
        <div
          key={m.at}
          className="marker absolute inset-y-0 border-l border-dashed"
          style={{
            borderColor: m.color,
            animationDuration: `${WALL_SECONDS}s`,
            animationDelay: `${-WINDOW_CENTRE_S}s`,
            animationPlayState: live ? "running" : "paused",
          }}
          onAnimationEnd={() => onMarkerDone(m.at)}
        >
          <span className="absolute left-1 top-5 whitespace-nowrap bg-black/60 px-1" style={{ color: m.color }}>
            {m.label} {Math.round(m.prob * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

/** Seconds-ago scale under the spectrogram, outside the data so it never covers it. */
function TimeAxis() {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-4 border-t border-white/10 font-mono text-[10px] text-white/50" aria-hidden="true">
      {timeTicks().map(({ seconds, left }) =>
        left < 0.03 ? null : (
          <span
            key={seconds}
            className={`absolute top-0.5 ${seconds === 0 ? "-translate-x-full pr-1" : "-translate-x-1/2"}`}
            style={{ left: `${left * 100}%` }}
          >
            {seconds === 0 ? "now" : `−${seconds}s`}
          </span>
        )
      )}
    </div>
  );
}

function Readout({ label, value, accent, title }) {
  return (
    <div className="min-w-0" title={title}>
      <div className="panel-label">{label}</div>
      <div className={`truncate font-mono text-sm tabular-nums ${accent ?? "text-white"}`}>{value}</div>
    </div>
  );
}

/**
 * The whole app on one screen: one input (mic or file), three views of the same signal
 * (flat spectrogram with pitch, ridgeline, particle galaxy), live numeric readouts and the
 * classifier panel.
 */
const Instrument = () => {
  const stageRef = useRef(null);
  const fileInputRef = useRef(null);
  const [sampleError, setSampleError] = useState(null);
  const [viewKey, setViewKey] = useState("spectrogram");
  const [view, setView] = useState(null);
  const [viewError, setViewError] = useState(null);
  const [meter, setMeter] = useState(EMPTY_METER);
  const [markers, setMarkers] = useState([]);
  const input = useAudioSource();
  const analyserState = useMicAnalyser(ANALYSER_OPTIONS);
  const classifier = useLiveClassifier();
  const { analyser } = analyserState;
  const { source } = input;
  const live = !!source;
  const latestEventRef = useRef(null);

  // One source feeds both the visual analyser and the classifier.
  const { start: startAnalyser, stop: stopAnalyser } = analyserState;
  const { start: startClassifier, stop: stopClassifier } = classifier;
  useEffect(() => {
    if (!source) {
      stopAnalyser();
      stopClassifier();
      return;
    }
    startAnalyser({ stream: source.stream });
    startClassifier({ stream: source.stream });
  }, [source, startAnalyser, stopAnalyser, startClassifier, stopClassifier]);

  const eventColor = useCallback(
    (event) => {
      const index = classifier.labels.indexOf(event.label);
      return event.taught || index < 0 ? "#fb923c" : categoryColor(index);
    },
    [classifier.labels]
  );
  const eventColorRef = useRef(eventColor);
  eventColorRef.current = eventColor;

  // Mount the view; free its GPU context when switching or leaving.
  useEffect(() => {
    let created = null;
    let cancelled = false;
    setViewError(null);
    setMarkers([]);
    createView(viewKey, stageRef.current)
      .then((v) => {
        if (cancelled) return v.dispose();
        created = v;
        setView(v);
        // A freshly opened 3D view shows the sound heard just before, instead of waiting for the next one.
        const latest = latestEventRef.current;
        if (latest && Date.now() - latest.at < 6000) v.addLabel?.(latest.label, eventColorRef.current(latest));
      })
      .catch(() => !cancelled && setViewError("This view needs WebGL, which this browser couldn't start."));
    return () => {
      cancelled = true;
      setView(null);
      created?.dispose();
    };
  }, [viewKey]);

  // Per frame: pitch and level at ~30 Hz, view steps at the view's fixed rate, readouts at ~7 Hz.
  useEffect(() => {
    if (!view) return undefined;
    if (!analyser) {
      if (view.kind !== "wall") view.clear(); // the flat spectrogram freezes for inspection instead
      return undefined;
    }
    const sampleRate = analyser.context?.sampleRate ?? 48000;
    const bins = analyser.frequencyBinCount;
    const frequencyData = new Uint8Array(bins);
    const timeData = new Float32Array(analyser.fftSize);
    const isWall = view.kind === "wall";
    const rowMap = isWall ? wallRowMap(bins, sampleRate) : viewRowMap(bins, sampleRate);
    const row = new Uint8Array(isWall ? WALL_ROWS : VIEW_ROWS);
    const smoothState = new Float32Array(row.length);
    const steps = createStepClock(VIEWS[viewKey].rate);
    const fps = createFpsMeter();
    const recent = [0, 0, 0];
    let pitch = null;
    let db = null;
    let lastPitch = 0;
    let lastUi = 0;
    let frameId = 0;

    const tick = (now = performance.now()) => {
      frameId = requestAnimationFrame(tick);
      const rate = fps(now);
      if (now - lastPitch >= 33) {
        lastPitch = now;
        analyser.getFloatTimeDomainData(timeData);
        const windowed = timeData.subarray(timeData.length - PITCH_WINDOW);
        db = levelDbfs(windowed);
        const p = detectPitch(windowed, sampleRate, { fMax: PITCH_MAX_HZ });
        if (p && p.clarity >= PITCH_CLARITY) {
          recent.shift();
          recent.push(p.freq);
          pitch = { freq: recent[0] ? median3(...recent) : p.freq, clarity: p.clarity };
        } else {
          pitch = null;
          recent.fill(0);
        }
      }
      if (now - lastUi >= 150) {
        lastUi = now;
        setMeter({ freq: pitch?.freq ?? null, note: pitch ? freqToNote(pitch.freq) : null, db, fps: rate });
      }
      const n = steps(now);
      view.setFraction?.(steps.fraction());
      if (n === 0) return;
      analyser.getByteFrequencyData(frequencyData);
      fillRow(row, frequencyData, rowMap);
      if (isWall) {
        const pitchRow = pitch ? wallRowForFreq(pitch.freq) : null;
        for (let i = 0; i < n; i++) view.push(row, pitchRow, pitch?.clarity ?? 0);
      } else {
        smoothRow(row, smoothState);
        for (let i = 0; i < n; i++) view.update(row);
      }
    };
    tick();
    return () => {
      cancelAnimationFrame(frameId);
      setMeter(EMPTY_METER);
    };
  }, [analyser, view, viewKey]);

  // The bench figure shows every classifier result: the open drawer and the energy dial.
  useEffect(() => {
    view?.setResult?.(classifier.status === "listening" ? classifier.result : null);
  }, [view, classifier.result, classifier.status]);

  // Each newly recognized sound: a marker on the spectrogram, a label in the 3D views.
  const lastEventRef = useRef(0);
  useEffect(() => {
    const latest = classifier.events[0];
    if (!latest || latest.at === lastEventRef.current) return;
    lastEventRef.current = latest.at;
    latestEventRef.current = latest;
    const color = eventColor(latest);
    if (view?.kind === "wall") setMarkers((prev) => [...prev, { ...latest, color }].slice(-12));
    else view?.addLabel?.(latest.label, color);
  }, [classifier.events, eventColor, view]);

  const onMarkerDone = useCallback((at) => setMarkers((prev) => prev.filter((m) => m.at !== at)), []);

  const onFile = (e) => {
    const chosen = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (chosen) input.startFile(chosen);
  };

  const micOn = source?.kind === "mic";
  const fileOn = source?.kind === "file";
  const result = classifier.status === "listening" ? classifier.result : null;
  const audible = result && !result.quiet;
  let className = "—";
  if (audible) {
    className = result.taughtMatch?.name ?? (result.speech ? "speech?" : result.unknown ? "unknown" : classifier.labels[result.top]);
  }
  const confidence = audible ? (result.taughtMatch ? result.taughtMatch.sim : result.probs[result.top]) : null;
  const errors = [sampleError, input.error, analyserState.error, viewError].filter(Boolean);

  return (
    <div className="flex min-h-dvh flex-col text-[#e9e6f0] lg:h-dvh">
      <header className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-4 py-2.5">
        <div className="flex items-baseline gap-2">
          <h1 className="text-sm font-semibold tracking-tight" data-test="spectrogram-title">audiochi</h1>
          <span className="hidden font-mono text-[11px] text-white/40 sm:inline">real-time audio analysis · on-device</span>
        </div>
        <nav className="flex items-center gap-4 text-xs text-white/60">
          <Link href="/explore" className="hover:text-white">Embedding map ↗</Link>
          <a href="https://github.com/abroroo/audiochi" target="_blank" rel="noopener noreferrer" className="hover:text-white" data-test="author-tag">
            Source ↗
          </a>
        </nav>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col" aria-label="Visualization">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-2">
            <button
              type="button"
              className="btn btn--primary"
              onClick={micOn ? input.stop : input.startMic}
              aria-pressed={micOn}
              data-test="spectrogram-toggle-button"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${micOn ? "bg-[var(--accent)]" : "bg-white/40"}`} aria-hidden="true" />
              {input.status === "starting" && !fileOn ? "Waiting for mic…" : micOn ? "Stop mic" : "Microphone"}
            </button>
            <button
              type="button"
              className="btn btn--primary"
              aria-pressed={fileOn}
              onClick={fileOn ? input.stop : () => fileInputRef.current?.click()}
              data-test="file-button"
            >
              {fileOn ? "Stop file" : "Audio file"}
            </button>
            {!fileOn && (
              <SampleMenu
                onPick={(f) => {
                  setSampleError(null);
                  input.startFile(f);
                }}
                onError={setSampleError}
              />
            )}
            <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={onFile} data-test="file-input" aria-label="Audio file" />
            <div role="radiogroup" aria-label="View" className="seg w-full sm:ml-auto sm:w-auto">
              {Object.entries(VIEWS).map(([key, v]) => (
                <button key={key} type="button" role="radio" aria-checked={viewKey === key} onClick={() => setViewKey(key)}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="relative h-[56vh] min-h-[280px] overflow-hidden bg-[var(--bg)] lg:h-auto lg:flex-1">
            <div
              ref={stageRef}
              className={`absolute inset-x-0 top-0 ${viewKey === "spectrogram" ? "bottom-4" : "bottom-0"}`}
              data-test="spectrogram-container"
            />
            {viewKey === "spectrogram" && view && (
              <>
                <div className="absolute inset-x-0 bottom-4 top-0">
                  <WallAxes markers={markers} live={live} onMarkerDone={onMarkerDone} />
                </div>
                <TimeAxis />
              </>
            )}
            {view?.resetView && (
              <button type="button" className="btn btn--small absolute right-2 top-2 bg-black/40" onClick={() => view.resetView()}>
                Reset view
              </button>
            )}
            {!live && !viewError && viewKey !== "bench" && (
              <p className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 text-center font-mono text-xs text-white/50">
                no input — start the microphone, load a file, or try a sample
              </p>
            )}
            {errors.length > 0 && (
              <div role="alert" className="absolute inset-x-4 top-4 border border-orange-400/40 bg-black/70 px-3 py-2 text-xs text-orange-200" data-test="mic-error">
                {errors[0]}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-[var(--line)] px-4 py-1.5 font-mono text-[11px] text-white/45">
            <span className="truncate">{VIEWS[viewKey].hint}</span>
            <span className="truncate" data-test="file-playing">
              {fileOn ? `file: ${source.name} (${source.duration.toFixed(0)} s)` : micOn ? "input: microphone, raw (no AGC / NS / AEC)" : "input: none"}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-x-4 gap-y-2 border-t border-[var(--line)] px-4 py-2.5 sm:grid-cols-4 xl:grid-cols-8" data-test="pitch-readout">
            <Readout label="Pitch" value={fmt(meter.freq, 1, "Hz")} accent={meter.freq ? "text-[var(--pitch)]" : undefined} />
            <Readout
              label="Note"
              value={meter.note ? `${meter.note.name} ${meter.note.cents >= 0 ? "+" : "−"}${Math.abs(meter.note.cents)}¢` : "—"}
              accent={meter.note ? "text-[var(--pitch)]" : undefined}
            />
            <Readout label="Level" value={fmt(meter.db, 0, "dBFS")} />
            <Readout label="Class" value={className} accent={audible && !result.unknown ? "text-[var(--accent)] capitalize" : "text-white/70"} />
            <Readout label="Conf" value={confidence === null ? "—" : `${Math.round(confidence * 100)}%`} />
            <Readout
              label="Energy"
              value={audible && Number.isFinite(result.energy) ? `${fmt(result.energy, 2)} ${result.unknown ? "OOD" : "in"}` : "—"}
              title="Energy score −logsumexp(logits). Above the threshold the window is treated as out of distribution."
            />
            <Readout label="Infer" value={audible ? fmt(result.ms, 0, "ms") : "—"} />
            <Readout label="FPS" value={fmt(meter.fps, 0)} />
          </div>
        </section>

        <aside className="border-t border-[var(--line)] bg-[var(--panel)] px-4 py-4 lg:w-[340px] lg:overflow-y-auto lg:border-l lg:border-t-0">
          <SoundClassifier classifier={classifier} />
        </aside>
      </div>
    </div>
  );
};

export default Instrument;
