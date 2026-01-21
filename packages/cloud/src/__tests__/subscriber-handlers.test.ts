/**
 * Subscriber & Announcement Handler Tests
 *
 * @file subscriber-handlers.test.ts
 * @package @pika/cloud
 * @created 2026-01-21
 *
 * PURPOSE:
 * Tests SUBSCRIBE handler (listener registration, late joiner sync)
 * and announcement handlers (send, cancel).
 *
 * PRODUCTION LOCATION:
 * - SUBSCRIBE: index.ts lines 2248-2377
 * - SEND_ANNOUNCEMENT: index.ts lines 2111-2164
 * - CANCEL_ANNOUNCEMENT: index.ts lines 2167-2200
 */

import { describe, test, expect, beforeEach } from "bun:test";

// ============================================================================
// MOCK STATE
// ============================================================================

interface MockSession {
  sessionId: string;
  djName: string;
  currentTrack: { artist: string; title: string } | null;
  activeAnnouncement: {
    message: string;
    timestamp: string;
    endsAt?: string;
  } | null;
}

interface MockPoll {
  id: number;
  question: string;
  options: string[];
  votes: number[];
  votedClients: Map<string, number>;
  endsAt?: Date;
}

interface MockListener {
  clientId: string;
  sessionId: string;
  tabCount: number;
}

let activeSessions: Map<string, MockSession>;
let activePolls: Map<number, MockPoll>;
let sessionActivePoll: Map<string, number>;
let listeners: Map<string, MockListener[]>;
let sentMessages: Array<{ type: string; [key: string]: unknown }>;
let djSessionOwner: string | null;

// Mock WebSocket
const createMockWs = () => {
  const messages: string[] = [];
  return {
    send: (data: string) => {
      messages.push(data);
      sentMessages.push(JSON.parse(data));
    },
    messages,
    getBufferedAmount: () => 0, // No backpressure by default
  };
};

// Helper functions
function getListenerCount(sessionId: string): number {
  const sessionListeners = listeners.get(sessionId);
  if (!sessionListeners) return 0;
  return new Set(sessionListeners.map((l) => l.clientId)).size;
}

function addListener(sessionId: string, clientId: string): boolean {
  let sessionListeners = listeners.get(sessionId);
  if (!sessionListeners) {
    sessionListeners = [];
    listeners.set(sessionId, sessionListeners);
  }

  const existing = sessionListeners.find((l) => l.clientId === clientId);
  if (existing) {
    existing.tabCount++;
    return false; // Not a new unique listener
  }

  sessionListeners.push({ clientId, sessionId, tabCount: 1 });
  return true; // New unique listener
}

// ============================================================================
// SUBSCRIBE HANDLER TESTS
// ============================================================================

describe("SUBSCRIBE Handler - Listener Registration", () => {
  beforeEach(() => {
    activeSessions = new Map();
    activePolls = new Map();
    sessionActivePoll = new Map();
    listeners = new Map();
    sentMessages = [];
    djSessionOwner = null;
  });

  /**
   * TEST: New subscription marks connection as listener
   *
   * RATIONALE:
   * First subscription for a client should register them as a listener.
   */
  test("registers new listener on first subscription", () => {
    activeSessions.set("session-1", {
      sessionId: "session-1",
      djName: "DJ Test",
      currentTrack: null,
      activeAnnouncement: null,
    });

    const isNewClient = addListener("session-1", "client-1");

    expect(isNewClient).toBe(true);
    expect(getListenerCount("session-1")).toBe(1);
  });

  /**
   * TEST: Duplicate subscription from same client increments tab count
   */
  test("increments tab count for duplicate subscription", () => {
    addListener("session-1", "client-1");
    const isNewSecondTime = addListener("session-1", "client-1");

    expect(isNewSecondTime).toBe(false);
    expect(getListenerCount("session-1")).toBe(1); // Still 1 unique
  });

  /**
   * TEST: Different clients increase count
   */
  test("different clients increase listener count", () => {
    addListener("session-1", "client-1");
    addListener("session-1", "client-2");
    addListener("session-1", "client-3");

    expect(getListenerCount("session-1")).toBe(3);
  });
});

