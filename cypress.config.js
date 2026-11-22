const { defineConfig } = require("cypress");

module.exports = defineConfig({
  e2e: {
    baseUrl: "http://localhost:3000",
    setupNodeEvents(on) {
      // Give Chromium a fake microphone so audio flows without a permission prompt.
      on("before:browser:launch", (browser, launchOptions) => {
        if (browser.family === "chromium") {
          launchOptions.args.push("--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream");
        }
        return launchOptions;
      });
    },
  },
});
