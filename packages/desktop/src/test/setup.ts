/**
 * Vitest Test Setup
 *
 * Global test configuration and mocks for desktop unit tests.
 */

import { vi } from "vitest";

// Mock Tauri APIs that aren't available in test environment
vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(() =>
      Promise.resolve({
        execute: vi.fn(),
        select: vi.fn(() => Promise.resolve([])),
      }),
    ),
  },
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  Command: {
    sidecar: vi.fn(() => ({
      execute: vi.fn(() => Promise.resolve({ stdout: "", stderr: "", code: 0 })),
    })),
  },
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  confirm: vi.fn(() => Promise.resolve(true)),
  message: vi.fn(() => Promise.resolve()),
}));

vi.mock("@tauri-apps/api/path", () => ({
  appDataDir: vi.fn(() => Promise.resolve("/mock/app/data")),
  join: vi.fn((...parts: string[]) => Promise.resolve(parts.join("/"))),
}));

// Mock console methods to reduce noise in tests
// Uncomment to silence logs:
// vi.spyOn(console, 'log').mockImplementation(() => {});
// vi.spyOn(console, 'warn').mockImplementation(() => {});

console.log("🧪 Vitest test setup loaded");
