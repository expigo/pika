/**
 * Cloud Likes Broadcast Test
 *
 * @file likes-broadcast.test.ts
 * @package @pika/cloud
 *
 * PURPOSE:
 * Verifies that the server correctly broadcasts LIKE_RECEIVED and LIKE_REMOVED
 * messages to the per-session topic (session:{id}) — NOT the global discovery
 * topic — and that each broadcast carries its sessionId.
 *
 * Uses bun:test with REAL in-memory state (setSession + clearAllLikes). It used
 * to vi.mock lib/sessions / lib/likes, but under the bun runner vi.mock leaks
 * globally and merge-overrides those exports for every later test file (it made
 * getSessionIds() always return ["session-123"] and hasLikedTrack() always false,
 * breaking the dancer-handlers suite). Real state keeps this file hermetic.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { MESSAGE_TYPES } from "@pika/shared";
import { handleRemoveLike, handleSendLike } from "../src/handlers/dancer";
import { clearAllLikes } from "../src/lib/likes";
import { deleteSession, getAllSessions, setSession } from "../src/lib/sessions";
import { DISCOVERY_TOPIC, getSessionTopic } from "../src/lib/topics";

const SID = "session-123";

function clearSessions() {
  for (const s of getAllSessions()) deleteSession(s.sessionId);
}

// biome-ignore lint/suspicious/noExplicitAny: minimal WS test double
function makeCtx(type: string, publishSpy: any, sendSpy: any) {
  return {
    message: {
      type,
      payload: { track: { artist: "Artist", title: "Song" } },
      sessionId: SID,
    },
    ws: { send: sendSpy },
    rawWs: { publish: publishSpy, getBufferedAmount: () => 0 },
    state: {
      clientId: "client-abc",
      isListener: true,
      subscribedSessionId: SID,
      djSessionId: null,
    },
    messageId: "msg-001",
    // biome-ignore lint/suspicious/noExplicitAny: minimal WSContext double
  } as any;
}

describe("Cloud Likes Broadcast", () => {
  beforeEach(() => {
    clearSessions();
    clearAllLikes();
    setSession(SID, {
      sessionId: SID,
      djName: "DJ",
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    });
  });

  afterEach(() => {
    clearSessions();
    clearAllLikes();
  });

  it("should broadcast LIKE_RECEIVED to the session topic (with sessionId)", async () => {
    const publishSpy = mock(() => {});
    const sendSpy = mock(() => {});

    await handleSendLike(makeCtx(MESSAGE_TYPES.SEND_LIKE, publishSpy, sendSpy));

    expect(publishSpy).toHaveBeenCalledWith(
      getSessionTopic(SID),
      expect.stringContaining('"type":"LIKE_RECEIVED"'),
    );
    expect(publishSpy).toHaveBeenCalledWith(
      getSessionTopic(SID),
      expect.stringContaining('"sessionId":"session-123"'),
    );
    expect(publishSpy).toHaveBeenCalledWith(
      getSessionTopic(SID),
      expect.stringContaining('"title":"Song"'),
    );

    // Regression guard: must NOT leak onto the global discovery topic
    expect(publishSpy).not.toHaveBeenCalledWith(DISCOVERY_TOPIC, expect.anything());

    // Verify ACK sent to sender
    expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('"type":"ACK"'));
  });

  it("should broadcast LIKE_REMOVED to the session topic (with sessionId)", async () => {
    const publishSpy = mock(() => {});
    const sendSpy = mock(() => {});

    await handleRemoveLike(makeCtx(MESSAGE_TYPES.REMOVE_LIKE, publishSpy, sendSpy));

    expect(publishSpy).toHaveBeenCalledWith(
      getSessionTopic(SID),
      expect.stringContaining(`"type":"${MESSAGE_TYPES.LIKE_REMOVED}"`),
    );
    expect(publishSpy).toHaveBeenCalledWith(
      getSessionTopic(SID),
      expect.stringContaining('"sessionId":"session-123"'),
    );
    expect(publishSpy).toHaveBeenCalledWith(
      getSessionTopic(SID),
      expect.stringContaining('"title":"Song"'),
    );

    // Regression guard: must NOT leak onto the global discovery topic
    expect(publishSpy).not.toHaveBeenCalledWith(DISCOVERY_TOPIC, expect.anything());

    // Verify ACK sent to sender
    expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('"type":"ACK"'));
  });
});
