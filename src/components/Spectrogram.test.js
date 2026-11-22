import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import Spectrogram from "./Spectrogram";

jest.mock("next/link", () => {
  const Link = ({ children, href, ...rest }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  );
  return Link;
});

afterEach(() => {
  delete navigator.mediaDevices;
});

describe("Spectrogram", () => {
  it("renders the title, 3D link and controls", () => {
    render(<Spectrogram />);
    expect(screen.getByRole("heading", { name: /sound recognition/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /view in 3d/i })).toHaveAttribute("href", "/viewIn3D");
    expect(screen.getByRole("button", { name: /visualize audio/i })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: /recognize sounds/i })).toBeInTheDocument();
  });

  it("explains what happened when the microphone is blocked", async () => {
    const denied = Object.assign(new Error("denied"), { name: "NotAllowedError" });
    navigator.mediaDevices = { getUserMedia: jest.fn().mockRejectedValue(denied) };

    render(<Spectrogram />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: /visualize audio/i })));

    expect(screen.getByRole("alert")).toHaveTextContent(/microphone access was blocked/i);
    expect(screen.getByRole("button", { name: /visualize audio/i })).toBeInTheDocument();
  });
});
