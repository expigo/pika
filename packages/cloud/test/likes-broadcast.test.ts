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
 */

import { MESSAGE_TYPES } from "@pika/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleRemoveLike, handleSendLike } from "../src/handlers/dancer";
import { DISCOVERY_TOPIC, getSessionTopic } from "../src/lib/topics";

// Mock internal libs
vi.mock("../src/lib/likes", () => ({
  hasLikedTrack: vi.fn(() => false),
  recordLike: vi.fn(),
  removeLike: vi.fn(),
}));

vi.mock("../src/lib/persistence/tracks", () => ({
  persistLike: vi.fn(async () => {}),
  deletePersistedLike: vi.fn(async () => {}),
}));

vi.mock("../src/lib/sessions", () => ({
  getSessionIds: vi.fn(() => ["session-123"]),
  hasSession: vi.fn(() => true),
}));

describe("Cloud Likes Broadcast", () => {
  let mockCtx: any;
  let publishSpy: any;
  let sendSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    publishSpy = vi.fn();
    sendSpy = vi.fn();

    mockCtx = {
      message: {
        type: MESSAGE_TYPES.SEND_LIKE,
        payload: {
          track: { artist: "Artist", title: "Song" },
        },
        sessionId: "session-123",
      },
      ws: {
        send: sendSpy,
      },
      rawWs: {
        publish: publishSpy,
        getBufferedAmount: () => 0, // No backpressure
      },
      state: {
        clientId: "client-abc",
        isListener: true,
      },
      messageId: "msg-001",
    };
  });

  it("should broadcast LIKE_RECEIVED to the session topic (with sessionId)", async () => {
    await handleSendLike(mockCtx);

    expect(publishSpy).toHaveBeenCalledWith(
      getSessionTopic("session-123"),
      expect.stringContaining('"type":"LIKE_RECEIVED"'),
    );
    expect(publishSpy).toHaveBeenCalledWith(
      getSessionTopic("session-123"),
      expect.stringContaining('"sessionId":"session-123"'),
    );
    expect(publishSpy).toHaveBeenCalledWith(
      getSessionTopic("session-123"),
      expect.stringContaining('"title":"Song"'),
    );

    // Regression guard: must NOT leak onto the global discovery topic
    expect(publishSpy).not.toHaveBeenCalledWith(DISCOVERY_TOPIC, expect.anything());

    // Verify ACK sent to sender
    expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('"type":"ACK"'));
  });

  it("should broadcast LIKE_REMOVED to the session topic (with sessionId)", async () => {
    mockCtx.message.type = MESSAGE_TYPES.REMOVE_LIKE;

    await handleRemoveLike(mockCtx);

    expect(publishSpy).toHaveBeenCalledWith(
      getSessionTopic("session-123"),
      expect.stringContaining(`"type":"${MESSAGE_TYPES.LIKE_REMOVED}"`),
    );
    expect(publishSpy).toHaveBeenCalledWith(
      getSessionTopic("session-123"),
      expect.stringContaining('"sessionId":"session-123"'),
    );
    expect(publishSpy).toHaveBeenCalledWith(
      getSessionTopic("session-123"),
      expect.stringContaining('"title":"Song"'),
    );

    // Regression guard: must NOT leak onto the global discovery topic
    expect(publishSpy).not.toHaveBeenCalledWith(DISCOVERY_TOPIC, expect.anything());

    // Verify ACK sent to sender
    expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining('"type":"ACK"'));
  });
});
