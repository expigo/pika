/**
 * WebSocket Message Handler Tests
 *
 * @file websocket-handlers.test.ts
 * @package @pika/cloud
 * @created 2026-01-21
 *
 * PURPOSE:
 * Tests WebSocket message handler logic in isolation, without actual WebSocket
 * connections or database operations. This enables:
 * - Fast, deterministic test execution
 * - Safe refactoring with confidence
 * - Documentation of expected behavior
 *
 * TESTING STRATEGY:
 * 1. Extract handler logic into pure functions (testable)
 * 2. Mock external dependencies (DB, broadcast, etc.)
 * 3. Test input validation, state transitions, and return values
 *
 * SAFETY CONSTRAINTS (from user):
 * - Every line of code must be tested before deletion
 * - No removal of production code until tests pass with new changes
 * - Document every test thoroughly
 *
 * BASELINE:
 * - 15 auth tests passing (auth.test.ts)
 * - This file adds WebSocket handler coverage
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";

// ============================================================================
// MOCK TYPES & HELPERS
// ============================================================================

/**
 * Mock WebSocket client for testing
 * Simulates the behavior of a connected client
 */
interface MockWebSocketClient {
  id: string;
  readyState: number;
  sentMessages: string[];
  send: (data: string) => void;
}

/**
 * Creates a mock WebSocket client for testing
 */
function createMockClient(id: string): MockWebSocketClient {
  const client: MockWebSocketClient = {
    id,
    readyState: 1, // WebSocket.OPEN
    sentMessages: [],
    send: (data: string) => {
      client.sentMessages.push(data);
    },
  };
  return client;
}

/**
 * Parses the last message sent to a client
 */
function getLastSentMessage(client: MockWebSocketClient): Record<string, unknown> | null {
  if (client.sentMessages.length === 0) return null;
  return JSON.parse(client.sentMessages[client.sentMessages.length - 1]);
}

// ============================================================================
// HANDLER LOGIC (Extracted for testing)
// These mirror the logic in index.ts but are isolated for testing.
// When we wire lib/ modules, these will be replaced by imports.
// ============================================================================

/**
 * Handles PING message from client
 *
 * BEHAVIOR:
 * - Responds immediately with PONG
 * - No state changes
 * - Used for connection health monitoring
 *
 * PRODUCTION LOCATION: packages/cloud/src/index.ts (around line 530)
 */
function handlePing(client: MockWebSocketClient): void {
  client.send(JSON.stringify({ type: "PONG" }));
}

/**
 * Handles heartbeat for connection liveness
 *
 * BEHAVIOR:
 * - Client sends PING every 10 seconds
 * - Server responds with PONG within 100ms
 * - If no PONG received in 30s, client reconnects
 *
 * This test validates the server-side response behavior.
 */

// ============================================================================
// TEST SUITES
// ============================================================================

describe("WebSocket Handlers - PING/PONG Heartbeat", () => {
  /**
   * TEST: PING message receives PONG response
   *
   * RATIONALE:
   * The heartbeat mechanism is critical for connection health monitoring.
   * Mobile devices in dance venues often have unstable WiFi, so the heartbeat
   * system detects dead connections and triggers reconnection.
   *
   * FLOW:
   * 1. Client connects and starts heartbeat interval (10s)
   * 2. Client sends { type: "PING" }
   * 3. Server responds with { type: "PONG" }
   * 4. Client updates lastPongRef timestamp
   *
   * FAILURE IMPACT:
   * If PONG is not sent, clients will falsely detect dead connection
   * and enter reconnection loops, causing poor UX for dancers.
   */
  test("responds to PING with PONG", () => {
    // Arrange: Create a mock connected client
    const client = createMockClient("dancer-123");

    // Act: Simulate receiving PING message
    handlePing(client);

    // Assert: Server should have sent PONG
    expect(client.sentMessages).toHaveLength(1);
    const response = getLastSentMessage(client);
    expect(response).toEqual({ type: "PONG" });
  });

  /**
   * TEST: Multiple PINGs receive multiple PONGs
   *
   * RATIONALE:
   * Ensures stateless handling - each PING should get its own PONG.
   * No rate limiting on heartbeat messages.
   */
  test("handles multiple consecutive PINGs", () => {
    const client = createMockClient("dancer-456");

    // Act: Send 3 PINGs
    handlePing(client);
    handlePing(client);
    handlePing(client);

    // Assert: Should have 3 PONGs
    expect(client.sentMessages).toHaveLength(3);
    for (const msg of client.sentMessages) {
      expect(JSON.parse(msg)).toEqual({ type: "PONG" });
    }
  });

  /**
   * TEST: PONG response format is correct
   *
   * RATIONALE:
   * Client-side parsing expects exactly { type: "PONG" }.
   * Extra fields would not break parsing but would waste bandwidth.
   * Missing type field would cause client to log parse error.
   */
  test("PONG response has correct format", () => {
    const client = createMockClient("dancer-789");
    handlePing(client);

    const response = getLastSentMessage(client);

    // Strict equality check - no extra fields
    expect(Object.keys(response || {})).toEqual(["type"]);
    expect(response?.type).toBe("PONG");
  });
});

