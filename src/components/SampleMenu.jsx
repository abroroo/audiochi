"use client";
import React, { useEffect, useRef, useState } from "react";

/**
 * Built-in audio to try without a microphone. The environmental clips are ESC-50 recordings
 * (classes the model knows); the music has no ESC-50 class, so it shows the
 * open-set "unknown" path and is mainly there for pitch and spectrum.
 */
export const SAMPLES = [
  { id: "dog", name: "Dog barking", kind: "ESC-50", src: "/samples/dog.mp3" },
  { id: "rooster", name: "Rooster", kind: "ESC-50", src: "/samples/rooster.mp3" },
  { id: "siren", name: "Siren", kind: "ESC-50", src: "/samples/siren.mp3" },
  { id: "rain", name: "Rain", kind: "ESC-50", src: "/samples/rain.mp3" },
  { id: "luna", name: "Luna Cantina", title: "Construyendo en el Espacio", kind: "music", src: "/samples/luna-cantina.mp3" },
  { id: "quincas", name: "Quincas Moreira", title: "Fun Kid", kind: "music", src: "/samples/quincas-moreira.mp3" },
];

/** Fetch a sample and wrap it as a File, so it goes through the same path as an upload. */
export async function loadSample(sample, fetchImpl = fetch) {
  const res = await fetchImpl(sample.src);
  if (!res.ok) throw new Error(`Couldn't load the "${sample.name}" sample.`);
  const blob = await res.blob();
  return new File([blob], sample.name, { type: blob.type || "audio/mpeg" });
}

/**
 * "Samples" dropdown. Calls `onPick(file)` with the chosen sample; `onError(message)` if it
 * can't be fetched.
 */
export default function SampleMenu({ onPick, onError, disabled }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => !rootRef.current?.contains(e.target) && setOpen(false);
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const pick = async (sample) => {
    setLoading(sample.id);
    try {
      onPick(await loadSample(sample));
      setOpen(false);
    } catch (err) {
      onError?.(err.message);
    } finally {
      setLoading(null);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="btn"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        data-test="sample-button"
      >
        Samples <span aria-hidden="true" className="text-white/40">▾</span>
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-full z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] border border-white/20 bg-[#0d0b14] py-1 shadow-xl">
          {SAMPLES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="menuitem"
              onClick={() => pick(s)}
              disabled={loading !== null}
              className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs text-white/80 hover:bg-white/10 disabled:opacity-60"
            >
              <span className="truncate">{loading === s.id ? "Loading…" : s.name}{s.title && loading !== s.id && <span className="text-white/40"> · {s.title}</span>}</span>
              <span className="shrink-0 font-mono text-[10px] uppercase text-white/40">{s.kind}</span>
            </button>
          ))}
          <p className="border-t border-white/10 px-3 pb-1 pt-2 text-[10px] leading-snug text-white/40">
            Sound clips: ESC-50 (Piczak, CC BY-NC). Music: Luna Cantina, Quincas Moreira. Music isn&apos;t one of
            the 50 classes, so expect &quot;unknown&quot;.
          </p>
        </div>
      )}
    </div>
  );
}
