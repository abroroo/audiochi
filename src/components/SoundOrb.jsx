"use client";
import React, { useEffect, useRef, useState } from "react";
import { buildRowMap, fillRow } from "../utility/spectrogramColors";

const BANDS = 64;

/**
 * Hero orb that ripples with the live spectrum and glows in the colour of the last recognized sound.
 * Purely decorative (aria-hidden); renders nothing if WebGL is unavailable.
 */
const SoundOrb = ({ analyser, accent }) => {
  const containerRef = useRef(null);
  const orbRef = useRef(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let orb = null;
    let cancelled = false;
    import("../utility/soundOrb")
      .then(({ createSoundOrb }) => {
        if (cancelled) return;
        orb = createSoundOrb(containerRef.current);
        orbRef.current = orb;
      })
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
      orbRef.current = null;
      orb?.dispose();
    };
  }, []);

  useEffect(() => {
    if (accent) orbRef.current?.setAccent(accent);
  }, [accent]);

  useEffect(() => {
    if (!analyser) {
      orbRef.current?.setBands(new Uint8Array(BANDS));
      return undefined;
    }
    const data = new Uint8Array(analyser.frequencyBinCount);
    const rowMap = buildRowMap(BANDS, data.length, analyser.context?.sampleRate ?? 48000).reverse(); // bass first
    const bands = new Uint8Array(BANDS);
    let frameId = 0;
    const tick = () => {
      frameId = requestAnimationFrame(tick);
      analyser.getByteFrequencyData(data);
      orbRef.current?.setBands(fillRow(bands, data, rowMap));
    };
    tick();
    return () => cancelAnimationFrame(frameId);
  }, [analyser]);

  if (failed) return null;
  return <div ref={containerRef} className="pointer-events-none h-44 w-44 sm:h-52 sm:w-52" aria-hidden="true" data-test="sound-orb" />;
};

export default SoundOrb;
