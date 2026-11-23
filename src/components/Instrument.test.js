import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import Instrument from "./Instrument";

jest.mock("next/link", () => {
  const Link = ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
  return Link;
});

// jsdom has neither WebGL nor a 2D canvas; the views are covered by the browser smoke test.
jest.mock("../utility/spectrogramWall", () => ({ createSpectrogramWall: () => { throw new Error("no WebGL"); } }));
jest.mock("../utility/canvasWall", () => ({
  createCanvasWall: () => ({ kind: "wall", push: jest.fn(), clear: jest.fn(), dispose: jest.fn() }),
}));
jest.mock("../utility/ridgeline", () => ({ createRidgeline: () => { throw new Error("no WebGL"); } }));
jest.mock("../hooks/useLiveClassifier", () => {
  const state = {
    status: "idle", error: null, result: null, events: [], labels: [], space: null, taught: [],
    start: () => {}, stop: () => {}, recordExample: jest.fn(), forgetSound: jest.fn(), explain: jest.fn(),
  };
  return () => state;
});

afterEach(() => {
  delete navigator.mediaDevices;
});

const renderInstrument = async () => {
  await act(async () => {
    render(<Instrument />);
  });
};

describe("Instrument", () => {
  it("shows one input, one view switcher, the readouts and the classifier panel", async () => {
    await renderInstrument();
    expect(screen.getByRole("heading", { name: /audiochi/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /microphone/i })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /audio file/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/audio file/i)).toHaveAttribute("accept", "audio/*");
    const views = screen.getAllByRole("radio").map((r) => r.textContent);
    expect(views).toEqual(["Spectrogram", "Ridgeline", "Galaxy", "Spectrograph"]);
    expect(screen.getByRole("radio", { name: "Spectrogram" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByText("Pitch")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /classifier/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /embedding map/i })).toHaveAttribute("href", "/explore");
    expect(screen.getByText(/no input/i)).toBeInTheDocument();
  });

  it("draws frequency and note axes over the spectrogram", async () => {
    await renderInstrument();
    expect(screen.getByText("1k")).toBeInTheDocument();
    expect(screen.getByText("C4")).toBeInTheDocument();
    expect(screen.getByText("−10s")).toBeInTheDocument();
    expect(screen.getByText("now")).toBeInTheDocument();
  });

  it("says so when a 3D view can't start WebGL", async () => {
    await renderInstrument();
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: "Ridgeline" })));
    expect(screen.getByRole("radio", { name: "Ridgeline" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("alert")).toHaveTextContent(/needs webgl/i);
  });

  it("explains when a chosen file can't be decoded", async () => {
    await renderInstrument(); // jsdom has no AudioContext, so decoding fails like an unsupported browser
    const input = screen.getByLabelText(/audio file/i);
    await act(async () =>
      fireEvent.change(input, { target: { files: [{ name: "x.wav", size: 3, arrayBuffer: async () => new ArrayBuffer(3) }] } })
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/can't analyse audio files/i);
  });

  it("explains what happened when the microphone is blocked", async () => {
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    navigator.mediaDevices = { getUserMedia: jest.fn().mockRejectedValue(denied) };
    await renderInstrument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /microphone/i })));
    expect(screen.getByRole("alert")).toHaveTextContent(/microphone access was blocked/i);
    expect(screen.getByRole("button", { name: /microphone/i })).toHaveAttribute("aria-pressed", "false");
  });
});
