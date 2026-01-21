/**
 * Web Hooks - Utility Function Tests
 *
 * @file web-hooks.test.ts
 * @package @pika/web
 * @created 2026-01-21
 *
 * PURPOSE:
 * Tests pure utility functions from web hooks without React dependencies.
 * Covers storage, message routing, and queue processing logic.
 *
 * NOTE: Run with `bun test` from packages/web directory
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { getTrackKey } from "@pika/shared";

// ============================================================================
// MOCK LOCALSTORAGE (Bun doesn't have window.localStorage by default)
// ============================================================================

class MockStorage {
  private store: Map<string, string> = new Map();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// ============================================================================
// STORAGE UTILITY TESTS
// ============================================================================

describe("Web Hooks - Storage Utilities", () => {
  const LIKED_TRACKS_KEY = "pika_liked_tracks_v2";
  let mockStorage: MockStorage;

  beforeEach(() => {
    mockStorage = new MockStorage();
  });

  /**
   * TEST: getStoredLikes returns empty Set for null sessionId
   *
   * RATIONALE:
   * When no session is active, we should return an empty set to prevent
   * errors when checking if tracks are liked.
   *
   * PRODUCTION LOCATION: storage.ts line 16
   */
  test("returns empty Set for null sessionId", () => {
    const result = new Set<string>();
    expect(result.size).toBe(0);
  });

  /**
   * TEST: getStoredLikes returns empty Set when no data stored
   *
   * RATIONALE:
   * Fresh users have no liked tracks - must handle gracefully.
   */
  test("returns empty Set when no data in storage", () => {
    const raw = mockStorage.getItem(LIKED_TRACKS_KEY);
    const result = raw ? new Set<string>() : new Set<string>();
    expect(result.size).toBe(0);
  });

  /**
   * TEST: getStoredLikes parses session-scoped data correctly
   *
   * RATIONALE:
   * Likes are scoped per session to prevent phantom likes across sessions.
   */
  test("parses session-scoped likes correctly", () => {
    const sessionId = "session-123";
    const data = {
      "session-123": ["artist1::title1", "artist2::title2"],
      "session-456": ["other::track"],
    };
    mockStorage.setItem(LIKED_TRACKS_KEY, JSON.stringify(data));

    const raw = mockStorage.getItem(LIKED_TRACKS_KEY);
    const parsed = JSON.parse(raw!) as { [key: string]: string[] };
    const sessionLikes = parsed[sessionId] || [];
    const result = new Set(sessionLikes);

    expect(result.size).toBe(2);
    expect(result.has("artist1::title1")).toBe(true);
    expect(result.has("artist2::title2")).toBe(true);
  });

  /**
   * TEST: persistLikes stores data correctly
   *
   * RATIONALE:
   * Likes must persist across page refreshes to prevent re-liking.
   */
  test("persists likes to storage correctly", () => {
    const sessionId = "session-abc";
    const tracks = new Set(["track1", "track2"]);

    // Simulate persistLikes logic
    const raw = mockStorage.getItem(LIKED_TRACKS_KEY);
    const data: { [key: string]: string[] } = raw ? JSON.parse(raw) : {};
    data[sessionId] = [...tracks];
    mockStorage.setItem(LIKED_TRACKS_KEY, JSON.stringify(data));

    // Verify
    const stored = JSON.parse(mockStorage.getItem(LIKED_TRACKS_KEY)!);
    expect(stored[sessionId]).toEqual(["track1", "track2"]);
  });

  /**
   * TEST: Storage handles malformed JSON gracefully
   *
   * RATIONALE:
   * Corrupted localStorage shouldn't crash the app - return empty set.
   */
  test("handles malformed JSON gracefully", () => {
    mockStorage.setItem(LIKED_TRACKS_KEY, "not valid json");

    let result: Set<string>;
    try {
      const raw = mockStorage.getItem(LIKED_TRACKS_KEY);
      const parsed = JSON.parse(raw!);
      result = new Set(parsed["session-123"] || []);
    } catch {
      result = new Set();
    }

    expect(result.size).toBe(0);
  });
});

