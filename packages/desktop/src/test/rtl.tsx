/**
 * Shared React Testing Library helpers for desktop component tests (*.rtl.tsx).
 *
 * Importing this module wires jest-dom matchers + RTL auto-cleanup, so they
 * apply ONLY to files that import it (the happy-dom component tests) — the
 * node-env unit suites never touch the DOM. Each component test must declare
 * `// @vitest-environment happy-dom` at the top of the file.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(() => cleanup());

export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";

/** Full useLiveSession() return-shape stub; override per test. */
export function liveSessionStub(overrides: Record<string, unknown> = {}) {
  return {
    status: "offline",
    nowPlaying: null,
    error: null,
    isSessionActive: false,
    isCloudConnected: false,
    isLive: false,
    sessionId: null,
    dbSessionId: null,
    currentPlayId: null,
    currentStageId: null,
    currentStageName: null,
    listenerCount: 0,
    tempoFeedback: null,
    activePoll: null,
    activeAnnouncement: null,
    endedPoll: null,
    liveLikes: 0,
    goLive: vi.fn(),
    endSet: vi.fn(),
    clearNowPlaying: vi.fn(),
    startPoll: vi.fn(),
    endPoll: vi.fn(),
    sendAnnouncement: vi.fn(),
    cancelAnnouncement: vi.fn(),
    clearEndedPoll: vi.fn(),
    forceSync: vi.fn(),
    registerImportedTrack: vi.fn(),
    ...overrides,
  };
}

/** Install a navigator.clipboard.writeText spy (happy-dom doesn't provide one). */
export function stubClipboard() {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
    writable: true,
  });
  return writeText;
}
