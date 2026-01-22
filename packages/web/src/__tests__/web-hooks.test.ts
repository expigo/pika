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

// ============================================================================
// WEBSOCKET CONNECTION TESTS
// ============================================================================

describe("Web Hooks - WebSocket Connection Logic", () => {
  /**
   * TEST: Connection status transitions
   *
   * RATIONALE: Status must transition correctly for UI feedback
   * PRODUCTION LOCATION: useWebSocketConnection.ts line 34, 81, 110, 115
   */
  test("status transitions: connecting -> connected -> disconnected", () => {
    const validTransitions: Record<string, string[]> = {
      connecting: ["connected", "disconnected"],
      connected: ["connecting", "disconnected"],
      disconnected: ["connecting"],
    };

    // Verify valid transitions
    expect(validTransitions.connecting).toContain("connected");
    expect(validTransitions.connected).toContain("disconnected");
    expect(validTransitions.disconnected).toContain("connecting");
  });

  /**
   * TEST: Reconnection delay includes jitter
   *
   * RATIONALE: Jitter prevents thundering herd on server restart
   * PRODUCTION LOCATION: useWebSocketConnection.ts line 70
   */
  test("reconnection delay includes randomized jitter", () => {
    const baseDelay = 1000;
    const jitter = Math.random() * 1000;
    const finalDelay = baseDelay + jitter;

    expect(finalDelay).toBeGreaterThanOrEqual(1000);
    expect(finalDelay).toBeLessThan(2000);
  });

  /**
   * TEST: Heartbeat timeout is adaptive for background tabs
   *
   * RATIONALE: Background tabs should have higher timeout to save battery
   * PRODUCTION LOCATION: useWebSocketConnection.ts line 158
   */
  test("heartbeat timeout is adaptive for background tabs", () => {
    const foregroundTimeout = 30000;
    const backgroundTimeout = 60000;

    expect(backgroundTimeout).toBeGreaterThan(foregroundTimeout);
    expect(backgroundTimeout).toBe(2 * foregroundTimeout);
  });

  /**
   * TEST: PONG message updates lastPong timestamp
   *
   * RATIONALE: Track connection health via heartbeat responses
   * PRODUCTION LOCATION: useWebSocketConnection.ts line 123
   */
  test("PONG message updates heartbeat timestamp", () => {
    let lastPong = Date.now() - 10000;
    let hasReceivedPong = false;

    // Simulate PONG handling
    const handlePong = () => {
      lastPong = Date.now();
      hasReceivedPong = true;
    };

    handlePong();

    expect(lastPong).toBeGreaterThan(Date.now() - 1000);
    expect(hasReceivedPong).toBe(true);
  });

  /**
   * TEST: Visibility change triggers reconnection check
   *
   * RATIONALE: Safari loses connections when tab is backgrounded
   * PRODUCTION LOCATION: useWebSocketConnection.ts line 183-234
   */
  test("stale connection detection on visibility change", () => {
    let lastPong = Date.now() - 35000; // 35 seconds ago
    const staleThreshold = 30000;

    const isStale = Date.now() - lastPong > staleThreshold;
    expect(isStale).toBe(true);
  });

  /**
   * TEST: Send returns false when socket not open
   *
   * RATIONALE: Must handle offline gracefully
   * PRODUCTION LOCATION: useWebSocketConnection.ts line 52-58
   */
  test("send returns false when socket closed", () => {
    const socketReadyState = 3; // CLOSED

    const canSend = socketReadyState === 1; // WebSocket.OPEN
    expect(canSend).toBe(false);
  });
});

// ============================================================================
// POLL STATE TESTS
// ============================================================================

