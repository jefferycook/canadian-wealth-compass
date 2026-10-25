import { defineConfig } from "@playwright/test";

// E2E smoke tests run against the dev server with synthetic data only.
// Set PLAYWRIGHT_CHROMIUM_PATH to use a preinstalled Chromium.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_PATH || undefined;

export default defineConfig({
  testDir: "./e2e",
  // .e2e.ts (not .spec.ts) so vitest does not collect these files.
  testMatch: "**/*.e2e.ts",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://127.0.0.1:8080",
    launchOptions: { executablePath },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "bun run dev --host 127.0.0.1 --port 8080",
    url: "http://127.0.0.1:8080",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