// ============================================================================
// NONCE DEDUPLICATION TESTS
// ============================================================================

/**
 * Nonce tracking for message deduplication
 *
 * PRODUCTION BEHAVIOR:
 * - Each message can include a nonce for idempotency
 * - Seen nonces are tracked in a Map with 5-minute TTL
 * - Max 10,000 nonces stored (FIFO eviction)
 * - Duplicate nonces are rejected (returns false)
 *
 * PRODUCTION LOCATION: packages/cloud/src/index.ts (checkAndRecordNonce function)
 */

interface NonceState {
  nonce: string;
  timestamp: number;
  sessionId: string;
}

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_NONCES = 10_000;

let seenNonces: Map<string, NonceState>;

/**
 * Check if nonce has been seen, and record it if not
 *
 * @param nonce - Unique message identifier
 * @param sessionId - Session the message belongs to
 * @returns true if message should be processed, false if duplicate
 */
function checkAndRecordNonce(nonce: string | undefined, sessionId: string): boolean {
  if (!nonce) return true; // No nonce = no deduplication (legacy clients)

  // Check if already seen
  const existing = seenNonces.get(nonce);
  if (existing) {
    console.log(
      `🔄 Duplicate nonce detected: ${nonce.substring(0, 16)}... (session: ${sessionId})`,
    );
    return false;
  }

  // Enforce max nonces (FIFO eviction)
  if (seenNonces.size >= MAX_NONCES) {
    const oldestKey = seenNonces.keys().next().value;
    if (oldestKey) seenNonces.delete(oldestKey);
  }

  // Record this nonce
  seenNonces.set(nonce, { nonce, timestamp: Date.now(), sessionId });
  return true;
}

describe("WebSocket Handlers - Nonce Deduplication", () => {
  beforeEach(() => {
    // Reset nonce state before each test
    seenNonces = new Map();
  });

  /**
   * TEST: First occurrence of nonce is accepted
   *
   * RATIONALE:
   * New nonces should always be accepted and recorded for future checks.
   */
  test("accepts new nonce", () => {
    const result = checkAndRecordNonce("nonce-abc-123", "session-1");

    expect(result).toBe(true);
    expect(seenNonces.has("nonce-abc-123")).toBe(true);
  });

  /**
   * TEST: Duplicate nonce is rejected
   *
   * RATIONALE:
   * Replay attacks and duplicate messages should be blocked.
   * This is critical for preventing double-likes and double-votes.
   */
  test("rejects duplicate nonce", () => {
    checkAndRecordNonce("nonce-abc-123", "session-1");
    const result = checkAndRecordNonce("nonce-abc-123", "session-1");

    expect(result).toBe(false);
  });

  /**
   * TEST: Messages without nonce are always accepted
   *
   * RATIONALE:
   * Legacy clients (before v0.2.4) don't send nonces.
   * We maintain backward compatibility by accepting all messages
   * without nonces, even if this means no deduplication protection.
   */
  test("accepts message without nonce (legacy client support)", () => {
    const result1 = checkAndRecordNonce(undefined, "session-1");
    const result2 = checkAndRecordNonce(undefined, "session-1");

    expect(result1).toBe(true);
    expect(result2).toBe(true);
  });

  /**
   * TEST: Different nonces are treated independently
   *
   * RATIONALE:
   * Each unique nonce should be tracked separately.
   * Ensures proper isolation between different messages.
   */
  test("accepts different nonces independently", () => {
    const result1 = checkAndRecordNonce("nonce-1", "session-1");
    const result2 = checkAndRecordNonce("nonce-2", "session-1");
    const result3 = checkAndRecordNonce("nonce-3", "session-2");

    expect(result1).toBe(true);
    expect(result2).toBe(true);
    expect(result3).toBe(true);
    expect(seenNonces.size).toBe(3);
  });

  /**
   * TEST: FIFO eviction when max nonces reached
   *
   * RATIONALE:
   * Memory is bounded by MAX_NONCES (10,000).
   * Oldest nonces are evicted first to make room for new ones.
   * This ensures the server doesn't run out of memory during
   * long-running sessions with many messages.
   */
  test("evicts oldest nonce when max limit reached", () => {
    // Fill up to max
    for (let i = 0; i < MAX_NONCES; i++) {
      checkAndRecordNonce(`nonce-${i}`, "session-1");
    }

    expect(seenNonces.size).toBe(MAX_NONCES);

    // Add one more - should evict nonce-0
    checkAndRecordNonce("nonce-new", "session-1");

    expect(seenNonces.size).toBe(MAX_NONCES);
    expect(seenNonces.has("nonce-0")).toBe(false);
    expect(seenNonces.has("nonce-new")).toBe(true);
  });
});

