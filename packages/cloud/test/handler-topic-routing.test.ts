/**
 * Handler → Topic Routing Coverage
 *
 * @file handler-topic-routing.test.ts
 * @package @pika/cloud
 *
 * PURPOSE:
 * Exhaustively verifies that EVERY real handler publishes on the correct Bun
 * pub/sub topic after the per-session-topic migration:
 *   - High-frequency, session-scoped events  → `session:{id}`  (never discovery)
 *   - Lifecycle / discovery events           → `live-session`  (the lobby)
 *   - The DJ (REGISTER) and dancers (SUBSCRIBE) join the right per-session topic;
 *     ending a session unsubscribes the connection from its topic.
 *
 * These call the ACTUAL handlers (unlike poll-handlers/websocket-handlers tests,
 * which exercise reimplemented mock logic). Likes are covered separately in
 * likes-broadcast.test.ts; the Bun delivery guarantees in topic-isolation.test.ts.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// Poll DB persistence requires a real database; stub it so the in-memory poll
// routing logic can be exercised hermetically. File-scoped to this test only.
mock.module("../src/lib/persistence/polls", () => ({
  createPollInDb: async () => 777,
  closePollInDb: async () => {},
  recordPollVoteInDb: async () => {},
}));

import {
  handleSendBulkLike,
  handleSendReaction,
  handleSendTempoRequest,
} from "../src/handlers/dancer";
import {
  handleBroadcastMetadata,
  handleBroadcastTrack,
  handleCancelAnnouncement,
  handleEndSession,
  handleSendAnnouncement,
  handleSyncSessionHistory,
  handleTrackStopped,
} from "../src/handlers/dj";
import {
  handleCancelPoll,
  handleEndPoll,
  handleStartPoll,
  handleVoteOnPoll,
} from "../src/handlers/poll";
import { handleSubscribe } from "../src/handlers/subscriber";
import { clearAllPolls, createPoll } from "../src/lib/polls";
import type { TrackInfo } from "../src/lib/sessions";
import { deleteSession, getAllSessions, setSession } from "../src/lib/sessions";
import { DISCOVERY_TOPIC, getSessionTopic } from "../src/lib/topics";

type AnyMock = any;

const mockWs: AnyMock = { send: mock(() => {}), close: mock(() => {}) };

function makeRawWs(): AnyMock {
  return {
    publish: mock(() => {}),
    subscribe: mock(() => {}),
    unsubscribe: mock(() => {}),
    getBufferedAmount: mock(() => 0),
  };
}

function live(sessionId: string, currentTrack?: TrackInfo) {
  setSession(sessionId, {
    sessionId,
    djName: "DJ",
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    ...(currentTrack ? { currentTrack } : {}),
  });
}

// Builds a context for a DJ-owned message (auth: djSessionId === sessionId).
function djCtx(rawWs: AnyMock, message: Record<string, unknown>, sessionId: string): AnyMock {
  return {
    message,
    ws: mockWs,
    rawWs,
    state: { clientId: "dj", isListener: false, subscribedSessionId: null, djSessionId: sessionId },
    messageId: (message.messageId as string) ?? undefined,
  };
}

// Builds a context for a dancer message.
function dancerCtx(
  rawWs: AnyMock,
  message: Record<string, unknown>,
  clientId = "dancer-1",
): AnyMock {
  return {
    message,
    ws: mockWs,
    rawWs,
    state: { clientId, isListener: false, subscribedSessionId: null, djSessionId: null },
    messageId: (message.messageId as string) ?? undefined,
  };
}

/** Assert a message of `type` was published to the session topic and never to discovery. */
function expectSessionTopic(rawWs: AnyMock, sessionId: string, type: string) {
  expect(rawWs.publish).toHaveBeenCalledWith(
    getSessionTopic(sessionId),
    expect.stringContaining(`"type":"${type}"`),
  );
  expect(rawWs.publish).not.toHaveBeenCalledWith(
    DISCOVERY_TOPIC,
    expect.stringContaining(`"type":"${type}"`),
  );
}

beforeEach(() => {
  for (const s of getAllSessions()) {
    deleteSession(s.sessionId);
  }
  clearAllPolls();
});

afterEach(() => {
  mock.clearAllMocks();
});

// ============================================================================
// DJ handlers → session topic
// ============================================================================