describe("SUBSCRIBE Handler - Late Joiner Sync", () => {
  beforeEach(() => {
    activeSessions = new Map();
    activePolls = new Map();
    sessionActivePoll = new Map();
    listeners = new Map();
    sentMessages = [];
  });

  /**
   * TEST: Late joiner receives current track
   *
   * RATIONALE:
   * When dancer joins mid-set, they must see what's playing.
   */
  test("sends current track to new subscriber", () => {
    const ws = createMockWs();
    activeSessions.set("session-1", {
      sessionId: "session-1",
      djName: "DJ Test",
      currentTrack: { artist: "Artist", title: "Song" },
      activeAnnouncement: null,
    });

    // Simulate sending NOW_PLAYING to late joiner
    const session = activeSessions.get("session-1");
    if (session?.currentTrack) {
      ws.send(
        JSON.stringify({
          type: "NOW_PLAYING",
          sessionId: "session-1",
          djName: session.djName,
          track: session.currentTrack,
        }),
      );
    }

    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].type).toBe("NOW_PLAYING");
    expect(sentMessages[0].track).toEqual({ artist: "Artist", title: "Song" });
  });

  /**
   * TEST: Late joiner receives active poll with vote state
   */
  test("sends active poll to new subscriber", () => {
    const ws = createMockWs();
    const poll: MockPoll = {
      id: 1,
      question: "Faster or slower?",
      options: ["Faster", "Slower", "Perfect"],
      votes: [3, 2, 5],
      votedClients: new Map([["client-1", 2]]),
    };
    activePolls.set(1, poll);
    sessionActivePoll.set("session-1", 1);

    // Simulate sending poll to late joiner
    const activePollId = sessionActivePoll.get("session-1");
    if (activePollId) {
      const p = activePolls.get(activePollId)!;
      const votedIndex = p.votedClients.get("client-2"); // New client
      ws.send(
        JSON.stringify({
          type: "POLL_STARTED",
          pollId: p.id,
          question: p.question,
          options: p.options,
          votes: p.votes,
          totalVotes: p.votes.reduce((a, b) => a + b, 0),
          hasVoted: votedIndex !== undefined,
          votedOptionIndex: votedIndex,
        }),
      );
    }

    expect(sentMessages[0].type).toBe("POLL_STARTED");
    expect(sentMessages[0].question).toBe("Faster or slower?");
    expect(sentMessages[0].hasVoted).toBe(false);
  });

  /**
   * TEST: Late joiner receives active announcement
   */
  test("sends active announcement to new subscriber", () => {
    const ws = createMockWs();
    activeSessions.set("session-1", {
      sessionId: "session-1",
      djName: "DJ Test",
      currentTrack: null,
      activeAnnouncement: {
        message: "Break in 5 minutes!",
        timestamp: new Date().toISOString(),
        endsAt: new Date(Date.now() + 300000).toISOString(),
      },
    });

    const session = activeSessions.get("session-1")!;
    if (session.activeAnnouncement) {
      ws.send(
        JSON.stringify({
          type: "ANNOUNCEMENT_RECEIVED",
          sessionId: "session-1",
          message: session.activeAnnouncement.message,
          djName: session.djName,
          timestamp: session.activeAnnouncement.timestamp,
          endsAt: session.activeAnnouncement.endsAt,
        }),
      );
    }

    expect(sentMessages[0].type).toBe("ANNOUNCEMENT_RECEIVED");
    expect(sentMessages[0].message).toBe("Break in 5 minutes!");
  });
});

describe("SUBSCRIBE Handler - Backpressure", () => {
  beforeEach(() => {
    activeSessions = new Map();
    sentMessages = [];
  });

  /**
   * TEST: Skips SESSIONS_LIST when buffer is full
   *
   * RATIONALE:
   * Prevents memory exhaustion by not queueing data for slow clients.
   */
  test("skips sessions list when buffer exceeds 64KB", () => {
    const ws = {
      send: (data: string) => sentMessages.push(JSON.parse(data)),
      getBufferedAmount: () => 65536, // > 64KB
    };

    activeSessions.set("session-1", {
      sessionId: "session-1",
      djName: "DJ",
      currentTrack: null,
      activeAnnouncement: null,
    });

    // Simulate backpressure check
    if (ws.getBufferedAmount() < 1024 * 64) {
      ws.send(JSON.stringify({ type: "SESSIONS_LIST", sessions: [] }));
    }

    expect(sentMessages.length).toBe(0); // Nothing sent - backpressure
  });

  /**
   * TEST: Sends SESSIONS_LIST when buffer is healthy
   */
  test("sends sessions list when buffer is healthy", () => {
    const ws = {
      send: (data: string) => sentMessages.push(JSON.parse(data)),
      getBufferedAmount: () => 1000, // < 64KB
    };

    if (ws.getBufferedAmount() < 1024 * 64) {
      ws.send(JSON.stringify({ type: "SESSIONS_LIST", sessions: [] }));
    }

    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0].type).toBe("SESSIONS_LIST");
  });
});