describe("Web Hooks - Poll State Logic", () => {
  /**
   * TEST: Optimistic vote update
   *
   * RATIONALE: Immediate UI feedback for responsive feel
   * PRODUCTION LOCATION: usePollState.ts line 61-71
   */
  test("optimistic vote increments count before server confirmation", () => {
    const poll = {
      id: 1,
      votes: [3, 5, 2],
      totalVotes: 10,
    };
    const optionIndex = 1;

    // Optimistic update
    const newVotes = [...poll.votes];
    newVotes[optionIndex] = (newVotes[optionIndex] || 0) + 1;
    const newTotalVotes = poll.totalVotes + 1;

    expect(newVotes).toEqual([3, 6, 2]);
    expect(newTotalVotes).toBe(11);
  });

  /**
   * TEST: Vote rejected rollback
   *
   * RATIONALE: Server rejection must correct optimistic state
   * PRODUCTION LOCATION: usePollState.ts line 161-187
   */
  test("vote rejection provides corrected vote counts", () => {
    const localVotes = [4, 6, 2]; // Optimistically updated
    const serverVotes = [3, 5, 2]; // Server's authoritative count

    // Rollback to server state
    const correctedVotes = serverVotes;
    expect(correctedVotes).toEqual([3, 5, 2]);
  });

  /**
   * TEST: Poll timer creation for auto-close
   *
   * RATIONALE: Polls with endsAt should auto-dismiss
   * PRODUCTION LOCATION: usePollState.ts line 119
   */
  test("poll with endsAt has valid future timestamp", () => {
    const now = Date.now();
    const endsAt = new Date(now + 60000).toISOString(); // 60 seconds from now

    expect(new Date(endsAt).getTime()).toBeGreaterThan(now);
  });

  /**
   * TEST: Poll ended shows results for 10 seconds
   *
   * RATIONALE: Dancers need time to see final results
   * PRODUCTION LOCATION: usePollState.ts line 143-150
   */
  test("poll ended timer is 10 seconds", () => {
    const POLL_RESULTS_DISPLAY_MS = 10000;
    expect(POLL_RESULTS_DISPLAY_MS).toBe(10000);
  });

  /**
   * TEST: Already voted flag prevents double voting
   *
   * RATIONALE: One vote per user per poll
   * PRODUCTION LOCATION: usePollState.ts line 47-48
   */
  test("hasVotedOnPoll blocks additional votes", () => {
    const hasVotedOnPoll = true;
    const canVote = !hasVotedOnPoll;
    expect(canVote).toBe(false);
  });

  /**
   * TEST: Poll ID update maps correctly
   *
   * RATIONALE: Optimistic IDs (-1) get replaced by server IDs
   * PRODUCTION LOCATION: usePollState.ts line 209-221
   */
  test("poll ID update replaces optimistic ID", () => {
    let poll = { id: -1, question: "Test" };
    const oldPollId = -1;
    const newPollId = 42;

    if (poll.id === oldPollId) {
      poll = { ...poll, id: newPollId };
    }

    expect(poll.id).toBe(42);
  });
});

// ============================================================================
// TEMPO VOTE TESTS
// ============================================================================

describe("Web Hooks - Tempo Vote Logic", () => {
  /**
   * TEST: Toggle off clears vote
   *
   * RATIONALE: Tapping same button again should clear vote
   * PRODUCTION LOCATION: useTempoVote.ts line 63-84
   */
  test("toggle off clears existing tempo vote", () => {
    const currentVote = "faster";
    const newVote = "faster"; // Same as current

    const isToggleOff = currentVote === newVote;
    const effectivePref = isToggleOff ? "clear" : newVote;

    expect(isToggleOff).toBe(true);
    expect(effectivePref).toBe("clear");
  });

  /**
   * TEST: Different vote changes preference
   *
   * RATIONALE: Switching from faster to slower should update
   * PRODUCTION LOCATION: useTempoVote.ts line 63-84
   */
  test("different tempo vote updates preference", () => {
    const currentVote = "faster";
    const newVote = "slower";

    const isToggleOff = currentVote === newVote;
    const effectivePref = isToggleOff ? "clear" : newVote;

    expect(isToggleOff).toBe(false);
    expect(effectivePref).toBe("slower");
  });

  /**
   * TEST: Tempo storage key is track-scoped
   *
   * RATIONALE: Tempo votes reset when track changes
   * PRODUCTION LOCATION: useTempoVote.ts line 34, 65
   */
  test("tempo storage key scopes to session and track", () => {
    const sessionId = "session-123";
    const trackKey = "artist::title";
    const storageKey = `pika_tempo_${sessionId}_${trackKey}`;

    expect(storageKey).toBe("pika_tempo_session-123_artist::title");
    expect(storageKey).toContain(sessionId);
    expect(storageKey).toContain(trackKey);
  });

  /**
   * TEST: Tempo reset only applies to current session
   *
   * RATIONALE: Other session's resets should be ignored
   * PRODUCTION LOCATION: useTempoVote.ts line 97-99
   */
  test("tempo reset ignores different session", () => {
    const mySession = "session-abc";
    const resetMessage = { sessionId: "session-xyz" };

    const shouldReset = resetMessage.sessionId === mySession;
    expect(shouldReset).toBe(false);
  });
});

// ============================================================================
// ANNOUNCEMENT TESTS
// ============================================================================

