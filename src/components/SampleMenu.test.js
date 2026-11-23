import fs from "fs";
import path from "path";
import { SAMPLES, loadSample } from "./SampleMenu";

describe("samples", () => {
  it("every sample file ships in public/", () => {
    for (const s of SAMPLES) expect(fs.existsSync(path.join(__dirname, "../../public", s.src))).toBe(true);
  });

  it("loadSample wraps the response as a named File", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, blob: async () => new Blob(["x"], { type: "audio/mpeg" }) });
    const file = await loadSample(SAMPLES[0], fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith("/samples/dog.mp3");
    expect(file.name).toBe("Dog barking");
    expect(file.type).toBe("audio/mpeg");
  });

  it("loadSample reports a failed fetch", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false });
    await expect(loadSample(SAMPLES[2], fetchImpl)).rejects.toThrow(/Siren/);
  });
});