// ============================================================================
// LISTENER TRACKING TESTS
// ============================================================================

/**
 * Listener (dancer) tracking for session attendance
 *
 * PRODUCTION BEHAVIOR:
 * - Each dancer connection increments listener count
 * - Multiple tabs from same clientId share a single count
 * - Disconnection decrements count
 * - Count of zero removes session from tracking
 *
 * PRODUCTION LOCATION: packages/cloud/src/lib/listeners.ts
 */

interface ListenerEntry {
  clientId: string;
  connections: number;
  lastSeen: number;
}

let sessionListeners: Map<string, Map<string, ListenerEntry>>;

/**
 * Add a listener to a session
 * @returns New total listener count for the session
 */
function addListener(sessionId: string, clientId: string): number {
  if (!sessionListeners.has(sessionId)) {
    sessionListeners.set(sessionId, new Map());
  }

  const listeners = sessionListeners.get(sessionId)!;
  const existing = listeners.get(clientId);

  if (existing) {
    existing.connections++;
    existing.lastSeen = Date.now();
  } else {
    listeners.set(clientId, {
      clientId,
      connections: 1,
      lastSeen: Date.now(),
    });
  }

  return listeners.size;
}

/**
 * Remove a listener from a session
 * @returns New total listener count for the session
 */
function removeListener(sessionId: string, clientId: string): number {
  const listeners = sessionListeners.get(sessionId);
  if (!listeners) return 0;

  const entry = listeners.get(clientId);
  if (!entry) return listeners.size;

  entry.connections--;
  if (entry.connections <= 0) {
    listeners.delete(clientId);
  }

  if (listeners.size === 0) {
    sessionListeners.delete(sessionId);
    return 0;
  }

  return listeners.size;
}

/**
 * Get listener count for a session
 */
function getListenerCount(sessionId: string): number {
  return sessionListeners.get(sessionId)?.size ?? 0;
}

