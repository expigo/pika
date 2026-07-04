/**
 * Dancer handler behavior — like / tempo / bulk-like.
 *
 * Covers the happy paths, input guards, and the per-client rate limits added in
 * the amplification-hardening pass. Pure unit (no DB): persist* short-circuits on
 * NODE_ENV==="test", broadcasts go to a mock socket. Module-global limiters are
 * isolated per test via a unique clientId.
 */
import { beforeEach, describe, expect, it, mock } from "bun:test";
import { LIMITS, MESSAGE_TYPES } from "@pika/shared";
import { handleSendBulkLike, handleSendLike, handleSendTempoRequest } from "../handlers/dancer";
import type { WSContext } from "../handlers/ws-context";
import { clearAllLikes } from "../lib/likes";
import { deleteSession, getAllSessions, setSession } from "../lib/sessions";
import { getSessionTopic } from "../lib/topics";

const mockWs = { send: mock(() => {}) } as any;
const mockRawWs = { publish: mock(() => {}), getBufferedAmount: mock(() => 0) } as any;

let seq = 0;
const uid = (p: string) => `${p}_${Date.now()}_${seq++}`;

function setupSession(sessionId: string) {
  setSession(sessionId, {
    sessionId,
    djName: "DJ",
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  });
}

function makeCtx(message: object, clientId: string | null, messageId = "m"): WSContext {
  return {
    message,
    ws: mockWs,
    rawWs: mockRawWs,
    state: { clientId, isListener: true, subscribedSessionId: null, djSessionId: null },
    messageId,
  } as unknown as WSContext;
}

const lastSend = () => JSON.parse(mockWs.send.mock.lastCall[0]);
const lastPublish = () => JSON.parse(mockRawWs.publish.mock.lastCall[1]);

beforeEach(() => {
  for (const s of getAllSessions()) deleteSession(s.sessionId);
  clearAllLikes();
  mockWs.send.mockClear();
  mockRawWs.publish.mockClear();
});

describe("handleSendLike", () => {
  it("broadcasts LIKE_RECEIVED to the session topic and ACKs", async () => {
    const sid = uid("s");
    setupSession(sid);

    await handleSendLike(
      makeCtx(
        {
          type: MESSAGE_TYPES.SEND_LIKE,
          sessionId: sid,
          payload: { track: { artist: "A", title: "T" } },
        },
        uid("c"),
      ),
    );

    expect(mockRawWs.publish).toHaveBeenCalledTimes(1);
    expect(mockRawWs.publish.mock.lastCall[0]).toBe(getSessionTopic(sid));
    const pub = lastPublish();
    expect(pub.type).toBe("LIKE_RECEIVED");
    expect(pub.sessionId).toBe(sid);
    expect(lastSend().type).toBe("ACK");
  });

  it("rejects a like with no clientId", async () => {
    const sid = uid("s");
    setupSession(sid);

    await handleSendLike(
      makeCtx(
        {
          type: MESSAGE_TYPES.SEND_LIKE,
          sessionId: sid,
          payload: { track: { artist: "A", title: "T" } },
        },
        null,
      ),
    );

    expect(mockRawWs.publish).not.toHaveBeenCalled();
    expect(lastSend().type).toBe("NACK");
    expect(lastSend().error).toContain("Client ID");
  });

  it("rejects a like when there is no active session", async () => {
    await handleSendLike(
      makeCtx(
        { type: MESSAGE_TYPES.SEND_LIKE, payload: { track: { artist: "A", title: "T" } } },
        uid("c"),
      ),
    );

    expect(mockRawWs.publish).not.toHaveBeenCalled();
    expect(lastSend().error).toContain("No active session");
  });

  it("rejects a duplicate like for the same track", async () => {
    const sid = uid("s");
    setupSession(sid);
    const c = uid("c");
    const track = { artist: "A", title: "Dup" };

    await handleSendLike(
      makeCtx({ type: MESSAGE_TYPES.SEND_LIKE, sessionId: sid, payload: { track } }, c),
    );
    mockRawWs.publish.mockClear();
    await handleSendLike(
      makeCtx({ type: MESSAGE_TYPES.SEND_LIKE, sessionId: sid, payload: { track } }, c),
    );

    expect(mockRawWs.publish).not.toHaveBeenCalled();
    expect(lastSend().error).toContain("Already liked");
  });

  it("rate-limits after LIKE_RATE_LIMIT_MAX distinct likes", async () => {
    const sid = uid("s");
    setupSession(sid);
    const c = uid("c");

    for (let i = 0; i < LIMITS.LIKE_RATE_LIMIT_MAX; i++) {
      await handleSendLike(
        makeCtx(
          {
            type: MESSAGE_TYPES.SEND_LIKE,
            sessionId: sid,
            payload: { track: { artist: "A", title: `T${i}` } },
          },
          c,
        ),
      );
    }
    expect(mockRawWs.publish).toHaveBeenCalledTimes(LIMITS.LIKE_RATE_LIMIT_MAX);

    mockWs.send.mockClear();
    mockRawWs.publish.mockClear();
    await handleSendLike(
      makeCtx(
        {
          type: MESSAGE_TYPES.SEND_LIKE,
          sessionId: sid,
          payload: { track: { artist: "A", title: "over" } },
        },
        c,
      ),
    );
    expect(mockRawWs.publish).not.toHaveBeenCalled();
    expect(lastSend().error).toContain("Rate limit");
  });
});

