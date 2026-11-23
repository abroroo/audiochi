"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { describeMicError } from "./useMicAnalyser";
import { createFileSource } from "../audio/fileSource";

// Raw room sound: browser voice processing would hide steady sounds like "shhh".
const MIC_CONSTRAINTS = { echoCancellation: false, noiseSuppression: false, autoGainControl: false };

/**
 * The instrument's single input: the microphone or a playing audio file, as one MediaStream that
 * the analyser and the classifier both read. One permission prompt, one stop button.
 *
 * @returns {{ source: { kind: "mic"|"file", stream: MediaStream, name?: string, duration?: number } | null,
 *             status: "idle"|"starting"|"live"|"error", error: string|null,
 *             startMic(): Promise<void>, startFile(file: File): Promise<void>, stop(): void }}
 */
export default function useAudioSource() {
  const [source, setSource] = useState(null);
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState(null);
  const activeRef = useRef(null); // { stop() } for whatever is playing
  const sessionRef = useRef(0); // stale-promise guard, bumped on every start/stop

  const release = useCallback(() => {
    activeRef.current?.stop();
    activeRef.current = null;
  }, []);

  const stop = useCallback(() => {
    sessionRef.current += 1;
    release();
    setSource(null);
    setStatus("idle");
  }, [release]);

  const begin = useCallback(() => {
    const session = ++sessionRef.current;
    release();
    setSource(null);
    setError(null);
    setStatus("starting");
    return session;
  }, [release]);

  const fail = useCallback((message) => {
    setError(message);
    setStatus("error");
  }, []);

  const startMic = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      fail("This browser can't access a microphone. Try a recent Chrome, Firefox or Safari over HTTPS.");
      return;
    }
    const session = begin();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: MIC_CONSTRAINTS });
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((t) => t.stop()); // stopped while the prompt was open
        return;
      }
      activeRef.current = { stop: () => stream.getTracks().forEach((t) => t.stop()) };
      setSource({ kind: "mic", stream });
      setStatus("live");
    } catch (err) {
      if (session === sessionRef.current) fail(describeMicError(err));
    }
  }, [begin, fail]);

  const startFile = useCallback(
    async (file) => {
      const session = begin();
      try {
        const src = await createFileSource(file);
        if (session !== sessionRef.current) {
          src.stop();
          return;
        }
        const entry = { stop: () => src.stop() };
        activeRef.current = entry;
        setSource({ kind: "file", stream: src.stream, name: src.name, duration: src.duration });
        setStatus("live");
        src.ended.then(() => {
          if (activeRef.current === entry) stop();
        });
      } catch (err) {
        if (session === sessionRef.current) fail(err.message || "Couldn't play that file.");
      }
    },
    [begin, fail, stop]
  );

  useEffect(
    () => () => {
      sessionRef.current += 1;
      activeRef.current?.stop();
    },
    []
  );

  return { source, status, error, startMic, startFile, stop };
}
