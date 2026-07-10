import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure"
  },
  projects: [
    {
      // Mobile viewport with touch: the app is designed for phones.
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] }
    }
  ],
  webServer: {
    command: "node tests/e2e/serve.mjs",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI
  }
});
