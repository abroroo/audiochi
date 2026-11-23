import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import SoundClassifier from "./SoundClassifier";

const labels = ["dog", "rain", "clapping", "keyboard typing", "siren", "cat"];

function classifierState(overrides = {}) {
  return {
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
}

// The page owns the classifier hook; the panel just renders its state.
let hook;
function mockHook(overrides) {
  hook = classifierState(overrides);
  return hook;
}
const renderPanel = () => render(<SoundClassifier classifier={hook} />);

describe("SoundClassifier", () => {
  it("says it is idle until an input starts", () => {
    mockHook();
    renderPanel();
    expect(screen.getByText(/idle/i)).toBeInTheDocument();
  });

  it("shows that the model is loading", () => {
    mockHook({ status: "loading" });
    renderPanel();
    expect(screen.getByText(/loading model/i)).toBeInTheDocument();
  });

  it("shows the error message", () => {
    mockHook({ status: "error", error: "Microphone access was blocked." });
    renderPanel();
    expect(screen.getByRole("alert")).toHaveTextContent(/blocked/);
  });

  it("renders the top 5 classes, best first, with inference time", () => {
    const probs = [0.05, 0.1, 0.6, 0.15, 0.07, 0.03];
    mockHook({ status: "listening", result: { probs, ms: 7.4, quiet: false } });
    renderPanel();
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toHaveLength(5);
    expect(items[0]).toMatch(/clapping.*60%/i);
    expect(items[1]).toMatch(/keyboard typing.*15%/i);
    expect(screen.getByText(/inference 7 ms/i)).toBeInTheDocument();
    expect(screen.queryByText("cat")).not.toBeInTheDocument();
  });

  it("tells the user when it's too quiet", () => {
    mockHook({ status: "listening", result: { probs: labels.map(() => 1 / 6), ms: 5, quiet: true } });
    renderPanel();
    expect(screen.getByText(/treated as silence/i)).toBeInTheDocument();
  });

  it("lists detected sound events", () => {
    mockHook({
      status: "listening",
      result: { probs: [1, 0, 0, 0, 0, 0], ms: 5, quiet: false },
      events: [{ label: "dog", prob: 0.91, at: 1 }],
    });
    renderPanel();
    expect(screen.getByRole("heading", { name: /event log/i })).toBeInTheDocument();
    expect(screen.getByText(/91%/)).toBeInTheDocument();
  });

  const listening = (result) => ({ status: "listening", result: { probs: [0.9, 0.1, 0, 0, 0, 0], ms: 5, quiet: false, ...result } });

  it("says when a sound isn't one of the 50 classes", () => {
    mockHook(listening({ unknown: true }));
    renderPanel();
    expect(screen.getByText(/none of the 50 classes/i)).toBeInTheDocument();
  });

  it("says when it hears speech", () => {
    mockHook(listening({ unknown: true, speech: true }));
    renderPanel();
    expect(screen.getByText(/speech/i)).toBeInTheDocument();
  });

  it("shows a match with a taught sound", () => {
    mockHook(listening({ taughtMatch: { name: "my kettle", sim: 0.87 } }));
    renderPanel();
    expect(screen.getByText("my kettle")).toBeInTheDocument();
    expect(screen.getByText(/0\.87/)).toBeInTheDocument();
  });

  it("explains the prediction on demand", async () => {
    const explanation = {
      logmel: { data: new Float32Array(4), frames: 2 }, cells: [], weights: new Float32Array(0),
      label: "dog", nMels: 2, ms: 12,
    };
    const hook = mockHook({ ...listening(), explain: jest.fn(async () => explanation) });
    renderPanel();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /saliency/i })));
    expect(hook.explain).toHaveBeenCalled();
    expect(screen.getByRole("img", { name: /dog/i })).toBeInTheDocument();
  });

  it("records a taught sound and reports progress", async () => {
    const hook = mockHook({ ...listening(), space: {}, recordExample: jest.fn(async () => 1) });
    renderPanel();
    fireEvent.change(screen.getByLabelText(/sound name/i), { target: { value: "my kettle" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /record 1\/5/i })));
    expect(hook.recordExample).toHaveBeenCalledWith("my kettle");
    expect(screen.getByText(/2 more before it can be recognized/i)).toBeInTheDocument();
  });

  it("shows why a recording failed", async () => {
    mockHook({ ...listening(), space: {}, recordExample: jest.fn(async () => { throw new Error("Too quiet."); }) });
    renderPanel();
    fireEvent.change(screen.getByLabelText(/sound name/i), { target: { value: "x" } });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /record/i })));
    expect(screen.getByText("Too quiet.")).toBeInTheDocument();
  });
});
