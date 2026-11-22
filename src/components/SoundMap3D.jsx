"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import useLiveClassifier, { loadSpace } from "../hooks/useLiveClassifier";
import { METADATA_URL } from "../ml/classifier";
import { nearest, placeIn3D } from "../ml/space";
import { prototypeOf } from "../ml/fewshot";
import { CATEGORY_COLORS, createSoundMap } from "../utility/soundMap3d";

/** The model's embedding space as a 3D galaxy of the 2,000 ESC-50 clips, with your live sound in it. */
const SoundMap3D = () => {
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [space, setSpace] = useState(null);
  const [labels, setLabels] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [hovered, setHovered] = useState(null);
  const { status, error, result, taught, start, stop } = useLiveClassifier();
  const isListening = status === "listening";

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadSpace(), fetch(METADATA_URL).then((r) => (r.ok ? r.json() : null))])
      .then(([sp, meta]) => {
        if (cancelled) return;
        if (!sp || !meta) throw new Error("Couldn't load the sound map.");
        setSpace(sp);
        setLabels(meta.labels);
      })
      .catch((e) => !cancelled && setLoadError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!space || !containerRef.current) return undefined;
    let map;
    try {
      map = createSoundMap(containerRef.current, space, { onHover: setHovered });
    } catch {
      setLoadError("This browser couldn't start WebGL, so the 3D map can't be shown.");
      return undefined;
    }
    mapRef.current = map;
    return () => {
      map.dispose();
      mapRef.current = null;
    };
  }, [space]);

  useEffect(() => {
    mapRef.current?.setLive(isListening && result && !result.quiet ? result.position ?? null : null);
  }, [isListening, result]);

  const taughtPositions = useMemo(
    () =>
      space
        ? taught
            .filter((s) => s.examples.length > 0)
            .map((s) => ({ name: s.name, position: placeIn3D(space, nearest(space, prototypeOf(s.examples))) }))
        : [],
    [space, taught]
  );
  useEffect(() => mapRef.current?.setTaught(taughtPositions), [taughtPositions]);

  const liveLabel = result?.taughtMatch?.name ?? (result?.speech ? "speech" : result?.unknown ? "unknown sound" : labels[result?.top]);
  const hoveredLabel = hovered !== null && space ? labels[space.labels[hovered]] : null;

  return (
    <div className="relative h-dvh w-full overflow-hidden text-white">
      <div ref={containerRef} className="absolute inset-0" data-test="sound-map-canvas" />

      <header className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-2 px-4 pt-6 text-center">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-3">
          <h1 className="text-lg font-semibold">Sound map</h1>
          <Link href="/" className="button-28 button-28--small">Back &#10548;</Link>
        </div>
        <p className="max-w-xl text-xs opacity-80">
          Each dot is one of the 2,000 ESC-50 clips, placed by how the model hears it (its 256-d embedding,
          reduced to 3D with UMAP). Similar sounds cluster. Turn on the mic to see where your sound lands. Drag to orbit.
        </p>
        <button type="button" className="button-28 pointer-events-auto" onClick={isListening ? stop : start}
          disabled={status === "loading" || !space} data-test="sound-map-toggle">
          {status === "loading" ? "Loading model…" : isListening ? "Stop listening" : "Place my sound"}
        </button>
        {(error || loadError) && <p role="alert" className="text-sm text-orange-300">{error || loadError}</p>}
        {isListening && result && (
          <p className="text-sm" aria-live="polite" data-test="sound-map-live">
            {result.quiet ? "Too quiet. Make a sound." : <>You: <strong className="capitalize">{liveLabel}</strong></>}
          </p>
        )}
      </header>

      {hoveredLabel && (
        <p className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 translate-y-6 rounded bg-black/60 px-2 py-1 text-xs capitalize">
          {hoveredLabel}
        </p>
      )}

      {space && (
        <ul className="absolute bottom-4 left-4 grid gap-1 text-xs" aria-label="Legend">
          {space.categories.map((c, i) => (
            <li key={c} className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: CATEGORY_COLORS[i] }} />
              {c}
            </li>
          ))}
          {taughtPositions.length > 0 && (
            <li className="flex items-center gap-2"><span className="text-orange-400">◇</span> your taught sounds</li>
          )}
        </ul>
      )}
    </div>
  );
};

export default SoundMap3D;
