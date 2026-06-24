import { beforeEach, describe, expect, it, mock } from "bun:test";
import { LIMITS, MESSAGE_TYPES } from "@pika/shared";
import { handleSendReaction } from "../handlers/dancer";
import type { WSContext } from "../handlers/ws-context";

// biome-ignore lint/suspicious/noExplicitAny: minimal test doubles
const mockWs = { send: mock(() => {}) } as any;
// biome-ignore lint/suspicious/noExplicitAny: minimal test doubles
const mockRawWs = { publish: mock(() => {}), getBufferedAmount: mock(() => 0) } as any;

function reactionCtx(clientId: string | null, messageId = "r"): WSContext {
  return {
    message: {
      type: MESSAGE_TYPES.SEND_REACTION,
      sessionId: "session_reaction_test",
      reaction: "thank_you",
    },
    ws: mockWs,
    rawWs: mockRawWs,
    state: {
      clientId,
      isListener: true,
      subscribedSessionId: "session_reaction_test",
      djSessionId: null,
    },
    messageId,
  } as unknown as WSContext;
}

describe("handleSendReaction — amplification hardening", () => {
  beforeEach(() => {
    mockWs.send.mockClear();
    mockRawWs.publish.mockClear();
  });

  it("rejects reactions without a clientId (closes the rate-limit bypass)", () => {
    handleSendReaction(reactionCtx(null));
    expect(mockRawWs.publish).not.toHaveBeenCalled();
    const sent = JSON.parse(mockWs.send.mock.lastCall[0]);
    expect(sent.type).toBe("NACK");
    expect(sent.error).toContain("Client ID");
  });

  it("broadcasts up to the limit, then rate-limits further reactions", () => {
    const clientId = `client_reaction_${Date.now()}`;
    for (let i = 0; i < LIMITS.REACTION_RATE_LIMIT_MAX; i++) {
      handleSendReaction(reactionCtx(clientId));
    }
    expect(mockRawWs.publish).toHaveBeenCalledTimes(LIMITS.REACTION_RATE_LIMIT_MAX);

    mockWs.send.mockClear();
    mockRawWs.publish.mockClear();

    handleSendReaction(reactionCtx(clientId));
    expect(mockRawWs.publish).not.toHaveBeenCalled();
    const sent = JSON.parse(mockWs.send.mock.lastCall[0]);
    expect(sent.error).toContain("Rate limit");
  });
});
