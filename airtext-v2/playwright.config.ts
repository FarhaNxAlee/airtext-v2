import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  workers: 1,
  timeout: 45_000,
  use: { baseURL: "http://127.0.0.1:8790", headless: true, channel: process.env.PLAYWRIGHT_CHANNEL, screenshot: "only-on-failure", trace: "retain-on-failure" },
  webServer: { command: "node scripts/e2e-server.mjs", url: "http://127.0.0.1:8790", timeout: 60_000, reuseExistingServer: !process.env.CI },
});
