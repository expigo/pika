/**
 * DJ-reconnect grace period
 *
 * @file session-grace.test.ts
 * @package @pika/cloud
 *
 * The desktop WebView drops `ws://localhost` periodically and reconnects within
 * ~1s. Tearing the session down on every DJ blip made dancers see
 * SESSION_ENDED → SESSION_STARTED churn + listener-count flicker. These tests
 * verify the grace behavior: handleClose defers teardown, a reconnect cancels it
 * (no SESSION_STARTED re-broadcast), and only an expired grace ends the session.
 */

import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";

// NOTE: no mock.module here — Bun module mocks are global and leak across files.
// The DB-touching calls (persistSession/endSessionInDb) are test-safe (the same
// handlers are exercised unmocked in handler-topic-routing.test.ts), and the
// reap's endSessionInDb is fire-and-forget (.catch), so the assertions below
// (in-memory state + broadcasts) don't depend on the database.

import { handleEndSession, handleRegisterSession } from "../src/handlers/dj";
import { handleClose, reapSession } from "../src/handlers/lifecycle";
import { setBroadcaster } from "../src/lib/broadcaster";
import {
  cancelDjReap,
  deleteSession,
  getAllSessions,
  getSession,
  hasPendingDjReap,
  scheduleDjReap,
  setSession,
} from "../src/lib/sessions";
import { DISCOVERY_TOPIC } from "../src/lib/topics";

type AnyMock = any;

let published: Array<{ topic: string; data: string }> = [];

const mockWs: AnyMock = { send: mock(() => {}), close: mock(() => {}) };
function makeRawWs(): AnyMock {
  return {
    publish: mock((topic: string, data: string) => published.push({ topic, data })),
    subscribe: mock(() => {}),
    unsubscribe: mock(() => {}),
    getBufferedAmount: mock(() => 0),
  };
}

function live(sessionId: string) {
  setSession(sessionId, {
    sessionId,
    djName: "DJ",
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  });
}

const djState = (sessionId: string): AnyMock => ({
  clientId: "dj",
  isListener: false,
  subscribedSessionId: null,
  djSessionId: sessionId,
});

beforeEach(() => {
  published = [];
  // Capture publishes from the deferred reap (uses server broadcaster).
  setBroadcaster({
    publish: (topic, data) => {
      published.push({ topic, data });
      return 1;
    },
  });
  for (const s of getAllSessions()) deleteSession(s.sessionId);
});

afterEach(() => {
  for (const s of getAllSessions()) {
    cancelDjReap(s.sessionId);
    deleteSession(s.sessionId);
  }
  mock.clearAllMocks();
});

describe("session reap timer helpers", () => {
  it("schedules and cancels a reap", () => {
    live("session_timer1");
    let reaped = false;
    scheduleDjReap("session_timer1", 10_000, () => {
      reaped = true;
    });
    expect(hasPendingDjReap("session_timer1")).toBe(true);
    expect(cancelDjReap("session_timer1")).toBe(true); // returns true = was pending
    expect(hasPendingDjReap("session_timer1")).toBe(false);
    expect(reaped).toBe(false);
  });

  it("does not schedule for a non-existent session", () => {
    scheduleDjReap("session_missing", 10_000, () => {});
    expect(hasPendingDjReap("session_missing")).toBe(false);
  });

  it("cancelDjReap returns false when nothing is pending", () => {
    expect(cancelDjReap("session_nope")).toBe(false);
  });

  it("fires onReap after the delay", async () => {
    live("session_fire");
    let reaped = false;
    scheduleDjReap("session_fire", 20, () => {
      reaped = true;
    });
    await new Promise((r) => setTimeout(r, 60));
    expect(reaped).toBe(true);
    expect(hasPendingDjReap("session_fire")).toBe(false);
  });
});

describe("handleClose defers DJ teardown (grace)", () => {
  it("schedules a reap and does NOT end the session or broadcast immediately", () => {
    const sessionId = "session_close1";
    live(sessionId);
    handleClose({ raw: makeRawWs() }, djState(sessionId));

    expect(getSession(sessionId)).toBeDefined(); // still live
    expect(hasPendingDjReap(sessionId)).toBe(true); // teardown deferred
    expect(published.some((p) => p.data.includes("SESSION_ENDED"))).toBe(false);
  });
});

describe("reapSession ends the session once grace expires", () => {
  it("deletes the session and broadcasts SESSION_ENDED via the server broadcaster", () => {
    const sessionId = "session_reap1";
    live(sessionId);
    reapSession(sessionId);

    expect(getSession(sessionId)).toBeUndefined();
    const ended = published.filter(
      (p) => p.topic === DISCOVERY_TOPIC && p.data.includes("SESSION_ENDED"),
    );
    expect(ended.length).toBe(1);
  });

  it("is a no-op for an already-gone session", () => {
    reapSession("session_gone");
    expect(published.length).toBe(0);
  });
});

describe("handleRegisterSession reconnect within grace", () => {
  it("cancels the pending reap and does NOT re-broadcast SESSION_STARTED", async () => {
    const sessionId = "session_reconnect1";
    live(sessionId);
    scheduleDjReap(sessionId, 10_000, () => {}); // simulate a pending teardown

    const rawWs = makeRawWs();
    await handleRegisterSession({
      message: { type: "REGISTER_SESSION", sessionId, djName: "DJ" },
      ws: mockWs,
      rawWs,
      state: { clientId: "dj", isListener: false, subscribedSessionId: null, djSessionId: null },
      messageId: "r1",
    } as AnyMock);

    expect(hasPendingDjReap(sessionId)).toBe(false); // reap cancelled
    expect(published.some((p) => p.data.includes("SESSION_STARTED"))).toBe(false);
    // subscription to the session topic is still (re)established
    expect(rawWs.subscribe).toHaveBeenCalled();
  });

  it("a fresh session DOES broadcast SESSION_STARTED", async () => {
    const sessionId = "session_fresh1";
    const rawWs = makeRawWs();
    await handleRegisterSession({
      message: { type: "REGISTER_SESSION", sessionId, djName: "DJ" },
      ws: mockWs,
      rawWs,
      state: { clientId: "dj", isListener: false, subscribedSessionId: null, djSessionId: null },
      messageId: "f1",
    } as AnyMock);

    expect(
      published.some((p) => p.topic === DISCOVERY_TOPIC && p.data.includes("SESSION_STARTED")),
    ).toBe(true);
  });
});

describe("handleEndSession cancels any pending reap", () => {
  it("clears the reap timer on explicit End Set", () => {
    const sessionId = "session_end1";
    live(sessionId);
    scheduleDjReap(sessionId, 10_000, () => {});
    handleEndSession({
      message: { type: "END_SESSION", sessionId },
      ws: mockWs,
      rawWs: makeRawWs(),
      state: {
        clientId: "dj",
        isListener: false,
        subscribedSessionId: null,
        djSessionId: sessionId,
      },
      messageId: "e1",
    } as AnyMock);
    expect(hasPendingDjReap(sessionId)).toBe(false);
    expect(getSession(sessionId)).toBeUndefined();
  });
});
