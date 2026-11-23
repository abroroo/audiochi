// Run against a dev or prod server: `npm run build && npm start`, then `npm run e2e`.
// Chromium is launched with a fake microphone (see cypress.config.js).

describe("Instrument", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("shows one input, the view switcher and the classifier panel", () => {
    cy.getDataTest("spectrogram-title").should("have.text", "audiochi");
    cy.getDataTest("spectrogram-toggle-button").should("contain", "Microphone");
    cy.get("[role=radio]").should("have.length", 3).first().should("have.attr", "aria-checked", "true");
    cy.getDataTest("classifier-state").should("contain", "Idle");
    cy.getDataTest("author-tag").should("have.attr", "href").and("contain", "github.com");
  });

  it("starts the mic once and feeds both the meters and the classifier", () => {
    cy.window().then((win) => cy.spy(win.navigator.mediaDevices, "getUserMedia").as("getUserMedia"));
    cy.getDataTest("spectrogram-toggle-button").click().should("contain", "Stop mic");
    cy.get("@getUserMedia").should("have.been.calledOnce");
    cy.getDataTest("pitch-readout").should("contain", "dBFS");
    cy.getDataTest("label-container", { timeout: 20000 }).find("li").should("have.length.greaterThan", 1);
    cy.getDataTest("spectrogram-toggle-button").click().should("contain", "Microphone");
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

  it("switches to the 3D views in place", () => {
    cy.contains("[role=radio]", "Ridgeline").click().should("have.attr", "aria-checked", "true");
    cy.get("canvas").should("exist");
    cy.contains("button", "Reset view").should("exist");
    cy.contains("[role=radio]", "Galaxy").click().should("have.attr", "aria-checked", "true");
  });

  it("redirects the old 3D page to the instrument", () => {
    cy.visit("/viewIn3D");
    cy.location("pathname").should("eq", "/");
  });
});