describe("handleSendTempoRequest", () => {
  it("broadcasts TEMPO_FEEDBACK aggregates and ACKs", () => {
    const sid = uid("s");
    setupSession(sid);

    handleSendTempoRequest(
      makeCtx(
        { type: MESSAGE_TYPES.SEND_TEMPO_REQUEST, sessionId: sid, preference: "faster" },
        uid("c"),
      ),
    );

    expect(mockRawWs.publish).toHaveBeenCalledTimes(1);
    const pub = lastPublish();
    expect(pub.type).toBe("TEMPO_FEEDBACK");
    expect(pub.faster).toBe(1);
    expect(pub.total).toBe(1);
    expect(lastSend().type).toBe("ACK");
  });

  it("rejects a tempo vote with no clientId", () => {
    const sid = uid("s");
    setupSession(sid);

    handleSendTempoRequest(
      makeCtx(
        { type: MESSAGE_TYPES.SEND_TEMPO_REQUEST, sessionId: sid, preference: "faster" },
        null,
      ),
    );

    expect(mockRawWs.publish).not.toHaveBeenCalled();
    expect(lastSend().error).toContain("Client ID");
  });

  it("rejects a tempo vote for a non-existent session", () => {
    handleSendTempoRequest(
      makeCtx(
        { type: MESSAGE_TYPES.SEND_TEMPO_REQUEST, sessionId: uid("nope"), preference: "faster" },
        uid("c"),
      ),
    );

    expect(mockRawWs.publish).not.toHaveBeenCalled();
    expect(lastSend().error).toContain("Session not found");
  });

  it("rate-limits after TEMPO_RATE_LIMIT_MAX votes", () => {
    const sid = uid("s");
    setupSession(sid);
    const c = uid("c");

    for (let i = 0; i < LIMITS.TEMPO_RATE_LIMIT_MAX; i++) {
      handleSendTempoRequest(
        makeCtx(
          { type: MESSAGE_TYPES.SEND_TEMPO_REQUEST, sessionId: sid, preference: "faster" },
          c,
        ),
      );
    }
    expect(mockRawWs.publish).toHaveBeenCalledTimes(LIMITS.TEMPO_RATE_LIMIT_MAX);

    mockWs.send.mockClear();
    mockRawWs.publish.mockClear();
    handleSendTempoRequest(
      makeCtx({ type: MESSAGE_TYPES.SEND_TEMPO_REQUEST, sessionId: sid, preference: "faster" }, c),
    );
    expect(mockRawWs.publish).not.toHaveBeenCalled();
    expect(lastSend().error).toContain("Rate limit");
  });
});

describe("handleSendBulkLike", () => {
  const bulkMsg = (sessionId: string, tracks: object[]) => ({
    type: MESSAGE_TYPES.SEND_BULK_LIKE,
    sessionId,
    payload: { tracks },
  });

  it("broadcasts each distinct track and ACKs", async () => {
    const sid = uid("s");
    setupSession(sid);
    const tracks = [
      { artist: "A", title: "1" },
      { artist: "A", title: "2" },
      { artist: "A", title: "3" },
    ];

    await handleSendBulkLike(makeCtx(bulkMsg(sid, tracks), uid("c")));

    expect(mockRawWs.publish).toHaveBeenCalledTimes(3);
    expect(lastSend().type).toBe("ACK");
  });

  it("skips duplicate tracks within the batch", async () => {
    const sid = uid("s");
    setupSession(sid);
    const t1 = { artist: "A", title: "1" };
    const t2 = { artist: "A", title: "2" };

    await handleSendBulkLike(makeCtx(bulkMsg(sid, [t1, t1, t2]), uid("c")));

    expect(mockRawWs.publish).toHaveBeenCalledTimes(2);
  });

  it("caps the batch at 100 tracks", async () => {
    const sid = uid("s");
    setupSession(sid);
    const tracks = Array.from({ length: 120 }, (_, i) => ({ artist: "A", title: `b${i}` }));

    await handleSendBulkLike(makeCtx(bulkMsg(sid, tracks), uid("c")));

    expect(mockRawWs.publish).toHaveBeenCalledTimes(100);
  });

  it("rate-limits after BULK_LIKE_RATE_LIMIT_MAX flushes", async () => {
    const sid = uid("s");
    setupSession(sid);
    const c = uid("c");

    for (let i = 0; i < LIMITS.BULK_LIKE_RATE_LIMIT_MAX; i++) {
      mockWs.send.mockClear();
      await handleSendBulkLike(makeCtx(bulkMsg(sid, [{ artist: "A", title: `r${i}` }]), c));
      expect(lastSend().type).toBe("ACK");
    }

    mockWs.send.mockClear();
    await handleSendBulkLike(makeCtx(bulkMsg(sid, [{ artist: "A", title: "over" }]), c));
    expect(lastSend().type).toBe("NACK");
    expect(lastSend().error).toContain("Rate limit");
  });
});
