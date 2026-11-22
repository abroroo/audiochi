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
    start: jest.fn(),
    stop: jest.fn(),
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
});