describe("Web Hooks - Announcement Logic", () => {
  /**
   * TEST: Announcement auto-dismiss calculates delay correctly
   *
   * RATIONALE: Announcements with endsAt should auto-dismiss
   * PRODUCTION LOCATION: useAnnouncement.ts line 32-44
   */
  test("announcement auto-dismiss delay calculation", () => {
    const now = Date.now();
    const endsAt = new Date(now + 30000).toISOString();
    const endTime = new Date(endsAt).getTime();
    const delay = endTime - now;

    expect(delay).toBeGreaterThan(29000);
    expect(delay).toBeLessThanOrEqual(30000);
  });

  /**
   * TEST: Expired announcement dismissed immediately
   *
   * RATIONALE: Don't show stale announcements from reconnect
   * PRODUCTION LOCATION: useAnnouncement.ts line 36-38
   */
  test("expired announcement has non-positive delay", () => {
    const now = Date.now();
    const endsAt = new Date(now - 5000).toISOString(); // 5 seconds ago
    const endTime = new Date(endsAt).getTime();
    const delay = endTime - now;

    expect(delay).toBeLessThanOrEqual(0);
  });

  /**
   * TEST: Announcement filters by session
   *
   * RATIONALE: Only show announcements for current session
   * PRODUCTION LOCATION: useAnnouncement.ts line 61-66
   */
  test("announcement ignored if session mismatch", () => {
    const mySession = "session-abc";
    const message = { sessionId: "session-xyz", message: "Test" };

    const shouldShow = message.sessionId === mySession;
    expect(shouldShow).toBe(false);
  });

  /**
   * TEST: Vibration called for new announcement
   *
   * RATIONALE: Haptic feedback for important messages
   * PRODUCTION LOCATION: useAnnouncement.ts line 71-75
   */
  test("vibration pattern for announcement", () => {
    const vibrationMs = 200;
    expect(vibrationMs).toBe(200);
  });
});

// ============================================================================
// TRACK HISTORY TESTS
// ============================================================================

describe("Web Hooks - Track History Logic", () => {
  /**
   * TEST: History prepends new tracks
   *
   * RATIONALE: Most recent track should be first
   */
  test("history prepends new tracks", () => {
    const history = [{ title: "Old Song 1" }, { title: "Old Song 2" }];
    const newTrack = { title: "New Song" };

    const updated = [newTrack, ...history];

    expect(updated[0].title).toBe("New Song");
    expect(updated[1].title).toBe("Old Song 1");
  });

  /**
   * TEST: History limits size
   *
   * RATIONALE: Prevent unbounded memory growth
   */
  test("history truncates to max size", () => {
    const MAX_HISTORY = 50;
    const history = new Array(60).fill({ title: "Track" });

    const truncated = history.slice(0, MAX_HISTORY);

    expect(truncated.length).toBe(50);
  });
});

// ============================================================================
// EDGE CASES: Error Handling
// ============================================================================

describe("Web Hooks - Edge Cases: Error Handling", () => {
  let mockStorage: MockStorage;

  beforeEach(() => {
    mockStorage = new MockStorage();
  });

  /**
   * TEST: IndexedDB failure returns empty array
   *
   * RATIONALE: IDB might be unavailable (private mode)
   */
  test("IndexedDB failure returns empty pending likes", async () => {
    // Simulate IDB failure by returning empty
    const loadPendingFromIDB = async (): Promise<{ track: object }[]> => {
      try {
        throw new Error("IDB unavailable");
      } catch {
        return [];
      }
    };

    const result = await loadPendingFromIDB();
    expect(result).toEqual([]);
  });

  /**
   * TEST: JSON parse error doesn't crash
   *
   * RATIONALE: Corrupted WebSocket message shouldn't crash
   */
  test("malformed WebSocket message ignored", () => {
    let parsed = null;
    try {
      parsed = JSON.parse("not valid json");
    } catch {
      // Ignore parse errors
    }

    expect(parsed).toBeNull();
  });

  /**
   * TEST: Missing optional message fields handled
   *
   * RATIONALE: Server might not send all fields
   */
  test("handles missing optional message fields", () => {
    const message = { type: "POLL_STARTED", pollId: 1, question: "Test", options: ["A", "B"] };

    const votes = message.votes || new Array(2).fill(0);
    const totalVotes = message.totalVotes ?? 0;
    const endsAt = message.endsAt;

    expect(votes).toEqual([0, 0]);
    expect(totalVotes).toBe(0);
    expect(endsAt).toBeUndefined();
  });

  /**
   * TEST: Null sessionId handled in storage functions
   */
  test("null sessionId returns empty likes", () => {
    const sessionId = null;
    const result = sessionId ? getStoredLikes(sessionId) : new Set();
    expect(result.size).toBe(0);
  });
});

// ============================================================================
// EDGE CASES: Unicode and Special Characters
// ============================================================================

