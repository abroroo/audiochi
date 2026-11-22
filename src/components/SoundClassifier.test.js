import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import SoundClassifier from "./SoundClassifier";
import useLiveClassifier from "../hooks/useLiveClassifier";

jest.mock("../hooks/useLiveClassifier");

const labels = ["dog", "rain", "clapping", "keyboard typing", "siren", "cat"];

function mockHook(overrides = {}) {
  const value = {
    status: "idle",
    error: null,
    result: null,
    events: [],
    labels,
    space: null,
    taught: [],
    start: jest.fn(),
    stop: jest.fn(),
    recordExample: jest.fn(),
    forgetSound: jest.fn(),
    explain: jest.fn(),
    ...overrides,
  };
  useLiveClassifier.mockReturnValue(value);
  return value;
}

describe("SoundClassifier", () => {
  it("starts recognition on click", async () => {
    const hook = mockHook();
    render(<SoundClassifier />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /recognize sounds/i })));
    expect(hook.start).toHaveBeenCalled();
  });

  it("shows a disabled loading button while the model loads", () => {
    mockHook({ status: "loading" });
    render(<SoundClassifier />);
    expect(screen.getByRole("button", { name: /loading model/i })).toBeDisabled();
  });

  it("shows the error message", () => {
    mockHook({ status: "error", error: "Microphone access was blocked." });
    render(<SoundClassifier />);
    expect(screen.getByRole("alert")).toHaveTextContent(/blocked/);
  });

  it("renders the top 5 classes, best first, with inference time", () => {
    const probs = [0.05, 0.1, 0.6, 0.15, 0.07, 0.03];
    mockHook({ status: "listening", result: { probs, ms: 7.4, quiet: false } });
    render(<SoundClassifier />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toHaveLength(5);
    expect(items[0]).toMatch(/clapping.*60%/i);
    expect(items[1]).toMatch(/keyboard typing.*15%/i);
    expect(screen.getByText(/inference 7 ms/i)).toBeInTheDocument();
    expect(screen.queryByText("cat")).not.toBeInTheDocument();
  });

  it("tells the user when it's too quiet", () => {
    mockHook({ status: "listening", result: { probs: labels.map(() => 1 / 6), ms: 5, quiet: true } });
    render(<SoundClassifier />);
    expect(screen.getByText(/too quiet/i)).toBeInTheDocument();
  });

  it("lists detected sound events", () => {
    mockHook({
      status: "listening",
      result: { probs: [1, 0, 0, 0, 0, 0], ms: 5, quiet: false },
      events: [{ label: "dog", prob: 0.91, at: 1 }],
    });
    render(<SoundClassifier />);
    expect(screen.getByRole("heading", { name: /heard/i })).toBeInTheDocument();
    expect(screen.getByText(/91%/)).toBeInTheDocument();
  });

  it("stops when listening", async () => {
    const hook = mockHook({ status: "listening" });
    render(<SoundClassifier />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /stop recognition/i })));
    expect(hook.stop).toHaveBeenCalled();
  });

  const listening = (result) => ({ status: "listening", result: { probs: [0.9, 0.1, 0, 0, 0, 0], ms: 5, quiet: false, ...result } });

  it("says when a sound isn't one of the 50 classes", () => {
    mockHook(listening({ unknown: true }));
    render(<SoundClassifier />);
    expect(screen.getByText(/not sure/i)).toBeInTheDocument();
  });

  it("says when it hears speech", () => {
    mockHook(listening({ unknown: true, speech: true }));
    render(<SoundClassifier />);
    expect(screen.getByText(/sounds like speech/i)).toBeInTheDocument();
  });

  it("shows a match with a taught sound", () => {
    mockHook(listening({ taughtMatch: { name: "my kettle", sim: 0.87 } }));
    render(<SoundClassifier />);
    expect(screen.getByText("my kettle")).toBeInTheDocument();
    expect(screen.getByText(/0\.87/)).toBeInTheDocument();
  });

  it("explains the prediction on demand", async () => {
    const explanation = {
      logmel: { data: new Float32Array(4), frames: 2 }, cells: [], weights: new Float32Array(0),
      label: "dog", nMels: 2, ms: 12,
    };
    const hook = mockHook({ ...listening(), explain: jest.fn(async () => explanation) });
    render(<SoundClassifier />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /what did it listen to/i })));
    expect(hook.explain).toHaveBeenCalled();
    expect(screen.getByRole("img", { name: /dog/i })).toBeInTheDocument();
  });

  it("records a taught sound and reports progress", async () => {
    const hook = mockHook({ ...listening(), space: {}, recordExample: jest.fn(async () => 1) });
    render(<SoundClassifier />);
    fireEvent.change(screen.getByLabelText(/sound name/i), { target: { value: "my kettle" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /record 1\/5/i })));
    expect(hook.recordExample).toHaveBeenCalledWith("my kettle");
    expect(screen.getByText(/2 more before it can be recognized/i)).toBeInTheDocument();
  });

  it("shows why a recording failed", async () => {
    mockHook({ ...listening(), space: {}, recordExample: jest.fn(async () => { throw new Error("Too quiet."); }) });
    render(<SoundClassifier />);
    fireEvent.change(screen.getByLabelText(/sound name/i), { target: { value: "x" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /record/i })));
    expect(screen.getByText("Too quiet.")).toBeInTheDocument();
  });
});