describe("WebSocket Handlers - Listener Tracking", () => {
  beforeEach(() => {
    sessionListeners = new Map();
  });

  /**
   * TEST: First listener creates session entry
   *
   * RATIONALE:
   * When first dancer joins a session, tracking begins.
   * This is the foundation for listener count display.
   */
  test("adds first listener and returns count of 1", () => {
    const count = addListener("session-1", "dancer-abc");

    expect(count).toBe(1);
    expect(getListenerCount("session-1")).toBe(1);
  });

  /**
   * TEST: Multiple unique listeners increment count
   *
   * RATIONALE:
   * Each unique dancer should increase the count shown to the DJ.
   */
  test("multiple dancers increase listener count", () => {
    addListener("session-1", "dancer-a");
    addListener("session-1", "dancer-b");
    const count = addListener("session-1", "dancer-c");

    expect(count).toBe(3);
    expect(getListenerCount("session-1")).toBe(3);
  });

  /**
   * TEST: Same clientId from multiple tabs counts once
   *
   * RATIONALE:
   * A dancer with multiple browser tabs shouldn't inflate the count.
   * We track connections per clientId but report unique clientIds.
   */
  test("same client with multiple tabs counts as one", () => {
    addListener("session-1", "dancer-a");
    addListener("session-1", "dancer-a"); // Same client, second tab

    expect(getListenerCount("session-1")).toBe(1);
  });

  /**
   * TEST: Listener removal decrements count
   *
   * RATIONALE:
   * When dancer closes tab, count should decrease.
   */
  test("removing listener decrements count", () => {
    addListener("session-1", "dancer-a");
    addListener("session-1", "dancer-b");
    const count = removeListener("session-1", "dancer-a");

    expect(count).toBe(1);
    expect(getListenerCount("session-1")).toBe(1);
  });

  /**
   * TEST: Multi-tab disconnect only removes after all tabs closed
   *
   * RATIONALE:
   * If dancer has 2 tabs and closes 1, they're still listening.
   * Only when all tabs are closed should they be removed.
   */
  test("multi-tab client only removed after all tabs closed", () => {
    addListener("session-1", "dancer-a");
    addListener("session-1", "dancer-a"); // Second tab

    removeListener("session-1", "dancer-a"); // Close one tab
    expect(getListenerCount("session-1")).toBe(1); // Still counted

    removeListener("session-1", "dancer-a"); // Close second tab
    expect(getListenerCount("session-1")).toBe(0); // Now removed
  });

  /**
   * TEST: Session cleanup when all listeners leave
   *
   * RATIONALE:
   * Empty sessions should be cleaned up to prevent memory leaks.
   */
  test("session is cleaned up when last listener leaves", () => {
    addListener("session-1", "dancer-a");
    removeListener("session-1", "dancer-a");

    expect(sessionListeners.has("session-1")).toBe(false);
  });

  /**
   * TEST: Different sessions are independent
   *
   * RATIONALE:
   * Multiple DJs can run sessions simultaneously.
   * Listener counts must be session-scoped.
   */
  test("different sessions have independent counts", () => {
    addListener("session-1", "dancer-a");
    addListener("session-1", "dancer-b");
    addListener("session-2", "dancer-c");

    expect(getListenerCount("session-1")).toBe(2);
    expect(getListenerCount("session-2")).toBe(1);
  });
});

// ============================================================================
// TEMPO VOTING TESTS (with TTL decay)
// ============================================================================

/**
 * Tempo voting system for floor feedback
 *
 * PRODUCTION BEHAVIOR:
 * - Dancers vote: "faster", "slower", or "perfect"
 * - One vote per client per session (overwrites previous)
 * - Votes expire after 5 minutes (TEMPO_VOTE_TTL)
 * - Aggregated for DJ display
 *
 * PRODUCTION LOCATION: packages/cloud/src/lib/tempo.ts
 */

interface TempoVote {
  preference: "faster" | "slower" | "perfect";
  timestamp: number;
}

const TEMPO_VOTE_TTL = 5 * 60 * 1000; // 5 minutes

let tempoVotes: Map<string, Map<string, TempoVote>>;

function recordTempoVote(
  sessionId: string,
  clientId: string,
  preference: "faster" | "slower" | "perfect",
  timestamp?: number,
): void {
  if (!tempoVotes.has(sessionId)) {
    tempoVotes.set(sessionId, new Map());
  }
  tempoVotes.get(sessionId)!.set(clientId, {
    preference,
    timestamp: timestamp ?? Date.now(),
  });
}

function getTempoFeedback(
  sessionId: string,
  now?: number,
): { slower: number; perfect: number; faster: number; total: number } {
  const votes = tempoVotes.get(sessionId);
  if (!votes) {
    return { slower: 0, perfect: 0, faster: 0, total: 0 };
  }

  const currentTime = now ?? Date.now();
  let slower = 0;
  let perfect = 0;
  let faster = 0;

  // PRODUCTION BEHAVIOR: Delete expired votes when accessed (index.ts line 345)
  for (const [clientId, vote] of votes.entries()) {
    if (currentTime - vote.timestamp > TEMPO_VOTE_TTL) {
      votes.delete(clientId); // <-- Production behavior: cleanup on access
      continue;
    }
    switch (vote.preference) {
      case "slower":
        slower++;
        break;
      case "perfect":
        perfect++;
        break;
      case "faster":
        faster++;
        break;
    }
  }

  return { slower, perfect, faster, total: slower + perfect + faster };
}