describe("DJ broadcasts route to the session topic", () => {
  it("NOW_PLAYING (BROADCAST_TRACK)", async () => {
    const sessionId = "session_np";
    live(sessionId);
    const rawWs = makeRawWs();
    await handleBroadcastTrack(
      djCtx(
        rawWs,
        { type: "BROADCAST_TRACK", sessionId, track: { artist: "A", title: "T" }, messageId: "n1" },
        sessionId,
      ),
    );
    expectSessionTopic(rawWs, sessionId, "NOW_PLAYING");
  });

  it("TEMPO_RESET fires on track change (BROADCAST_TRACK over a prior track)", async () => {
    const sessionId = "session_reset";
    live(sessionId, { artist: "Old", title: "Song1" });
    const rawWs = makeRawWs();
    await handleBroadcastTrack(
      djCtx(
        rawWs,
        {
          type: "BROADCAST_TRACK",
          sessionId,
          track: { artist: "New", title: "Song2" },
          messageId: "n2",
        },
        sessionId,
      ),
    );
    expectSessionTopic(rawWs, sessionId, "TEMPO_RESET");
  });

  it("METADATA_UPDATED", async () => {
    const sessionId = "session_meta";
    live(sessionId, { artist: "A", title: "T" });
    const rawWs = makeRawWs();
    await handleBroadcastMetadata(
      djCtx(
        rawWs,
        { type: "METADATA_UPDATED", sessionId, track: { artist: "A", title: "T", bpm: 120 } },
        sessionId,
      ),
    );
    expectSessionTopic(rawWs, sessionId, "METADATA_UPDATED");
  });

  it("TRACK_STOPPED", () => {
    const sessionId = "session_stop";
    live(sessionId, { artist: "A", title: "T" });
    const rawWs = makeRawWs();
    handleTrackStopped(djCtx(rawWs, { type: "TRACK_STOPPED", sessionId }, sessionId));
    expectSessionTopic(rawWs, sessionId, "TRACK_STOPPED");
  });

  it("ANNOUNCEMENT_RECEIVED", () => {
    const sessionId = "session_ann";
    live(sessionId);
    const rawWs = makeRawWs();
    handleSendAnnouncement(
      djCtx(rawWs, { type: "SEND_ANNOUNCEMENT", sessionId, message: "Hello floor" }, sessionId),
    );
    expectSessionTopic(rawWs, sessionId, "ANNOUNCEMENT_RECEIVED");
  });

  it("ANNOUNCEMENT_CANCELLED", () => {
    const sessionId = "session_anncancel";
    live(sessionId);
    const rawWs = makeRawWs();
    handleCancelAnnouncement(djCtx(rawWs, { type: "CANCEL_ANNOUNCEMENT", sessionId }, sessionId));
    expectSessionTopic(rawWs, sessionId, "ANNOUNCEMENT_CANCELLED");
  });

  it("HISTORY_SYNCED", async () => {
    const sessionId = "session_history_1"; // schema requires >= 8 chars
    live(sessionId);
    const rawWs = makeRawWs();
    await handleSyncSessionHistory(
      djCtx(rawWs, { type: "SYNC_SESSION_HISTORY", sessionId, tracks: [] }, sessionId),
    );
    expectSessionTopic(rawWs, sessionId, "HISTORY_SYNCED");
  });
});

// ============================================================================
// Dancer handlers → session topic
// ============================================================================

describe("Dancer broadcasts route to the session topic", () => {
  it("REACTION_RECEIVED", () => {
    const sessionId = "session_react";
    live(sessionId);
    const rawWs = makeRawWs();
    handleSendReaction(
      dancerCtx(rawWs, { type: "SEND_REACTION", sessionId, reaction: "thank_you" }),
    );
    expectSessionTopic(rawWs, sessionId, "REACTION_RECEIVED");
  });

  it("TEMPO_FEEDBACK", () => {
    const sessionId = "session_tempo";
    live(sessionId);
    const rawWs = makeRawWs();
    handleSendTempoRequest(
      dancerCtx(rawWs, { type: "SEND_TEMPO_REQUEST", sessionId, preference: "faster" }),
    );
    expectSessionTopic(rawWs, sessionId, "TEMPO_FEEDBACK");
  });

  it("LIKE_RECEIVED (bulk)", async () => {
    const sessionId = "session_bulk";
    live(sessionId);
    const rawWs = makeRawWs();
    await handleSendBulkLike(
      dancerCtx(rawWs, {
        type: "SEND_BULK_LIKE",
        sessionId,
        payload: { tracks: [{ artist: "A", title: "T" }] },
      }),
    );
    expectSessionTopic(rawWs, sessionId, "LIKE_RECEIVED");
  });
});

// ============================================================================
// Poll handlers → session topic (+ sessionId on POLL_ENDED)
// ============================================================================

