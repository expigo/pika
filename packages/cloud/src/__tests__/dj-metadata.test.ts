import { beforeEach, describe, expect, it, mock } from "bun:test";
import { handleBroadcastMetadata } from "../handlers/dj";
import type { WSContext } from "../handlers/ws-context";
import { deleteSession, getAllSessions, getSession, setSession } from "../lib/sessions";

// Mock WebSocket
const mockWs = {
  send: mock(() => {}),
} as any;

const mockRawWs = {
  publish: mock(() => {}),
  getBufferedAmount: mock(() => 0),
} as any;

describe("handleBroadcastMetadata (Issue 49)", () => {
  beforeEach(() => {
    // Clear sessions via public API
    getAllSessions().forEach((s) => deleteSession(s.sessionId));
    mockWs.send.mockClear();
    mockRawWs.publish.mockClear();
  });

  it("updates session track metadata and broadcasts update", async () => {
    const sessionId = "session_1";
    const initialTrack = { title: "Foo", artist: "Bar" };
    const updatedTrack = { title: "Foo", artist: "Bar", bpm: 128, key: "Am" };

    // Setup session
    setSession(sessionId, {
      sessionId,
      djName: "Test DJ",
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      currentTrack: initialTrack,
    });

    // Mock authorized context
    const ctx: WSContext = {
      message: {
        type: "METADATA_UPDATED",
        sessionId,
        track: updatedTrack,
      },
      ws: mockWs,
      rawWs: mockRawWs,
      state: {
        clientId: "dj_client",
        isListener: false,
        subscribedSessionId: null,
        djSessionId: sessionId,
      },
      messageId: "msg_123",
    };

    // Execute
    await handleBroadcastMetadata(ctx);

    // Verify session state updated
    const session = getSession(sessionId);
    expect(session?.currentTrack?.bpm).toBe(128);
    expect(session?.currentTrack?.key).toBe("Am");

    // Verify broadcast sent
    expect(mockRawWs.publish).toHaveBeenCalled();
    const broadcastData = JSON.parse(mockRawWs.publish.mock.lastCall[1]);
    expect(broadcastData).toEqual({
      type: "METADATA_UPDATED",
      sessionId,
      track: updatedTrack,
    });
  });

  it("ignores update if track title/artist mismatch (Race Condition)", async () => {
    const sessionId = "session_race";
    const currentTrack = { title: "New Song", artist: "New Artist" };
    const staleUpdate = { title: "Old Song", artist: "Old Artist", bpm: 120 };

    // Setup session with NEW song
    setSession(sessionId, {
      sessionId,
      djName: "Test DJ",
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      currentTrack: currentTrack,
    });

    // Mock authorized context sending STALE update
    const ctx: WSContext = {
      message: {
        type: "METADATA_UPDATED",
        sessionId,
        track: staleUpdate,
      },
      ws: mockWs,
      rawWs: mockRawWs,
      state: {
        clientId: "dj_client",
        isListener: false,
        subscribedSessionId: null,
        djSessionId: sessionId,
      },
      messageId: "msg_race",
    };

    // Execute
    await handleBroadcastMetadata(ctx);

    // Verify session state UNCHANGED
    const session = getSession(sessionId);
    expect(session?.currentTrack?.title).toBe("New Song");
    expect(session?.currentTrack?.bpm).toBeUndefined();

    // Verify NO broadcast
    expect(mockRawWs.publish).not.toHaveBeenCalled();
  });

  it("ignores update if no track is playing (Ghost Track)", async () => {
    const sessionId = "session_ghost";

    // Setup session with NO current track
    setSession(sessionId, {
      sessionId,
      djName: "Test DJ",
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
      // currentTrack is undefined
    });

    const ctx: WSContext = {
      message: {
        type: "METADATA_UPDATED",
        sessionId,
        track: { title: "Ghost Song", artist: "Ghost Artist", bpm: 120 },
      },
      ws: mockWs,
      rawWs: mockRawWs,
      state: {
        clientId: "dj_client",
        isListener: false,
        subscribedSessionId: null,
        djSessionId: sessionId,
      },
      messageId: "msg_ghost",
    };

    await handleBroadcastMetadata(ctx);

    // Verify NO broadcast
    expect(mockRawWs.publish).not.toHaveBeenCalled();
    // Verify ACK sent (as per fix)
    expect(mockWs.send).toHaveBeenCalled();
  });
});
