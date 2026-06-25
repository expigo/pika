/**
 * Stage-topic routing tests — REAL handlers + REAL in-memory state.
 *
 * Drives the actual handleSubscribeStage against the real lib/sessions,
 * lib/stages and lib/listeners modules (only the WebSocket is mocked), so this
 * is coverage of the shipped code, not a re-implementation. NODE_ENV="test"
 * makes handleSubscribeStage skip its DB validation (mirrors the persist*
 * short-circuit), so no Postgres is needed.
 */
import { afterEach, describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import { handleSubscribeStage } from "../handlers/subscriber";
import type { WSConnectionState, WSContext } from "../handlers/ws-context";
import { clearListeners, getListenerCount } from "../lib/listeners";
import {
  deleteSession,
  getSessionAudienceKey,
  getSessionBroadcastTopic,
  type LiveSession,
  setSession,
} from "../lib/sessions";
import {
  clearStageActiveSession,
  getStageActiveSession,
  setStageActiveSession,
} from "../lib/stages";
import { getSessionTopic, getStageTopic } from "../lib/topics";

// Bun's test runner defaults NODE_ENV="test", so handleSubscribeStage skips its
// DB validation here (mirrors the persist* short-circuit) — no Postgres needed.

let seq = 0;
const uniq = (p: string) => `${p}_${Date.now().toString(36)}_${seq++}`;

function liveSession(sessionId: string, extra: Partial<LiveSession> = {}): LiveSession {
  const now = new Date().toISOString();
  return { sessionId, djName: "DJ", startedAt: now, lastActivityAt: now, ...extra };
}

function newState(clientId: string | null): WSConnectionState {
  return {
    clientId,
    isListener: false,
    subscribedSessionId: null,
    subscribedStageId: null,
    djSessionId: null,
  };
}

interface Captured {
  ctx: WSContext;
  sent: Array<Record<string, unknown>>;
  subscribed: string[];
  unsubscribed: string[];
  published: Array<{ topic: string; data: Record<string, unknown> }>;
}

function mkCtx(message: Record<string, unknown>, state: WSConnectionState): Captured {
  const sent: Array<Record<string, unknown>> = [];
  const subscribed: string[] = [];
  const unsubscribed: string[] = [];
  const published: Array<{ topic: string; data: Record<string, unknown> }> = [];
  const rawWs = {
    subscribe: (t: string) => {
      subscribed.push(t);
    },
    unsubscribe: (t: string) => {
      unsubscribed.push(t);
    },
    publish: (t: string, d: string) => {
      published.push({ topic: t, data: JSON.parse(d) });
    },
    getBufferedAmount: () => 0,
  } as unknown as ServerWebSocket;
  const ws = {
    send: (d: string) => {
      sent.push(JSON.parse(d));
    },
    close: () => {},
  };
  const ctx = { message, ws, rawWs, state, messageId: undefined } as unknown as WSContext;
  return { ctx, sent, subscribed, unsubscribed, published };
}

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup.splice(0)) fn();
});

// ===========================================================================
// Topic / audience resolvers
// ===========================================================================

describe("topic resolvers (getSessionBroadcastTopic / getSessionAudienceKey)", () => {
  test("a stage-less session resolves to its own per-session topic and raw id key", () => {
    const sid = uniq("plain");
    setSession(sid, liveSession(sid));
    cleanup.push(() => deleteSession(sid));

    expect(getSessionBroadcastTopic(sid)).toBe(getSessionTopic(sid));
    expect(getSessionAudienceKey(sid)).toBe(sid); // raw id → byte-identical to pre-stage behavior
  });

  test("a staged session resolves both to the stage topic", () => {
    const sid = uniq("staged");
    const stageId = uniq("floor");
    setSession(sid, liveSession(sid, { stageId }));
    cleanup.push(() => deleteSession(sid));

    expect(getSessionBroadcastTopic(sid)).toBe(getStageTopic(stageId));
    expect(getSessionAudienceKey(sid)).toBe(getStageTopic(stageId));
  });

  test("an unknown session falls back to the session topic (never throws)", () => {
    expect(getSessionBroadcastTopic("ghost")).toBe(getSessionTopic("ghost"));
    expect(getSessionAudienceKey("ghost")).toBe("ghost");
  });
});

// ===========================================================================
// Stage runtime map + rotation guard
// ===========================================================================

describe("lib/stages active-session map", () => {
  test("set/get/clear round-trips", () => {
    const stageId = uniq("floor");
    setStageActiveSession(stageId, "sessA");
    expect(getStageActiveSession(stageId)).toBe("sessA");
    clearStageActiveSession(stageId, "sessA");
    expect(getStageActiveSession(stageId)).toBeUndefined();
  });

  test("a stale clear (wrong session) must NOT wipe the newer DJ's claim", () => {
    const stageId = uniq("floor");
    setStageActiveSession(stageId, "sessA");
    setStageActiveSession(stageId, "sessB"); // DJ B rotated in
    cleanup.push(() => clearStageActiveSession(stageId, "sessB"));

    clearStageActiveSession(stageId, "sessA"); // DJ A's late teardown — must be a no-op
    expect(getStageActiveSession(stageId)).toBe("sessB");
  });
});

// ===========================================================================
// handleSubscribeStage
// ===========================================================================

