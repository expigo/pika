import { beforeEach, describe, expect, it, mock } from "bun:test";
import { handleSubscribe } from "../handlers/subscriber";
import type { WSContext } from "../handlers/ws-context";
import { deleteSession, getAllSessions, setSession } from "../lib/sessions";

// Mock WebSocket
const mockWs = {
  send: mock(() => {}),
  close: mock(() => {}),
  // biome-ignore lint/suspicious/noExplicitAny: mock
} as any;

const mockRawWs = {
  publish: mock(() => {}),
  getBufferedAmount: mock(() => 0),
  // biome-ignore lint/suspicious/noExplicitAny: mock
} as any;

describe("handleSubscribe (Issue 48)", () => {
  beforeEach(() => {
    // Clear sessions via public API
    getAllSessions().forEach((s) => {
      deleteSession(s.sessionId);
    });
    mockWs.send.mockClear();
    mockRawWs.publish.mockClear();
  });

  it("sends SESSION_ENDED if subscriber requests a missing/dead session", () => {
    const deadSessionId = "session_dead";

    // Setup context
    const ctx: WSContext = {
      message: {
        type: "SUBSCRIBE",
        sessionId: deadSessionId,
      },
      ws: mockWs,
      rawWs: mockRawWs,
      state: {
        clientId: "client1",
        isListener: false,
        subscribedSessionId: null,
        djSessionId: null,
      },
      messageId: "msg1",
    };

    // Execute
    handleSubscribe(ctx);

    // Verify
    // Verify
    expect(mockWs.send).toHaveBeenCalled();
    // biome-ignore lint/suspicious/noExplicitAny: mock calls
    const calls = mockWs.send.mock.calls.map((c: any) => JSON.parse(c[0]));
    // biome-ignore lint/suspicious/noExplicitAny: mock calls
    const sessionEndedMsg = calls.find((msg: any) => msg.type === "SESSION_ENDED");

    expect(sessionEndedMsg).toBeDefined();
    expect(sessionEndedMsg).toEqual({
      type: "SESSION_ENDED",
      sessionId: deadSessionId,
    });
  });

  it("sends NOW_PLAYING if subscriber requests an active session", () => {
    const liveSessionId = "session_live";
    const track = { title: "Test", artist: "Artist", bpm: 128 };

    // Create live session
    setSession(liveSessionId, {
      sessionId: liveSessionId,
      djName: "Dj Test",
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      currentTrack: track,
    });

    // Setup context
    const ctx: WSContext = {
      message: {
        type: "SUBSCRIBE",
        sessionId: liveSessionId,
      },
      ws: mockWs,
      rawWs: mockRawWs,
      state: {
        clientId: "client2",
        isListener: false,
        subscribedSessionId: null,
        djSessionId: null,
      },
      messageId: "msg2",
    };

    // Execute
    handleSubscribe(ctx);

    // Verify
    // Should send LISTENER_COUNT then NOW_PLAYING
    // We check specifically for NOW_PLAYING
    // biome-ignore lint/suspicious/noExplicitAny: mock calls
    const calls = mockWs.send.mock.calls.map((c: any) => JSON.parse(c[0]));
    // biome-ignore lint/suspicious/noExplicitAny: mock calls
    const nowPlayingMsg = calls.find((msg: any) => msg.type === "NOW_PLAYING");

    expect(nowPlayingMsg).toBeDefined();
    expect(nowPlayingMsg.sessionId).toBe(liveSessionId);
    expect(nowPlayingMsg.track).toEqual(track);
  });
});
