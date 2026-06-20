/**
 * Cross-Session Topic Isolation
 *
 * @file topic-isolation.test.ts
 * @package @pika/cloud
 *
 * PURPOSE:
 * The cross-session-leak fix rests on two pillars:
 *
 *   1. Bun's native pub/sub delivers a message ONLY to subscribers of the exact
 *      topic, `ws.publish()` EXCLUDES the sending socket, and `server.publish()`
 *      reaches EVERY subscriber. (Part A — proven end-to-end against a real
 *      Bun.serve, so a future Bun upgrade that changes these semantics fails CI.)
 *
 *   2. Pika's handlers route per-session traffic to `session:{id}` topics and
 *      keep only lifecycle/discovery events on the global discovery topic, and
 *      both the DJ (on REGISTER) and dancers (on SUBSCRIBE) join the right
 *      per-session topic. (Part B — handler-level routing assertions.)
 *
 * Together these guarantee that a like/poll/track in session A can never be
 * delivered to a client watching session B.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import type { Server } from "bun";
import { handleBroadcastTrack, handleRegisterSession } from "../src/handlers/dj";
import { handleSubscribe } from "../src/handlers/subscriber";
import { deleteSession, getAllSessions, setSession } from "../src/lib/sessions";
import { DISCOVERY_TOPIC, getSessionTopic } from "../src/lib/topics";

// ============================================================================
// Part A — Foundation: real Bun pub/sub delivery guarantees
// ============================================================================

interface ClientHandle {
  ws: WebSocket;
  messages: Array<Record<string, unknown>>;
}

let server: Server;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectClient(): Promise<ClientHandle> {
  const ws = new WebSocket(`ws://localhost:${server.port}`);
  const messages: Array<Record<string, unknown>> = [];
  ws.addEventListener("message", (ev) => {
    try {
      messages.push(JSON.parse(String((ev as MessageEvent).data)));
    } catch {
      // ignore non-JSON frames
    }
  });
  await new Promise<void>((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("client failed to connect")));
  });
  return { ws, messages };
}

function action(ws: WebSocket, payload: Record<string, unknown>): void {
  ws.send(JSON.stringify(payload));
}

const sawType = (c: ClientHandle, type: string): boolean => c.messages.some((m) => m.type === type);

describe("Bun pub/sub delivery guarantees (foundation)", () => {
  beforeAll(() => {
    // A tiny server that mirrors Pika's topic model using Bun-native pub/sub.
    server = Bun.serve({
      port: 0,
      fetch(req, srv) {
        if (srv.upgrade(req)) return undefined;
        return new Response("upgrade failed", { status: 400 });
      },
      websocket: {
        open(ws) {
          // Every connection joins the discovery ("lobby") topic, like Pika.
          ws.subscribe(DISCOVERY_TOPIC);
        },
        message(ws, raw) {
          const msg = JSON.parse(String(raw)) as {
            do: string;
            topic?: string;
            data?: Record<string, unknown>;
          };
          if (!msg.topic) return;
          if (msg.do === "subscribe") ws.subscribe(msg.topic);
          else if (msg.do === "unsubscribe") ws.unsubscribe(msg.topic);
          else if (msg.do === "publishWs") ws.publish(msg.topic, JSON.stringify(msg.data));
          else if (msg.do === "publishServer") server.publish(msg.topic, JSON.stringify(msg.data));
        },
      },
    });
  });

  afterAll(() => {
    server.stop(true);
  });

  it("delivers a session-topic message ONLY to that session's subscribers", async () => {
    const a = await connectClient();
    const b = await connectClient();
    action(a.ws, { do: "subscribe", topic: getSessionTopic("A") });
    action(b.ws, { do: "subscribe", topic: getSessionTopic("B") });
    await wait(60);

    // A like published to session A's topic.
    action(a.ws, {
      do: "publishServer",
      topic: getSessionTopic("A"),
      data: { type: "LIKE_RECEIVED", sessionId: "A" },
    });
    await wait(60);

    expect(sawType(a, "LIKE_RECEIVED")).toBe(true); // in-session
    expect(sawType(b, "LIKE_RECEIVED")).toBe(false); // NO cross-session leak

    a.ws.close();
    b.ws.close();
  });

  it("ws.publish() excludes the sender but reaches co-subscribers", async () => {
    const a1 = await connectClient();
    const a2 = await connectClient();
    action(a1.ws, { do: "subscribe", topic: getSessionTopic("A") });
    action(a2.ws, { do: "subscribe", topic: getSessionTopic("A") });
    await wait(60);

    action(a1.ws, { do: "publishWs", topic: getSessionTopic("A"), data: { type: "NOW_PLAYING" } });
    await wait(60);

    expect(sawType(a1, "NOW_PLAYING")).toBe(false); // sender excluded (no self-echo)
    expect(sawType(a2, "NOW_PLAYING")).toBe(true); // co-subscriber receives

    a1.ws.close();
    a2.ws.close();
  });

  it("server.publish() reaches EVERY subscriber of the topic", async () => {
    const a1 = await connectClient();
    const a2 = await connectClient();
    action(a1.ws, { do: "subscribe", topic: getSessionTopic("A") });
    action(a2.ws, { do: "subscribe", topic: getSessionTopic("A") });
    await wait(60);

    // server.publish has no self-exclusion — both subscribers must receive it.
    action(a1.ws, {
      do: "publishServer",
      topic: getSessionTopic("A"),
      data: { type: "LISTENER_COUNT" },
    });
    await wait(60);

    expect(sawType(a1, "LISTENER_COUNT")).toBe(true);
    expect(sawType(a2, "LISTENER_COUNT")).toBe(true);

    a1.ws.close();
    a2.ws.close();
  });

  it("discovery topic reaches all connections regardless of session (lobby)", async () => {
    const a = await connectClient();
    const b = await connectClient();
    action(a.ws, { do: "subscribe", topic: getSessionTopic("A") });
    action(b.ws, { do: "subscribe", topic: getSessionTopic("B") });
    await wait(60);

    action(a.ws, {
      do: "publishServer",
      topic: DISCOVERY_TOPIC,
      data: { type: "SESSION_ENDED", sessionId: "A" },
    });
    await wait(60);

    expect(sawType(a, "SESSION_ENDED")).toBe(true);
    expect(sawType(b, "SESSION_ENDED")).toBe(true);

    a.ws.close();
    b.ws.close();
  });

  it("unsubscribing stops delivery (session switch on one connection)", async () => {
    const a = await connectClient();
    action(a.ws, { do: "subscribe", topic: getSessionTopic("A") });
    await wait(40);
    action(a.ws, { do: "unsubscribe", topic: getSessionTopic("A") });
    action(a.ws, { do: "subscribe", topic: getSessionTopic("B") });
    await wait(40);

    action(a.ws, {
      do: "publishServer",
      topic: getSessionTopic("A"),
      data: { type: "NOW_PLAYING" },
    });
    await wait(60);
    expect(sawType(a, "NOW_PLAYING")).toBe(false); // left A — no longer delivered

    action(a.ws, {
      do: "publishServer",
      topic: getSessionTopic("B"),
      data: { type: "TRACK_STOPPED" },
    });
    await wait(60);
    expect(sawType(a, "TRACK_STOPPED")).toBe(true); // joined B — delivered

    a.ws.close();
  });
});

// ============================================================================
// Part B — Handler routing: Pika handlers use the correct topics
// ============================================================================

describe("handler routing → per-session vs discovery topics", () => {
  const mockWs = { send: mock(() => {}), close: mock(() => {}) } as never;

  function makeRawWs() {
    return {
      publish: mock(() => {}),
      subscribe: mock(() => {}),
      unsubscribe: mock(() => {}),
      getBufferedAmount: mock(() => 0),
    };
  }

  function liveSession(sessionId: string) {
    setSession(sessionId, {
      sessionId,
      djName: "DJ",
      startedAt: new Date().toISOString(),
      lastActivityAt: new Date().toISOString(),
    });
  }

  beforeEach(() => {
    for (const s of getAllSessions()) {
      deleteSession(s.sessionId);
    }
  });

  it("DJ is subscribed to its OWN session topic on REGISTER_SESSION", async () => {
    const sessionId = "session_register_dj";
    const rawWs = makeRawWs();
    const state = {
      clientId: "dj",
      isListener: false,
      subscribedSessionId: null,
      djSessionId: null,
    };
    const prevEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "test"; // persistSession short-circuits (no DB)
    try {
      await handleRegisterSession({
        message: { type: "REGISTER_SESSION", sessionId, djName: "DJ" },
        ws: mockWs,
        rawWs,
        state,
        messageId: "reg1",
      } as never);
    } finally {
      process.env.NODE_ENV = prevEnv;
    }

    expect(rawWs.subscribe).toHaveBeenCalledWith(getSessionTopic(sessionId));
    // SESSION_STARTED is a discovery event — it must go to the lobby, not the session topic.
    expect(rawWs.publish).toHaveBeenCalledWith(
      DISCOVERY_TOPIC,
      expect.stringContaining('"type":"SESSION_STARTED"'),
    );
    expect(rawWs.publish).not.toHaveBeenCalledWith(
      getSessionTopic(sessionId),
      expect.stringContaining('"type":"SESSION_STARTED"'),
    );
  });

  it("BROADCAST_TRACK publishes NOW_PLAYING to the session topic, never discovery", async () => {
    const sessionId = "session_now_playing";
    liveSession(sessionId);
    const rawWs = makeRawWs();
    await handleBroadcastTrack({
      message: {
        type: "BROADCAST_TRACK",
        sessionId,
        track: { artist: "Artist", title: "Song" },
        messageId: "bt1",
      },
      ws: mockWs,
      rawWs,
      state: {
        clientId: "dj",
        isListener: false,
        subscribedSessionId: null,
        djSessionId: sessionId,
      },
      messageId: "bt1",
    } as never);

    expect(rawWs.publish).toHaveBeenCalledWith(
      getSessionTopic(sessionId),
      expect.stringContaining('"type":"NOW_PLAYING"'),
    );
    expect(rawWs.publish).not.toHaveBeenCalledWith(DISCOVERY_TOPIC, expect.anything());
  });

  it("SUBSCRIBE joins the target session topic", () => {
    const sessionId = "session_dancer_sub";
    liveSession(sessionId);
    const rawWs = makeRawWs();
    const state = {
      clientId: "dancer-1",
      isListener: false,
      subscribedSessionId: null,
      djSessionId: null,
    };
    handleSubscribe({
      message: { type: "SUBSCRIBE", sessionId, clientId: "dancer-1" },
      ws: mockWs,
      rawWs,
      state,
      messageId: "sub1",
    } as never);

    expect(rawWs.subscribe).toHaveBeenCalledWith(getSessionTopic(sessionId));
    expect(state.subscribedSessionId).toBe(sessionId);
  });

  it("SUBSCRIBE leaves the previous session topic when switching sessions", () => {
    const oldSession = "session_old";
    const newSession = "session_new";
    liveSession(oldSession);
    liveSession(newSession);
    const rawWs = makeRawWs();
    const state = {
      clientId: "dancer-2",
      isListener: true, // already a listener on the old session
      subscribedSessionId: oldSession,
      djSessionId: null,
    };
    handleSubscribe({
      message: { type: "SUBSCRIBE", sessionId: newSession, clientId: "dancer-2" },
      ws: mockWs,
      rawWs,
      state,
      messageId: "sub2",
    } as never);

    expect(rawWs.unsubscribe).toHaveBeenCalledWith(getSessionTopic(oldSession));
    expect(rawWs.subscribe).toHaveBeenCalledWith(getSessionTopic(newSession));
    expect(state.subscribedSessionId).toBe(newSession);
  });
});