describe("handleSubscribeStage", () => {
  test("subscribes to the stage topic, counts the listener, and syncs the live DJ's track", async () => {
    const stageId = uniq("floor");
    const sid = uniq("djA");
    setSession(sid, liveSession(sid, { stageId, currentTrack: { artist: "Ar", title: "Ti" } }));
    setStageActiveSession(stageId, sid);
    cleanup.push(() => {
      deleteSession(sid);
      clearStageActiveSession(stageId, sid);
      clearListeners(getStageTopic(stageId));
    });

    const state = newState("client-aaaa1");
    const { ctx, sent, subscribed } = mkCtx(
      { type: "SUBSCRIBE_STAGE", stageId, clientId: "client-aaaa1" },
      state,
    );
    await handleSubscribeStage(ctx);

    expect(subscribed).toContain(getStageTopic(stageId));
    expect(state.subscribedStageId).toBe(stageId);
    expect(state.isListener).toBe(true);
    expect(getListenerCount(getStageTopic(stageId))).toBe(1);
    expect(sent.some((m) => m.type === "NOW_PLAYING")).toBe(true);
  });

  test("joining an empty stage subscribes + sends a count but no NOW_PLAYING", async () => {
    const stageId = uniq("floor");
    cleanup.push(() => clearListeners(getStageTopic(stageId)));

    const state = newState("client-bbbb2");
    const { ctx, sent, subscribed } = mkCtx(
      { type: "SUBSCRIBE_STAGE", stageId, clientId: "client-bbbb2" },
      state,
    );
    await handleSubscribeStage(ctx);

    expect(subscribed).toContain(getStageTopic(stageId));
    expect(sent.some((m) => m.type === "LISTENER_COUNT")).toBe(true);
    expect(sent.some((m) => m.type === "NOW_PLAYING")).toBe(false);
  });

  test("without a clientId it does not subscribe or count", async () => {
    const stageId = uniq("floor");
    const state = newState(null);
    const { ctx, subscribed } = mkCtx({ type: "SUBSCRIBE_STAGE", stageId }, state);
    await handleSubscribeStage(ctx);

    expect(subscribed).toHaveLength(0);
    expect(state.subscribedStageId).toBeNull();
  });

  test("re-subscribing to the same stage is idempotent (count stays 1)", async () => {
    const stageId = uniq("floor");
    cleanup.push(() => clearListeners(getStageTopic(stageId)));
    const state = newState("client-cccc3");

    await handleSubscribeStage(
      mkCtx({ type: "SUBSCRIBE_STAGE", stageId, clientId: "client-cccc3" }, state).ctx,
    );
    await handleSubscribeStage(
      mkCtx({ type: "SUBSCRIBE_STAGE", stageId, clientId: "client-cccc3" }, state).ctx,
    );

    expect(getListenerCount(getStageTopic(stageId))).toBe(1);
  });

  test("switching stages unsubscribes the old topic and counts on the new", async () => {
    const stage1 = uniq("floor1");
    const stage2 = uniq("floor2");
    cleanup.push(() => {
      clearListeners(getStageTopic(stage1));
      clearListeners(getStageTopic(stage2));
    });
    const state = newState("client-dddd4");

    await handleSubscribeStage(
      mkCtx({ type: "SUBSCRIBE_STAGE", stageId: stage1, clientId: "client-dddd4" }, state).ctx,
    );
    const second = mkCtx(
      { type: "SUBSCRIBE_STAGE", stageId: stage2, clientId: "client-dddd4" },
      state,
    );
    await handleSubscribeStage(second.ctx);

    // Routing moved to the new stage; the dancer is counted there.
    expect(second.unsubscribed).toContain(getStageTopic(stage1));
    expect(second.subscribed).toContain(getStageTopic(stage2));
    expect(state.subscribedStageId).toBe(stage2);
    expect(getListenerCount(getStageTopic(stage2))).toBe(1);
    // NOTE: stage1's count is intentionally STICKY (PARTICIPANT_TTL) after
    // removeListener — it decays over ~5min, matching the pre-existing
    // session-switch behavior — so we assert routing, not an instant 0.
  });
});

// ===========================================================================
// Seamless DJ rotation (the core promise)
// ===========================================================================

describe("seamless DJ rotation on a stage", () => {
  test("DJ B inherits the same stage topic, so a subscribed dancer needs no re-subscribe", () => {
    const stageId = uniq("floor");
    const djA = uniq("djA");
    const djB = uniq("djB");
    setSession(djA, liveSession(djA, { stageId, currentTrack: { artist: "A", title: "AT" } }));
    setStageActiveSession(stageId, djA);
    cleanup.push(() => {
      deleteSession(djA);
      deleteSession(djB);
      clearStageActiveSession(stageId, djB);
    });

    const topicWhileA = getSessionBroadcastTopic(djA);

    // DJ B rotates in on the same stage.
    setSession(djB, liveSession(djB, { stageId, currentTrack: { artist: "B", title: "BT" } }));
    setStageActiveSession(stageId, djB);

    // B publishes to the SAME topic the dancer is already subscribed to.
    expect(getSessionBroadcastTopic(djB)).toBe(topicWhileA);
    expect(getSessionBroadcastTopic(djB)).toBe(getStageTopic(stageId));
  });

  test("a dancer joining after rotation syncs to the new DJ's track", async () => {
    const stageId = uniq("floor");
    const djB = uniq("djB");
    setSession(djB, liveSession(djB, { stageId, currentTrack: { artist: "B", title: "BT" } }));
    setStageActiveSession(stageId, djB);
    cleanup.push(() => {
      deleteSession(djB);
      clearStageActiveSession(stageId, djB);
      clearListeners(getStageTopic(stageId));
    });

    const { ctx, sent } = mkCtx(
      { type: "SUBSCRIBE_STAGE", stageId, clientId: "client-eeee5" },
      newState("client-eeee5"),
    );
    await handleSubscribeStage(ctx);

    const nowPlaying = sent.find((m) => m.type === "NOW_PLAYING") as
      | { track?: { title?: string } }
      | undefined;
    expect(nowPlaying?.track?.title).toBe("BT");
  });
});
