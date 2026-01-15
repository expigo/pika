import { defineConfig, devices } from "@playwright/test";

/**
 * Pika! E2E Configuration (v2)
 *
 * Simplified configuration:
 * - Cloud Server (port 3001)
 * - Web Frontend (port 3002)
 * - DJ simulated via WebSocket (no Desktop needed)
 */
export default defineConfig({
  testDir: "./tests/e2e/specs",
  fullyParallel: false,
  forbidOnly: !!process.env["CI"],
  retries: process.env["CI"] ? 2 : 0,
  workers: 1, // Sequential for WebSocket state consistency
  reporter: [["html"], ["list"]],
  timeout: 60000, // 60s per test (discovery test needs time)

  use: {
    trace: "on-first-retry",
    baseURL: "http://localhost:3002",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],

  // Web servers to spawn
  webServer: [
    {
      command: "bun run --filter @pika/cloud start",
      port: 3001,
      timeout: 120 * 1000,
      reuseExistingServer: !process.env["CI"],
      env: {
        NODE_ENV: "test",
        PORT: "3001",
        // High rate limit for tests
        WS_RATE_LIMIT: "1000",
      },
    },
    {
      command: "bun run --filter @pika/web dev",
      port: 3002,
      timeout: 120 * 1000,
      reuseExistingServer: !process.env["CI"],
      env: {
        NEXT_PUBLIC_CLOUD_WS_URL: "ws://localhost:3001/ws",
        NEXT_PUBLIC_CLOUD_API_URL: "http://localhost:3001",
      },
    },
  ],
});
