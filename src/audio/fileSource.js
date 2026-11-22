/**
 * Play an audio file as if it were a microphone.
 *
 * The file is decoded into an AudioBuffer and played into a MediaStreamAudioDestinationNode, whose
 * MediaStream drives the same spectrogram and classifier code paths the mic does. It also plays
 * through the speakers so the user hears what is being analysed. Works without mic permission,
 * so the demo runs on phones and for people who'd rather not share a microphone.
 */

export const MAX_FILE_BYTES = 30 * 1024 * 1024;

export class FileSourceError extends Error {}

/**
 * @param {File|Blob} file
 * @returns {Promise<{ stream: MediaStream, name: string, duration: number, ended: Promise<void>, stop(): void }>}
 */
export async function createFileSource(file) {
  if (!file) throw new FileSourceError("No file selected.");
  if (file.size > MAX_FILE_BYTES) throw new FileSourceError("That file is over 30 MB. Try a shorter clip.");
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx || !AudioCtx.prototype.createMediaStreamDestination) {
    throw new FileSourceError("This browser can't analyse audio files. Try a recent Chrome, Firefox or Safari.");
  }

  const ctx = new AudioCtx();
  let buffer;
  try {
    buffer = await ctx.decodeAudioData(await file.arrayBuffer());
  } catch {
    ctx.close().catch(() => {});
    throw new FileSourceError("Couldn't read that file. Try an MP3, WAV, OGG or M4A audio file.");
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const destination = ctx.createMediaStreamDestination();
  source.connect(destination);
  source.connect(ctx.destination);

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    try {
      source.stop();
    } catch {
      // Already ended.
    }
    destination.stream.getTracks().forEach((t) => t.stop());
    if (ctx.state !== "closed") ctx.close().catch(() => {});
  };
  const ended = new Promise((resolve) => {
    source.onended = () => {
      stop();
      resolve();
    };
  });

  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  source.start();
  return { stream: destination.stream, name: file.name || "audio file", duration: buffer.duration, ended, stop };
}