function clearTempoVotes(sessionId: string): void {
  tempoVotes.delete(sessionId);
}

describe("WebSocket Handlers - Tempo Voting", () => {
  beforeEach(() => {
    tempoVotes = new Map();
  });

  test("records a tempo vote", () => {
    recordTempoVote("session-1", "dancer-a", "faster");
    const feedback = getTempoFeedback("session-1");
    expect(feedback.faster).toBe(1);
    expect(feedback.total).toBe(1);
  });

  test("aggregates votes from multiple dancers", () => {
    recordTempoVote("session-1", "dancer-a", "faster");
    recordTempoVote("session-1", "dancer-b", "slower");
    recordTempoVote("session-1", "dancer-c", "perfect");
    recordTempoVote("session-1", "dancer-d", "faster");

    const feedback = getTempoFeedback("session-1");
    expect(feedback.faster).toBe(2);
    expect(feedback.slower).toBe(1);
    expect(feedback.perfect).toBe(1);
    expect(feedback.total).toBe(4);
  });

  test("overwrites previous vote from same client", () => {
    recordTempoVote("session-1", "dancer-a", "faster");
    recordTempoVote("session-1", "dancer-a", "slower");

    const feedback = getTempoFeedback("session-1");
    expect(feedback.faster).toBe(0);
    expect(feedback.slower).toBe(1);
    expect(feedback.total).toBe(1);
  });

  test("expired votes are not counted", () => {
    const now = Date.now();
    const expired = now - TEMPO_VOTE_TTL - 1000;

    recordTempoVote("session-1", "dancer-a", "faster", expired);
    recordTempoVote("session-1", "dancer-b", "slower", now);

    const feedback = getTempoFeedback("session-1", now);
    expect(feedback.faster).toBe(0);
    expect(feedback.slower).toBe(1);
    expect(feedback.total).toBe(1);
  });

  test("vote at exact TTL boundary is still valid", () => {
    const now = Date.now();
    const atBoundary = now - TEMPO_VOTE_TTL;

    recordTempoVote("session-1", "dancer-a", "perfect", atBoundary);
    const feedback = getTempoFeedback("session-1", now);
    expect(feedback.perfect).toBe(1);
  });

  test("clears all votes for a session", () => {
    recordTempoVote("session-1", "dancer-a", "faster");
    recordTempoVote("session-1", "dancer-b", "slower");
    clearTempoVotes("session-1");

    const feedback = getTempoFeedback("session-1");
    expect(feedback.total).toBe(0);
  });

  test("sessions have independent vote pools", () => {
    recordTempoVote("session-1", "dancer-a", "faster");
    recordTempoVote("session-2", "dancer-a", "slower");

    expect(getTempoFeedback("session-1").faster).toBe(1);
    expect(getTempoFeedback("session-2").slower).toBe(1);
  });

  test("returns zero for session with no votes", () => {
    const feedback = getTempoFeedback("nonexistent-session");
    expect(feedback).toEqual({ slower: 0, perfect: 0, faster: 0, total: 0 });
  });

  /**
   * TEST: Production behavior - expired votes are cleaned up on access
   *
   * RATIONALE:
   * The production code in index.ts DELETES expired votes when getTempoFeedback
   * is called (line 345). This is a memory optimization.
   *
   * CRITICAL: lib/tempo.ts only SKIPS expired votes but doesn't delete them.
   * This test ensures we maintain production behavior when wiring modules.
   */
  test("cleans up expired votes when accessed (production behavior)", () => {
    const now = Date.now();
    const expired = now - TEMPO_VOTE_TTL - 1000;

    // Add expired vote
    recordTempoVote("session-cleanup", "dancer-expired", "faster", expired);
    // Add fresh vote
    recordTempoVote("session-cleanup", "dancer-fresh", "slower", now);

    // First access should trigger cleanup
    getTempoFeedback("session-cleanup", now);

    // Verify the internal map state - expired should be removed
    // This is production-matching behavior from index.ts line 345
    const sessionVotes = tempoVotes.get("session-cleanup");
    expect(sessionVotes?.has("dancer-expired")).toBe(false);
    expect(sessionVotes?.has("dancer-fresh")).toBe(true);
  });
});

