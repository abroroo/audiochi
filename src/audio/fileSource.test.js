import { MAX_FILE_BYTES, createFileSource } from "./fileSource";

function mockAudioContext({ decodeFails = false } = {}) {
  const tracks = [{ stop: jest.fn() }];
  const source = { connect: jest.fn(), start: jest.fn(), stop: jest.fn(), onended: null };
  const ctx = {
    state: "running",
    destination: {},
    decodeAudioData: jest.fn(async () => {
      if (decodeFails) throw new Error("EncodingError");
      return { duration: 4.2 };
    }),
    createBufferSource: () => source,
    createMediaStreamDestination: () => ({ stream: { getTracks: () => tracks } }),
    close: jest.fn(async () => {}),
    resume: jest.fn(async () => {}),
  };
  function AudioContext() {
    return ctx;
  }
  AudioContext.prototype.createMediaStreamDestination = () => {};
  window.AudioContext = AudioContext;
  return { ctx, source, tracks };
}

const file = (size = 10, name = "dog.wav") => ({ size, name, arrayBuffer: async () => new ArrayBuffer(size) });

afterEach(() => {
  delete window.AudioContext;
});

describe("createFileSource", () => {
  it("decodes, plays to speakers and a stream, and cleans up when it ends", async () => {
    const { ctx, source, tracks } = mockAudioContext();
    const src = await createFileSource(file());
    expect(src).toMatchObject({ name: "dog.wav", duration: 4.2 });
    expect(source.connect).toHaveBeenCalledWith(ctx.destination);
    expect(source.start).toHaveBeenCalled();
    source.onended();
    await src.ended;
    expect(tracks[0].stop).toHaveBeenCalled();
    expect(ctx.close).toHaveBeenCalled();
  });

  it("stop() is safe to call twice", async () => {
    const { ctx } = mockAudioContext();
    const src = await createFileSource(file());
    src.stop();
    src.stop();
    expect(ctx.close).toHaveBeenCalledTimes(1);
  });

  it("rejects files that aren't audio, with a helpful message", async () => {
    const { ctx } = mockAudioContext({ decodeFails: true });
    await expect(createFileSource(file())).rejects.toThrow(/MP3, WAV/);
    expect(ctx.close).toHaveBeenCalled();
  });

  it("rejects huge files before reading them", async () => {
    mockAudioContext();
    await expect(createFileSource(file(MAX_FILE_BYTES + 1))).rejects.toThrow(/30 MB/);
  });
});
