/**
 * Shared RTL helpers for web component tests (*.rtl.tsx).
 * jest-dom + cleanup + Next mocks live in setup-rtl.tsx (loaded by vitest); this
 * module just re-exports RTL and provides typed stub factories so tests mock the
 * already-unit-tested hooks/data instead of re-testing their logic.
 */
import { vi } from "vitest";

export * from "@testing-library/react";
export { default as userEvent } from "@testing-library/user-event";

/** Full useLiveListener() return-shape stub; override per test. */
export function mockLiveListener(overrides: Record<string, unknown> = {}) {
  return {
    status: "connected",
    currentTrack: null,
    djName: null,
    sessionId: null,
    history: [],
    likedTracks: new Set<string>(),
    listenerCount: 0,
    tempoVote: null,
    activePoll: null,
    hasVotedOnPoll: false,
    announcement: null,
    sendLike: vi.fn(() => true),
    removeLike: vi.fn(),
    hasLiked: vi.fn(() => false),
    sendTempoRequest: vi.fn(),
    voteOnPoll: vi.fn(),
    sendReaction: vi.fn(() => true),
    dismissAnnouncement: vi.fn(),
    onLikeReceived: vi.fn(() => () => {}),
    sessionEnded: false,
    lastHeartbeat: Date.now(),
    pendingCount: 0,
    isSaving: false,
    forceReconnect: vi.fn(),
    ...overrides,
  };
}

/** A fetch() stub that maps a URL-substring → JSON body (404 for unmatched). */
export function mockFetch(routes: Record<string, unknown>) {
  return vi.fn((url: string | URL) => {
    const href = String(url);
    const key = Object.keys(routes).find((k) => href.includes(k));
    const body = key ? routes[key] : { error: "not found" };
    return Promise.resolve(new Response(JSON.stringify(body), { status: key ? 200 : 404 }));
  });
}

/** Install a spy-able navigator.clipboard.writeText; returns the spy. */
export function stubClipboard() {
  const writeText = vi.fn(() => Promise.resolve());
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
  return writeText;
}