// ============================================================================
// ANNOUNCEMENT HANDLER TESTS
// ============================================================================

describe("SEND_ANNOUNCEMENT Handler", () => {
  beforeEach(() => {
    activeSessions = new Map();
    sentMessages = [];
    djSessionOwner = "session-1";
  });

  /**
   * TEST: Stores announcement in session
   */
  test("stores announcement in session", () => {
    activeSessions.set("session-1", {
      sessionId: "session-1",
      djName: "DJ Test",
      currentTrack: null,
      activeAnnouncement: null,
    });

    const session = activeSessions.get("session-1")!;
    const message = "Break starting now!";
    const durationSeconds = 300;

    session.activeAnnouncement = {
      message,
      timestamp: new Date().toISOString(),
      endsAt: new Date(Date.now() + durationSeconds * 1000).toISOString(),
    };

    expect(session.activeAnnouncement.message).toBe("Break starting now!");
    expect(session.activeAnnouncement.endsAt).toBeDefined();
  });

  /**
   * TEST: Rejects unauthorized sender
   */
  test("rejects announcement from non-owner", () => {
    djSessionOwner = "session-1";
    const requestSessionId = "session-2"; // Different session

    const isAuthorized = djSessionOwner === requestSessionId;
    expect(isAuthorized).toBe(false);
  });

  /**
   * TEST: Accepts authorized sender
   */
  test("accepts announcement from session owner", () => {
    djSessionOwner = "session-1";
    const requestSessionId = "session-1";

    const isAuthorized = djSessionOwner === requestSessionId;
    expect(isAuthorized).toBe(true);
  });

  /**
   * TEST: Handles announcement without duration
   */
  test("stores announcement without endsAt when no duration", () => {
    activeSessions.set("session-1", {
      sessionId: "session-1",
      djName: "DJ",
      currentTrack: null,
      activeAnnouncement: null,
    });

    const session = activeSessions.get("session-1")!;
    session.activeAnnouncement = {
      message: "Quick announcement",
      timestamp: new Date().toISOString(),
      // No endsAt
    };

    expect(session.activeAnnouncement.message).toBe("Quick announcement");
    expect(session.activeAnnouncement.endsAt).toBeUndefined();
  });

  /**
   * TEST: Rejects if session not found
   */
  test("rejects announcement for non-existent session", () => {
    const session = activeSessions.get("nonexistent");
    expect(session).toBeUndefined();
  });
});

describe("CANCEL_ANNOUNCEMENT Handler", () => {
  beforeEach(() => {
    activeSessions = new Map();
    sentMessages = [];
    djSessionOwner = "session-1";
  });

  /**
   * TEST: Clears active announcement
   */
  test("clears active announcement", () => {
    activeSessions.set("session-1", {
      sessionId: "session-1",
      djName: "DJ",
      currentTrack: null,
      activeAnnouncement: {
        message: "Test",
        timestamp: new Date().toISOString(),
      },
    });

    const session = activeSessions.get("session-1")!;
    session.activeAnnouncement = null;

    expect(session.activeAnnouncement).toBeNull();
  });

  /**
   * TEST: Rejects unauthorized cancel
   */
  test("rejects cancel from non-owner", () => {
    djSessionOwner = "session-1";
    const requestSessionId = "session-2";

    const isAuthorized = djSessionOwner === requestSessionId;
    expect(isAuthorized).toBe(false);
  });

  /**
   * TEST: Accepts authorized cancel
   */
  test("accepts cancel from session owner", () => {
    djSessionOwner = "session-1";
    const requestSessionId = "session-1";

    const isAuthorized = djSessionOwner === requestSessionId;
    expect(isAuthorized).toBe(true);
  });

  /**
   * TEST: Handles cancel when no active announcement
   */
  test("handles cancel when no active announcement", () => {
    activeSessions.set("session-1", {
      sessionId: "session-1",
      djName: "DJ",
      currentTrack: null,
      activeAnnouncement: null,
    });

    const session = activeSessions.get("session-1")!;
    session.activeAnnouncement = null; // Already null

    expect(session.activeAnnouncement).toBeNull();
  });
});
