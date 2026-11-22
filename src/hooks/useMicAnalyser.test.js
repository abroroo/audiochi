import { act, renderHook, waitFor } from "@testing-library/react";
import useMicAnalyser, { describeMicError } from "./useMicAnalyser";

function makeStream() {
  const track = { stop: jest.fn() };
  return { track, stream: { getTracks: () => [track] } };
}

function installAudioContextMock() {
  const contexts = [];
  class FakeAudioContext {
    constructor() {
      this.state = "running";
      this.analyser = { fftSize: 0, smoothingTimeConstant: 0, frequencyBinCount: 0 };
      this.source = { connect: jest.fn() };
      this.close = jest.fn(() => {
        this.state = "closed";
        return Promise.resolve();
      });
      contexts.push(this);
    }
    createAnalyser() {
      return this.analyser;
    }
    createMediaStreamSource() {
      return this.source;
    }
  }
  window.AudioContext = FakeAudioContext;
  return contexts;
}

describe("useMicAnalyser", () => {
  let contexts;

  beforeEach(() => {
    contexts = installAudioContextMock();
  });

  afterEach(() => {
    delete navigator.mediaDevices;
    delete window.AudioContext;
  });

  it("starts the mic, configures the analyser, and releases everything on stop", async () => {
    const { track, stream } = makeStream();
    navigator.mediaDevices = { getUserMedia: jest.fn().mockResolvedValue(stream) };

    const { result } = renderHook(() => useMicAnalyser({ fftSize: 2048, smoothingTimeConstant: 0.3 }));
    await act(() => result.current.start());

    expect(result.current.status).toBe("running");
    expect(result.current.analyser.fftSize).toBe(2048);
    expect(result.current.analyser.smoothingTimeConstant).toBe(0.3);
    expect(contexts[0].source.connect).toHaveBeenCalledWith(contexts[0].analyser);

    act(() => result.current.stop());
    expect(result.current.status).toBe("idle");
    expect(result.current.analyser).toBeNull();
    expect(track.stop).toHaveBeenCalled();
    expect(contexts[0].close).toHaveBeenCalled();
  });

  it("releases the mic and audio context on unmount", async () => {
    const { track, stream } = makeStream();
    navigator.mediaDevices = { getUserMedia: jest.fn().mockResolvedValue(stream) };

    const { result, unmount } = renderHook(() => useMicAnalyser({ fftSize: 512 }));
    await act(() => result.current.start());
    unmount();

    expect(track.stop).toHaveBeenCalled();
    expect(contexts[0].close).toHaveBeenCalled();
  });

  it("shows a helpful message when permission is denied", async () => {
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    navigator.mediaDevices = { getUserMedia: jest.fn().mockRejectedValue(denied) };

    const { result } = renderHook(() => useMicAnalyser({ fftSize: 512 }));
    await act(() => result.current.start());

    expect(result.current.status).toBe("error");
    expect(result.current.error).toMatch(/blocked/i);
    expect(contexts).toHaveLength(0);
  });

  it("stops a stream that arrives after the user already pressed stop", async () => {
    const { track, stream } = makeStream();
    let resolve;
    navigator.mediaDevices = { getUserMedia: jest.fn(() => new Promise((r) => (resolve = r))) };

    const { result } = renderHook(() => useMicAnalyser({ fftSize: 512 }));
    let pending;
    act(() => {
      pending = result.current.start();
    });
    expect(result.current.status).toBe("starting");

    act(() => result.current.stop());
    await act(async () => {
      resolve(stream);
      await pending;
    });

    expect(track.stop).toHaveBeenCalled();
    expect(result.current.status).toBe("idle");
    expect(contexts).toHaveLength(0);
  });

  it("reports unsupported browsers", async () => {
    const { result } = renderHook(() => useMicAnalyser({ fftSize: 512 }));
    await act(() => result.current.start());
    await waitFor(() => expect(result.current.status).toBe("error"));
    expect(result.current.error).toMatch(/can't access a microphone/i);
  });
});

describe("describeMicError", () => {
  it.each([
    ["NotAllowedError", /blocked/i],
    ["NotFoundError", /no microphone/i],
    ["NotReadableError", /another app/i],
    ["SomethingElse", /try again/i],
  ])("%s", (name, pattern) => {
    expect(describeMicError({ name })).toMatch(pattern);
  });
});