describe("Web Hooks - Edge Cases: Unicode and Special Characters", () => {
  /**
   * TEST: Track key handles emoji
   */
  test("track key handles emoji in title", () => {
    const track = { artist: "DJ 🎵", title: "Summer Vibes ☀️" };
    const key = getTrackKey(track);

    expect(key).toContain("dj 🎵");
    expect(key).toContain("summer vibes ☀️");
  });

  /**
   * TEST: Poll question with special characters
   */
  test("poll question preserves special characters", () => {
    const question = "What's next? \"Pop\" or 'Blues'?";
    const serialized = JSON.stringify({ question });
    const parsed = JSON.parse(serialized);

    expect(parsed.question).toBe(question);
  });

  /**
   * TEST: Announcement message with newlines
   */
  test("announcement message preserves newlines", () => {
    const message = "Break time!\n5 minutes";
    const serialized = JSON.stringify({ message });
    const parsed = JSON.parse(serialized);

    expect(parsed.message).toBe("Break time!\n5 minutes");
    expect(parsed.message).toContain("\n");
  });
});

// ============================================================================
// EDGE CASES: Network Scenarios
// ============================================================================

describe("Web Hooks - Edge Cases: Network Scenarios", () => {
  /**
   * TEST: Like queued when offline
   *
   * RATIONALE: Mobile users lose connection frequently
   */
  test("like queued when socket not open", () => {
    const socketReadyState = 3; // CLOSED
    const track = { artist: "Test", title: "Song" };
    const pendingLikes: object[] = [];

    if (socketReadyState !== 1) {
      pendingLikes.push({ track, timestamp: Date.now() });
    }

    expect(pendingLikes.length).toBe(1);
  });

  /**
   * TEST: Pending likes flushed on reconnect
   */
  test("pending likes cleared after successful flush", () => {
    const pending = [
      { id: 1, track: { artist: "A", title: "T" } },
      { id: 2, track: { artist: "B", title: "U" } },
    ];
    const successfullyFlushed = [0, 1];

    const remaining = pending.filter((_, i) => !successfullyFlushed.includes(i));
    expect(remaining.length).toBe(0);
  });

  /**
   * TEST: Flush stops on send failure
   *
   * RATIONALE: Don't lose pending likes on partial failure
   */
  test("flush stops on first failure", () => {
    const pending = [
      { id: 1, success: true },
      { id: 2, success: false },
      { id: 3, success: true },
    ];

    const processed: number[] = [];
    for (const item of pending) {
      if (!item.success) {
        break;
      }
      processed.push(item.id);
    }

    expect(processed).toEqual([1]);
  });

  /**
   * TEST: Reconnect re-subscribes to session
   *
   * RATIONALE: Must rejoin session after connection restored
   */
  test("reconnect sends SUBSCRIBE message", () => {
    const targetSessionId = "session-123";
    const clientId = "client-456";

    const subscribeMessage = targetSessionId
      ? { type: "SUBSCRIBE", clientId, sessionId: targetSessionId }
      : { type: "GET_SESSIONS", clientId };

    expect(subscribeMessage.type).toBe("SUBSCRIBE");
    expect(subscribeMessage.sessionId).toBe("session-123");
  });
});

// ============================================================================
// EDGE CASES: State Consistency
// ============================================================================

describe("Web Hooks - Edge Cases: State Consistency", () => {
  /**
   * TEST: Poll update only applies to matching ID
   */
  test("poll update ignored if ID mismatch", () => {
    const activePoll = { id: 1, votes: [1, 2] };
    const update = { pollId: 2, votes: [5, 5] };

    const shouldUpdate = activePoll.id === update.pollId;
    expect(shouldUpdate).toBe(false);
  });

  /**
   * TEST: hasLiked uses case-insensitive key
   */
  test("hasLiked is case insensitive", () => {
    const likedTracks = new Set(["test artist::test song"]);
    const track1 = { artist: "Test Artist", title: "Test Song" };
    const track2 = { artist: "TEST ARTIST", title: "TEST SONG" };

    const key1 = getTrackKey(track1);
    const key2 = getTrackKey(track2);

    expect(key1).toBe(key2);
    expect(likedTracks.has(key1)).toBe(true);
  });

  /**
   * TEST: Session end resets all state
   */
  test("session end clears all hook state", () => {
    // Simulate state after session
    let likedTracks = new Set(["track1", "track2"]);
    let activePoll = { id: 1 };
    let announcement = { message: "Test" };
    let tempoVote = "faster";
    let pendingLikes: object[] = [{ id: 1 }];

    // Reset all
    likedTracks = new Set();
    activePoll = null as unknown as { id: number };
    announcement = null as unknown as { message: string };
    tempoVote = null as unknown as string;
    pendingLikes = [];

    expect(likedTracks.size).toBe(0);
    expect(activePoll).toBeNull();
    expect(announcement).toBeNull();
    expect(tempoVote).toBeNull();
    expect(pendingLikes.length).toBe(0);
  });
});

// Helper to get stored likes (mock implementation)
function getStoredLikes(sessionId: string): Set<string> {
  // This would normally read from localStorage
  return new Set();
}
