/**
 * REST API tests — REAL route handlers.
 *
 * The in-memory session endpoints (`GET /`, `GET /active`) are driven against the
 * actual `sessions` route + real `lib/sessions` / `lib/listeners` state — no DB.
 * DB-backed endpoints (history, recap, /stats/global, dj profile) are covered
 * against real Postgres in `integration/rest-routes.integration.test.ts` (gated RUN_DB_TESTS); mocking
 * drizzle chains here produced false coverage and is intentionally not done.
 *
 * `/health` is defined inline in `index.ts` (importing it boots the server), so it
 * is exercised here as a labeled contract mock only.
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { addListener, clearListeners } from "../lib/listeners";
import { deleteSession, getAllSessions, setSession } from "../lib/sessions";
import { sessions as sessionsRoute } from "../routes/sessions";

function clearSessionState() {
  for (const s of getAllSessions()) {
    clearListeners(s.sessionId);
    deleteSession(s.sessionId);
  }
}

function seedSession(sessionId: string, djName: string, currentTrack?: object) {
  setSession(sessionId, {
    sessionId,
    djName,
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    ...(currentTrack ? { currentTrack } : {}),
  });
}

// ============================================================================
// Sessions endpoints — REAL `sessions` route (in-memory, no DB)
// ============================================================================

describe("REST API - Sessions (real route)", () => {
  beforeEach(clearSessionState);

  test("GET / returns an empty array when no sessions are live", async () => {
    const res = await sessionsRoute.request("/");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  test("GET / returns all active sessions with djName", async () => {
    seedSession("session-a", "DJ One");
    seedSession("session-b", "DJ Two");

    const res = await sessionsRoute.request("/");
    const body = (await res.json()) as Array<{ djName: string }>;

    expect(body).toHaveLength(2);
    expect(body.map((s) => s.djName).sort()).toEqual(["DJ One", "DJ Two"]);
  });

  test("GET /active returns live:false when empty", async () => {
    const res = await sessionsRoute.request("/active");
    const body = (await res.json()) as { live: boolean; sessions: unknown[] };
    expect(body.live).toBe(false);
    expect(body.sessions).toEqual([]);
  });

  test("GET /active reports count, listenerCount and momentum", async () => {
    seedSession("session-1", "DJ Test", { artist: "Artist", title: "Song", bpm: 120 });
    // Two distinct listeners → a real (non-zero) count drives momentum.
    addListener("session-1", "listener-1");
    addListener("session-1", "listener-2");

    const res = await sessionsRoute.request("/active");
    const body = (await res.json()) as {
      live: boolean;
      count: number;
      sessions: Array<{ listenerCount: number; momentum: number; currentTrack: unknown }>;
    };

    expect(body.live).toBe(true);
    expect(body.count).toBe(1);
    expect(body.sessions[0]?.listenerCount).toBeGreaterThanOrEqual(2);
    expect(body.sessions[0]?.momentum).toBeGreaterThan(0);
    expect(body.sessions[0]?.currentTrack).not.toBeNull();
  });
});

// ============================================================================
// Health — contract-shape mock (real handler lives in index.ts)
// ============================================================================

describe("REST API - Health (contract mock — real handler in index.ts)", () => {
  // Mirrors the shape index.ts returns; kept as a mock because importing index.ts
  // starts the server + background intervals.
  const healthApp = new Hono();
  let dbConnected = true;
  healthApp.get("/health", (c) =>
    dbConnected
      ? c.json({
          status: "ok",
          version: "test",
          timestamp: new Date().toISOString(),
          database: "connected",
        })
      : c.json(
          {
            status: "error",
            version: "test",
            timestamp: new Date().toISOString(),
            error: "Database unavailable",
          },
          503,
        ),
  );

  test("returns 200 + connected when the DB is reachable", async () => {
    dbConnected = true;
    const res = await healthApp.request("/health");
    expect(res.status).toBe(200);
    expect(((await res.json()) as { database: string }).database).toBe("connected");
  });

  test("returns 503 when the DB is unreachable", async () => {
    dbConnected = false;
    const res = await healthApp.request("/health");
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("Database unavailable");
  });

  test("timestamp is a valid ISO date", async () => {
    dbConnected = true;
    const body = (await (await healthApp.request("/health")).json()) as { timestamp: string };
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });
});