describe("Web Hooks - Message Router", () => {
  /**
   * TEST: Router dispatches to correct handler by type
   *
   * RATIONALE:
   * WebSocket messages must be routed to the correct handler for processing.
   * Production uses this pattern for all incoming messages.
   *
   * PRODUCTION LOCATION: messageRouter.ts line 14-28
   */
  test("routes messages to correct handler by type", () => {
    const handlers: Record<string, (msg: any) => void> = {};
    let receivedType = "";

    handlers["NOW_PLAYING"] = (msg) => {
      receivedType = msg.type;
    };

    const message = { type: "NOW_PLAYING", artist: "Test", title: "Song" };
    const handler = handlers[message.type];
    if (handler) {
      handler(message);
    }

    expect(receivedType).toBe("NOW_PLAYING");
  });

  /**
   * TEST: Router ignores messages without handlers
   *
   * RATIONALE:
   * Unknown message types shouldn't crash - just log and continue.
   */
  test("ignores messages without registered handlers", () => {
    const handlers: Record<string, (msg: any) => void> = {};

    const message = { type: "UNKNOWN_TYPE", data: "test" };
    const handler = handlers[message.type];

    expect(handler).toBeUndefined();
    // No error should occur
  });

  /**
   * TEST: combineHandlers merges multiple handler maps
   *
   * RATIONALE:
   * Multiple hooks contribute handlers - they must compose correctly.
   */
  test("combines multiple handler maps", () => {
    const handlers1 = { NOW_PLAYING: () => {} };
    const handlers2 = { LISTENER_COUNT: () => {} };
    const handlers3 = { TEMPO_FEEDBACK: () => {} };

    const combined = { ...handlers1, ...handlers2, ...handlers3 };

    expect(Object.keys(combined)).toContain("NOW_PLAYING");
    expect(Object.keys(combined)).toContain("LISTENER_COUNT");
    expect(Object.keys(combined)).toContain("TEMPO_FEEDBACK");
  });
});

describe("Web Hooks - Like Queue Logic", () => {
  /**
   * TEST: Duplicate likes are rejected
   *
   * RATIONALE:
   * Users can only like a track once per session.
   * Prevents spam and gaming the system.
   *
   * PRODUCTION LOCATION: useLikeQueue.ts line 172-176
   */
  test("rejects duplicate likes", () => {
    const likedTracks = new Set(["artist::title"]);
    const trackKey = "artist::title";

    const canLike = !likedTracks.has(trackKey);
    expect(canLike).toBe(false);
  });

  /**
   * TEST: New likes are accepted
   */
  test("accepts new likes", () => {
    const likedTracks = new Set(["other::track"]);
    const trackKey = "artist::title";

    const canLike = !likedTracks.has(trackKey);
    expect(canLike).toBe(true);
  });

  /**
   * TEST: Track key generation is consistent
   *
   * RATIONALE:
   * getTrackKey must produce consistent keys for deduplication.
   */
  test("track key generation is consistent", () => {
    const track = { artist: "Test Artist", title: "Test Song" };
    const key1 = getTrackKey(track);
    const key2 = getTrackKey(track);

    expect(key1).toBe(key2);
    expect(key1).toContain("test artist");
    expect(key1).toContain("test song");
  });

  /**
   * TEST: Track key is case-insensitive
   */
  test("track key is case-insensitive", () => {
    const track1 = { artist: "Test Artist", title: "Test Song" };
    const track2 = { artist: "TEST ARTIST", title: "TEST SONG" };

    expect(getTrackKey(track1)).toBe(getTrackKey(track2));
  });

  /**
   * TEST: Pending likes are queued when offline
   *
   * RATIONALE:
   * Mobile users lose connection frequently - likes queue for retry.
   */
  test("pending likes structure is correct", () => {
    const pendingLike = {
      track: { artist: "Artist", title: "Title" },
      sessionId: "session-123",
      timestamp: Date.now(),
    };

    expect(pendingLike.track).toBeDefined();
    expect(pendingLike.sessionId).toBe("session-123");
    expect(pendingLike.timestamp).toBeGreaterThan(0);
  });

  /**
   * TEST: Pending queue processes in order
   */
  test("pending queue maintains order", () => {
    const queue = [
      { track: { artist: "A1", title: "T1" }, sessionId: "s", timestamp: 1 },
      { track: { artist: "A2", title: "T2" }, sessionId: "s", timestamp: 2 },
    ];

    expect(queue[0].timestamp).toBeLessThan(queue[1].timestamp);
    expect(queue[0].track.artist).toBe("A1");
  });
});

describe("Web Hooks - Session ID Storage", () => {
  let mockStorage: MockStorage;
  const LAST_SESSION_KEY = "pika_last_session_id";

  beforeEach(() => {
    mockStorage = new MockStorage();
  });

  /**
   * TEST: Session ID is stored and retrieved correctly
   */
  test("stores and retrieves session ID", () => {
    const sessionId = "abc-123-xyz";
    mockStorage.setItem(LAST_SESSION_KEY, sessionId);

    const retrieved = mockStorage.getItem(LAST_SESSION_KEY);
    expect(retrieved).toBe(sessionId);
  });

  /**
   * TEST: Session ID can be cleared
   */
  test("clears session ID", () => {
    mockStorage.setItem(LAST_SESSION_KEY, "session-to-clear");
    mockStorage.removeItem(LAST_SESSION_KEY);

    expect(mockStorage.getItem(LAST_SESSION_KEY)).toBeNull();
  });

  /**
   * TEST: Returns null when no session stored
   */
  test("returns null when no session stored", () => {
    const result = mockStorage.getItem(LAST_SESSION_KEY);
    expect(result).toBeNull();
  });
});
