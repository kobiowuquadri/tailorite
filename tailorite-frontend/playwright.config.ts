import { defineConfig, devices } from "@playwright/test";

// Browser tests run against an isolated stack: a production build of this app on :3100 and the
// API + worker on :4100 with a fresh "_e2e" database and the deterministic fake AI provider.
// No real AI provider is called; see tailorite-backend/scripts/e2e-stack.mjs.
const WEB = process.env.E2E_BASE_URL ?? "http://localhost:3100";
const API = process.env.E2E_API_URL ?? "http://localhost:4100";

export default defineConfig({
  testDir: "e2e",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: WEB,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    timezoneId: "Africa/Lagos",
    locale: "en-NG",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 900 } } }],
  webServer: [
    {
      command: "node ../tailorite-backend/scripts/e2e-stack.mjs",
      url: `${API}/api/health/ready`,
      timeout: 300_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
    {
      command: "node scripts/e2e-web.mjs",
      url: `${WEB}/login`,
      timeout: 600_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