// ============================================================================
// ACK/NACK PROTOCOL TESTS
// ============================================================================

interface AckMessage {
  type: "ACK";
  messageId: string;
  status: "ok";
  timestamp: string;
}

interface NackMessage {
  type: "NACK";
  messageId: string;
  error: string;
  timestamp: string;
}

function sendAck(client: MockWebSocketClient, messageId: string): void {
  if (!messageId) return;
  client.send(
    JSON.stringify({
      type: "ACK",
      messageId,
      status: "ok",
      timestamp: new Date().toISOString(),
    }),
  );
}

function sendNack(client: MockWebSocketClient, messageId: string, error: string): void {
  if (!messageId) return;
  client.send(
    JSON.stringify({
      type: "NACK",
      messageId,
      error,
      timestamp: new Date().toISOString(),
    }),
  );
}

describe("WebSocket Handlers - ACK/NACK Protocol", () => {
  test("sends correctly formatted ACK", () => {
    const client = createMockClient("dj-1");
    sendAck(client, "msg-123");

    const response = getLastSentMessage(client) as AckMessage;
    expect(response.type).toBe("ACK");
    expect(response.messageId).toBe("msg-123");
    expect(response.status).toBe("ok");
    expect(response.timestamp).toBeDefined();
  });

  test("sends NACK with error message", () => {
    const client = createMockClient("dj-1");
    sendNack(client, "msg-456", "Session not found");

    const response = getLastSentMessage(client) as NackMessage;
    expect(response.type).toBe("NACK");
    expect(response.messageId).toBe("msg-456");
    expect(response.error).toBe("Session not found");
  });

  test("does not send ACK for empty messageId", () => {
    const client = createMockClient("dj-1");
    sendAck(client, "");
    expect(client.sentMessages).toHaveLength(0);
  });

  test("ACK timestamp is valid ISO date", () => {
    const client = createMockClient("dj-1");
    sendAck(client, "msg-789");

    const response = getLastSentMessage(client) as AckMessage;
    const parsed = new Date(response.timestamp);
    expect(parsed.toISOString()).toBe(response.timestamp);
  });
});

// ============================================================================
// SESSION OWNERSHIP TESTS
// ============================================================================

interface ActiveSession {
  sessionId: string;
  djName: string;
  djUserId?: number;
}

let activeSessions: Map<string, ActiveSession>;
let djSessionOwnership: Map<string, string>;

function registerSession(connectionId: string, sessionId: string, djName: string): void {
  activeSessions.set(sessionId, { sessionId, djName });
  djSessionOwnership.set(connectionId, sessionId);
}

function verifySessionOwnership(connectionId: string, targetSessionId: string): boolean {
  return djSessionOwnership.get(connectionId) === targetSessionId;
}

function getOwnedSession(connectionId: string): string | undefined {
  return djSessionOwnership.get(connectionId);
}

describe("WebSocket Handlers - Session Ownership", () => {
  beforeEach(() => {
    activeSessions = new Map();
    djSessionOwnership = new Map();
  });

  test("owner can access their session", () => {
    registerSession("conn-1", "session-abc", "DJ Test");
    expect(verifySessionOwnership("conn-1", "session-abc")).toBe(true);
  });

  test("non-owner is rejected", () => {
    registerSession("conn-1", "session-abc", "DJ Test");
    expect(verifySessionOwnership("conn-2", "session-abc")).toBe(false);
  });

  test("connection without session is rejected", () => {
    expect(verifySessionOwnership("conn-unregistered", "any-session")).toBe(false);
  });

  test("owner cannot access other DJs session", () => {
    registerSession("conn-1", "session-dj1", "DJ One");
    registerSession("conn-2", "session-dj2", "DJ Two");
    expect(verifySessionOwnership("conn-1", "session-dj2")).toBe(false);
  });

  test("returns owned session ID", () => {
    registerSession("conn-1", "session-abc", "DJ Test");
    expect(getOwnedSession("conn-1")).toBe("session-abc");
  });
});

// ============================================================================
// LIKE HANDLING TESTS
// ============================================================================

let sessionLikes: Map<string, Map<string, Set<string>>>;

function getTrackKey(track: { artist: string; title: string }): string {
  return `${track.artist}:${track.title}`.toLowerCase();
}