describe("Poll broadcasts route to the session topic", () => {
  it("POLL_STARTED", async () => {
    const sessionId = "session_pollstart";
    live(sessionId);
    const rawWs = makeRawWs();
    await handleStartPoll(
      djCtx(
        rawWs,
        { type: "START_POLL", sessionId, question: "Genre?", options: ["WCS", "Blues"] },
        sessionId,
      ),
    );
    expectSessionTopic(rawWs, sessionId, "POLL_STARTED");
  });

  it("POLL_ENDED (manual) carries sessionId", async () => {
    const sessionId = "session_pollend";
    live(sessionId);
    const poll = createPoll(sessionId, "Q", ["A", "B"]);
    const rawWs = makeRawWs();
    await handleEndPoll(djCtx(rawWs, { type: "END_POLL", pollId: poll.id }, sessionId));
    expectSessionTopic(rawWs, sessionId, "POLL_ENDED");
    expect(rawWs.publish).toHaveBeenCalledWith(
      getSessionTopic(sessionId),
      expect.stringContaining(`"sessionId":"${sessionId}"`),
    );
  });

  it("POLL_ENDED (cancel)", async () => {
    const sessionId = "session_pollcancel";
    live(sessionId);
    const poll = createPoll(sessionId, "Q", ["A", "B"]);
    const rawWs = makeRawWs();
    await handleCancelPoll(djCtx(rawWs, { type: "CANCEL_POLL", pollId: poll.id }, sessionId));
    expectSessionTopic(rawWs, sessionId, "POLL_ENDED");
  });

  it("POLL_UPDATE (vote)", async () => {
    const sessionId = "session_pollvote";
    live(sessionId);
    const poll = createPoll(sessionId, "Q", ["A", "B"]);
    const rawWs = makeRawWs();
    await handleVoteOnPoll(
      dancerCtx(rawWs, {
        type: "VOTE_ON_POLL",
        pollId: poll.id,
        optionIndex: 0,
        clientId: "dancer-1",
      }),
    );
    expectSessionTopic(rawWs, sessionId, "POLL_UPDATE");
  });
});

// ============================================================================
// Lifecycle / subscription
// ============================================================================

describe("Lifecycle & subscription routing", () => {
  it("SESSION_ENDED goes to the DISCOVERY topic and the DJ leaves its session topic", () => {
    const sessionId = "session_end";
    live(sessionId);
    const rawWs = makeRawWs();
    handleEndSession(djCtx(rawWs, { type: "END_SESSION", sessionId }, sessionId));

    expect(rawWs.publish).toHaveBeenCalledWith(
      DISCOVERY_TOPIC,
      expect.stringContaining('"type":"SESSION_ENDED"'),
    );
    expect(rawWs.publish).not.toHaveBeenCalledWith(
      getSessionTopic(sessionId),
      expect.stringContaining('"type":"SESSION_ENDED"'),
    );
    expect(rawWs.unsubscribe).toHaveBeenCalledWith(getSessionTopic(sessionId));
  });

  it("SUBSCRIBE broadcasts LISTENER_COUNT to the session topic", () => {
    const sessionId = "session_listeners";
    live(sessionId);
    const rawWs = makeRawWs();
    handleSubscribe(dancerCtx(rawWs, { type: "SUBSCRIBE", sessionId, clientId: "dancer-1" }));
    expectSessionTopic(rawWs, sessionId, "LISTENER_COUNT");
  });
});

// ============================================================================
// Regression: unanalyzed track (null/out-of-range metrics) must NOT be dropped
// (the desktop "session goes offline / ACK timeout" bug)
// ============================================================================

describe("BROADCAST_TRACK with null/out-of-range metrics is accepted and ACKed", () => {
  it("broadcasts NOW_PLAYING and ACKs a track with null fingerprint + null bpm/key", async () => {
    const sessionId = "session_nullmetrics";
    live(sessionId);
    const rawWs = makeRawWs();
    await handleBroadcastTrack(
      djCtx(
        rawWs,
        {
          type: "BROADCAST_TRACK",
          sessionId,
          messageId: "nm1",
          track: {
            artist: "A",
            title: "T",
            bpm: null,
            key: null,
            energy: null,
            danceability: null,
            brightness: null,
            acousticness: null,
            groove: null,
          },
        },
        sessionId,
      ),
    );

    // Not silently dropped: it reached the session topic …
    expectSessionTopic(rawWs, sessionId, "NOW_PLAYING");
    // … and the reliable send was acknowledged (no ACK timeout on the client).
    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"ACK"'));
    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"messageId":"nm1"'));
  });
});
