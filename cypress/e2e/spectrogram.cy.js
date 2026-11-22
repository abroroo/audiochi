// Run against a dev or prod server: `npm run build && npm start`, then `npm run e2e`.
// Chromium is launched with a fake microphone (see cypress.config.js).

describe("2D spectrogram page", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("shows the title, explanation and controls", () => {
    cy.getDataTest("spectrogram-title").should("have.text", "Sound Recognition");
    cy.getDataTest("spectrogram-title-text").should("contain", "works best in a quiet room");
    cy.getDataTest("spectrogram-toggle-button").should("contain", "Visualize audio");
    cy.getDataTest("start-prediction-button").should("contain", "Recognize sounds");
    cy.getDataTest("author-tag").should("contain", "abroro");
  });

  it("requests the mic and paints audio onto the canvas", () => {
    cy.window().then((win) => cy.spy(win.navigator.mediaDevices, "getUserMedia").as("getUserMedia"));
    cy.getDataTest("spectrogram-toggle-button").click().should("contain", "Stop spectrogram");
    cy.get("@getUserMedia").should("have.been.calledWith", { audio: true });

    // The newest column (right edge) should no longer be the flat background colour.
    cy.get("canvas").should(($canvas) => {
      const canvas = $canvas[0];
      const pixels = canvas.getContext("2d").getImageData(canvas.width - 1, 0, 1, canvas.height).data;
      let painted = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] !== 0x22 || pixels[i + 1] !== 0x00 || pixels[i + 2] !== 0x33) painted++;
      }
      expect(painted, "painted pixels in newest column").to.be.greaterThan(0);
    });

    cy.getDataTest("spectrogram-toggle-button").click().should("contain", "Visualize audio");
  });

  it("explains a blocked microphone", () => {
    cy.window().then((win) => {
      cy.stub(win.navigator.mediaDevices, "getUserMedia").rejects(
        Object.assign(new Error("denied"), { name: "NotAllowedError" })
      );
    });
    cy.getDataTest("spectrogram-toggle-button").click();
    cy.getDataTest("mic-error").should("contain", "Microphone access was blocked");
  });

  it("loads the sound model and shows one bar per class", () => {
    cy.getDataTest("start-prediction-button").click();
    cy.getDataTest("label-container", { timeout: 20000 }).find("li").should("have.length.greaterThan", 1);
    cy.getDataTest("stop-prediction-button").click();
  });

  it("links to the 3D view", () => {
    cy.contains("a", "View in 3D").click();
    cy.location("pathname").should("eq", "/viewIn3D");
    cy.get("canvas").should("exist");
  });
});
