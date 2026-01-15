import { defineConfig, devices } from "@playwright/test";

/**
 * Pika! E2E Configuration
 * Defines a hybrid testing environment spawning both Cloud and Web servers.
 */
export default defineConfig({
  testDir: "./tests/e2e/specs",
  fullyParallel: false, // Testing sync logic, simpler to debug sequentially first
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: process.env["CI"] ? 1 : undefined,
  reporter: "html",
  use: {
    trace: "on-first-retry",
    baseURL: "http://localhost:1420",
  },

  // Configure projects for different simulated devices
  projects: [
    {
      name: "Desktop Chrome",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // 🚀 WEBSERVER CONFIG
  // We spawn TWO web servers:
  // 1. Cloud API (port 3000)
  // 2. Web Frontend (port 3002)
  // The "Desktop" runs as a static file set handled by Playwright or Vite dev server (port 1420)
  webServer: [
    {
      command: "bun run --filter @pika/cloud start",
      port: 3001,
      timeout: 120 * 1000,
      reuseExistingServer: !process.env["CI"],
      env: {
        NODE_ENV: "test",
        PORT: "3001",
      },
    },
    {
      command: "bun run --filter @pika/web dev",
      port: 3002,
      timeout: 120 * 1000,
      reuseExistingServer: !process.env["CI"],
    },
    {
      command: "bun run --filter @pika/desktop dev:web",
      port: 1420,
      timeout: 120 * 1000,
      reuseExistingServer: !process.env["CI"],
    },
  ],
});
