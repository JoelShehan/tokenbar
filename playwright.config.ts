import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  workers: 1,
  use: { channel: "msedge", headless: true, viewport: { width: 320, height: 440 } },
  webServer: { command: "npm run dev -- --port 1430", url: "http://localhost:1430", reuseExistingServer: true },
});
