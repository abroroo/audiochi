import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import SoundClassifier from "./SoundClassifier";

function installRecognizerMock() {
  let onResult;
  let listening = false;
  const recognizer = {
    ensureModelLoaded: jest.fn().mockResolvedValue(undefined),
    wordLabels: () => ["Background Noise", "Clap", "Snap"],
    listen: jest.fn(async (cb) => {
      onResult = cb;
      listening = true;
    }),
    stopListening: jest.fn(async () => {
      listening = false;
    }),
    isListening: () => listening,
  };
  window.speechCommands = { create: jest.fn(() => recognizer) };
  return { recognizer, emit: (scores) => onResult({ scores: Float32Array.from(scores) }) };
}

afterEach(() => {
  delete window.speechCommands;
});

describe("SoundClassifier", () => {
  it("shows an error when the model library failed to load", async () => {
    render(<SoundClassifier />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /recognize sounds/i })));
    expect(screen.getByRole("alert")).toHaveTextContent(/didn't load/i);
  });

  it("renders a confidence bar per class and highlights live scores", async () => {
    const { recognizer, emit } = installRecognizerMock();
    render(<SoundClassifier />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: /recognize sounds/i })));
    expect(recognizer.ensureModelLoaded).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Clap")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /stop recognition/i })).toBeInTheDocument();

    await act(async () => emit([0.1, 0.85, 0.05]));
    expect(screen.getByText("85%")).toBeInTheDocument();
    expect(screen.getByText("Clap").closest("li")).toHaveClass("font-semibold");
  });

  it("reuses the loaded model across start/stop cycles", async () => {
    const { recognizer } = installRecognizerMock();
    render(<SoundClassifier />);

    await act(async () => fireEvent.click(screen.getByRole("button", { name: /recognize sounds/i })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /stop recognition/i })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /recognize sounds/i })));

    expect(window.speechCommands.create).toHaveBeenCalledTimes(1);
    expect(recognizer.stopListening).toHaveBeenCalledTimes(1);
    expect(recognizer.listen).toHaveBeenCalledTimes(2);
  });

  it("stops listening when unmounted", async () => {
    const { recognizer } = installRecognizerMock();
    const { unmount } = render(<SoundClassifier />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /recognize sounds/i })));
    unmount();
    expect(recognizer.stopListening).toHaveBeenCalled();
  });
});