function hasLikedTrack(
  sessionId: string,
  clientId: string,
  track: { artist: string; title: string },
): boolean {
  const trackKey = getTrackKey(track);
  const clientLikes = sessionLikes.get(sessionId)?.get(clientId);
  return clientLikes?.has(trackKey) ?? false;
}

function recordLike(
  sessionId: string,
  clientId: string,
  track: { artist: string; title: string },
): boolean {
  if (!sessionLikes.has(sessionId)) {
    sessionLikes.set(sessionId, new Map());
  }
  const session = sessionLikes.get(sessionId)!;

  if (!session.has(clientId)) {
    session.set(clientId, new Set());
  }
  const clientLikes = session.get(clientId)!;

  const trackKey = getTrackKey(track);
  if (clientLikes.has(trackKey)) {
    return false;
  }

  clientLikes.add(trackKey);
  return true;
}

function clearLikesForSession(sessionId: string): void {
  sessionLikes.delete(sessionId);
}

describe("WebSocket Handlers - Like Handling", () => {
  beforeEach(() => {
    sessionLikes = new Map();
  });

  test("records first like for a track", () => {
    const result = recordLike("session-1", "dancer-a", { artist: "Artist", title: "Song" });
    expect(result).toBe(true);
    expect(hasLikedTrack("session-1", "dancer-a", { artist: "Artist", title: "Song" })).toBe(true);
  });

  test("rejects duplicate like from same client", () => {
    recordLike("session-1", "dancer-a", { artist: "Artist", title: "Song" });
    const result = recordLike("session-1", "dancer-a", { artist: "Artist", title: "Song" });
    expect(result).toBe(false);
  });

  test("different clients can like same track", () => {
    const result1 = recordLike("session-1", "dancer-a", { artist: "Artist", title: "Song" });
    const result2 = recordLike("session-1", "dancer-b", { artist: "Artist", title: "Song" });
    expect(result1).toBe(true);
    expect(result2).toBe(true);
  });

  test("same client can like different tracks", () => {
    const result1 = recordLike("session-1", "dancer-a", { artist: "Artist", title: "Song 1" });
    const result2 = recordLike("session-1", "dancer-a", { artist: "Artist", title: "Song 2" });
    expect(result1).toBe(true);
    expect(result2).toBe(true);
  });

  test("track key is case-insensitive", () => {
    recordLike("session-1", "dancer-a", { artist: "ARTIST", title: "SONG" });
    const result = recordLike("session-1", "dancer-a", { artist: "artist", title: "song" });
    expect(result).toBe(false);
  });

  test("likes are session-scoped", () => {
    recordLike("session-1", "dancer-a", { artist: "Artist", title: "Song" });
    const result = recordLike("session-2", "dancer-a", { artist: "Artist", title: "Song" });
    expect(result).toBe(true);
  });

  test("clears likes when session ends", () => {
    recordLike("session-1", "dancer-a", { artist: "Artist", title: "Song" });
    clearLikesForSession("session-1");
    const result = recordLike("session-1", "dancer-a", { artist: "Artist", title: "Song" });
    expect(result).toBe(true);
  });

  test("returns false for unknown session", () => {
    const result = hasLikedTrack("nonexistent", "dancer-a", { artist: "Artist", title: "Song" });
    expect(result).toBe(false);
  });

  test("returns false for unknown client in session", () => {
    recordLike("session-1", "dancer-a", { artist: "Artist", title: "Song" });
    const result = hasLikedTrack("session-1", "dancer-b", { artist: "Artist", title: "Song" });
    expect(result).toBe(false);
  });

  test("handles special characters in track names", () => {
    const track = { artist: "Beyoncé", title: "Crazy In Love (feat. JAY-Z)" };
    const result1 = recordLike("session-1", "dancer-a", track);
    const result2 = recordLike("session-1", "dancer-a", track);
    expect(result1).toBe(true);
    expect(result2).toBe(false);
  });

  test("handles empty artist or title gracefully", () => {
    const emptyArtist = { artist: "", title: "Unknown Track" };
    const emptyTitle = { artist: "Unknown Artist", title: "" };
    expect(() => recordLike("session-1", "dancer-a", emptyArtist)).not.toThrow();
    expect(() => recordLike("session-1", "dancer-b", emptyTitle)).not.toThrow();
  });
});
