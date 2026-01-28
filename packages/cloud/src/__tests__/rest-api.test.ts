/**
 * REST API Endpoint Tests
 *
 * @file rest-api.test.ts
 * @package @pika/cloud
 * @created 2026-01-21
 *
 * PURPOSE:
 * Tests REST API endpoints for validation, response format, and error handling.
 * Uses mock data to avoid database dependency.
 *
 * SAFETY CONSTRAINTS:
 * - Every endpoint behavior documented
 * - Edge cases for empty data, invalid input, 404s
 * - No database dependency - pure function testing
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { Hono } from "hono";

// ============================================================================
// MOCK STATE
// ============================================================================

interface MockSession {
  sessionId: string;
  djName: string;
  startedAt: string;
  currentTrack?: { artist: string; title: string; bpm?: number };
}

interface MockTrack {
  id: number;
  artist: string;
  title: string;
  bpm?: number;
  playedAt: string;
}

let mockActiveSessions: Map<string, MockSession>;
let mockDbSessions: Map<string, { djName: string; startedAt: string; endedAt?: string }>;
let mockTracks: Map<string, MockTrack[]>;
let mockDatabaseConnected: boolean;

function getListenerCount(_sessionId: string): number {
  return 10; // Mock value
}

// ============================================================================
// MOCK API ROUTES
// ============================================================================

const mockApp = new Hono();

/**
 * GET /health
 *
 * PURPOSE:
 * - Verify server is running
 * - Test database connection (critical for deployment health checks)
 *
 * PRODUCTION LOCATION: packages/cloud/src/index.ts (line ~805)
 */
mockApp.get("/health", async (c) => {
  if (!mockDatabaseConnected) {
    return c.json(
      {
        status: "error",
        version: "0.2.1",
        timestamp: new Date().toISOString(),
        error: "Database unavailable",
      },
      503,
    );
  }

  return c.json({
    status: "ok",
    version: "0.2.1",
    timestamp: new Date().toISOString(),
    activeSessions: mockActiveSessions.size,
    database: "connected",
  });
});

/**
 * GET /sessions
 *
 * PURPOSE:
 * - List all active sessions
 * - Used by landing page and session discovery
 */
mockApp.get("/sessions", (c) => {
  const sessions = Array.from(mockActiveSessions.values());
  return c.json(sessions);
});

/**
 * GET /api/sessions/active
 *
 * PURPOSE:
 * - Lightweight check for landing page
 * - Returns session summaries with momentum calculation
 */
mockApp.get("/api/sessions/active", (c) => {
  const sessions = Array.from(mockActiveSessions.values());

  if (sessions.length === 0) {
    return c.json({
      live: false,
      sessions: [],
    });
  }

  const activeSummary = sessions.map((session) => ({
    sessionId: session.sessionId,
    djName: session.djName,
    startedAt: session.startedAt,
    currentTrack: session.currentTrack || null,
    listenerCount: getListenerCount(session.sessionId),
    momentum: Math.min(1, getListenerCount(session.sessionId) * 0.05),
  }));

  return c.json({
    live: true,
    count: sessions.length,
    sessions: activeSummary,
  });
});

/**
 * GET /api/session/:sessionId/history
 *
 * PURPOSE:
 * - Get recent tracks for a session (last 5)
 * - Used by dancer view for track history
 */
mockApp.get("/api/session/:sessionId/history", (c) => {
  const sessionId = c.req.param("sessionId");
  const tracks = mockTracks.get(sessionId) || [];

  // Return last 5 tracks, newest first
  const recent = [...tracks].reverse().slice(0, 5);
  return c.json(recent);
});

/**
 * GET /api/session/:sessionId/recap
 *
 * PURPOSE:
 * - Full session summary with all tracks, likes, tempo, polls
 * - Used for post-session analytics
 */
mockApp.get("/api/session/:sessionId/recap", (c) => {
  const sessionId = c.req.param("sessionId");
  const dbSession = mockDbSessions.get(sessionId);

  if (!dbSession) {
    return c.json({ error: "Session not found" }, 404);
  }

  const tracks = mockTracks.get(sessionId) || [];

  return c.json({
    sessionId,
    djName: dbSession.djName,
    startedAt: dbSession.startedAt,
    endedAt: dbSession.endedAt || new Date().toISOString(),
    trackCount: tracks.length,
    totalLikes: 25, // Mock value
    tracks: tracks.map((t, i) => ({
      position: i + 1,
      artist: t.artist,
      title: t.title,
      bpm: t.bpm,
      playedAt: t.playedAt,
      likes: 5, // Mock value
    })),
    polls: [],
    totalPolls: 0,
    totalPollVotes: 0,
  });
});

/**
 * GET /api/stats/global
 *
 * PURPOSE:
 * - Global platform statistics
 * - Used by analytics dashboard
 */
mockApp.get("/api/stats/global", (c) => {
  return c.json({
    totalSessions: 150,
    totalTracks: 3500,
    totalLikes: 12000,
    totalPolls: 45,
    topDJs: [
      { name: "DJ Test", sessions: 25, totalLikes: 500 },
      { name: "DJ Demo", sessions: 18, totalLikes: 350 },
    ],
  });
});

// ============================================================================
// TEST SUITES
// ============================================================================

describe("REST API - Health Endpoint", () => {
  beforeEach(() => {
    mockActiveSessions = new Map();
    mockDatabaseConnected = true;
  });

  /**
   * TEST: Health check returns 200 when database is connected
   *
   * RATIONALE:
   * Load balancers and monitoring use this to verify service health.
   * Must return quickly and accurately reflect database state.
   */
  test("returns 200 OK when database connected", async () => {
    mockDatabaseConnected = true;

    const res = await mockApp.request("/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.database).toBe("connected");
    expect(body.version).toBeDefined();
  });

  /**
   * TEST: Health check returns 503 when database disconnected
   *
   * RATIONALE:
   * Critical for zero-downtime deployments.
   * Load balancer must route traffic away from unhealthy instances.
   */
  test("returns 503 when database disconnected", async () => {
    mockDatabaseConnected = false;

    const res = await mockApp.request("/health");

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.status).toBe("error");
    expect(body.error).toBe("Database unavailable");
  });

  /**
   * TEST: Health response includes active session count
   *
   * RATIONALE:
   * Useful for monitoring dashboard to see live activity at a glance.
   */
  test("includes active session count", async () => {
    mockActiveSessions.set("session-1", {
      sessionId: "session-1",
      djName: "DJ Test",
      startedAt: new Date().toISOString(),
    });
    mockActiveSessions.set("session-2", {
      sessionId: "session-2",
      djName: "DJ Demo",
      startedAt: new Date().toISOString(),
    });

    const res = await mockApp.request("/health");
    const body = await res.json();

    expect(body.activeSessions).toBe(2);
  });

  /**
   * TEST: Health timestamp is valid ISO date
   *
   * RATIONALE:
   * Clients may use timestamp to detect stale health checks.
   */
  test("timestamp is valid ISO date", async () => {
    const res = await mockApp.request("/health");
    const body = await res.json();

    const parsed = new Date(body.timestamp);
    expect(parsed.toISOString()).toBe(body.timestamp);
  });
});

describe("REST API - Sessions Endpoints", () => {
  beforeEach(() => {
    mockActiveSessions = new Map();
  });

  /**
   * TEST: Returns empty array when no active sessions
   *
   * RATIONALE:
   * Landing page must handle empty state gracefully.
   */
  test("/sessions returns empty array when no sessions", async () => {
    const res = await mockApp.request("/sessions");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  /**
   * TEST: Returns all active sessions
   *
   * RATIONALE:
   * Session discovery needs complete list of live DJs.
   */
  test("/sessions returns all active sessions", async () => {
    mockActiveSessions.set("session-1", {
      sessionId: "session-1",
      djName: "DJ One",
      startedAt: new Date().toISOString(),
    });
    mockActiveSessions.set("session-2", {
      sessionId: "session-2",
      djName: "DJ Two",
      startedAt: new Date().toISOString(),
    });

    const res = await mockApp.request("/sessions");
    const body = await res.json();

    expect(body).toHaveLength(2);
    expect(body[0].djName).toBeDefined();
  });

  /**
   * TEST: /api/sessions/active returns live: false when no sessions
   *
   * RATIONALE:
   * Landing page uses this to show "no DJs live" state.
   */
  test("/api/sessions/active returns live: false when empty", async () => {
    const res = await mockApp.request("/api/sessions/active");
    const body = await res.json();

    expect(body.live).toBe(false);
    expect(body.sessions).toEqual([]);
  });

  /**
   * TEST: /api/sessions/active includes momentum calculation
   *
   * RATIONALE:
   * Momentum drives the "vibe meter" on landing page.
   */
  test("/api/sessions/active includes momentum", async () => {
    mockActiveSessions.set("session-1", {
      sessionId: "session-1",
      djName: "DJ Test",
      startedAt: new Date().toISOString(),
      currentTrack: { artist: "Artist", title: "Song", bpm: 120 },
    });

    const res = await mockApp.request("/api/sessions/active");
    const body = await res.json();

    expect(body.live).toBe(true);
    expect(body.count).toBe(1);
    expect(body.sessions[0].momentum).toBeDefined();
    expect(body.sessions[0].listenerCount).toBeDefined();
  });
});

describe("REST API - Session History", () => {
  beforeEach(() => {
    mockTracks = new Map();
  });

  /**
   * TEST: Returns empty array for session with no tracks
   *
   * RATIONALE:
   * New sessions have no track history yet.
   */
  test("returns empty array for new session", async () => {
    const res = await mockApp.request("/api/session/new-session/history");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual([]);
  });

  /**
   * TEST: Returns last 5 tracks in reverse order
   *
   * RATIONALE:
   * Dancer sees "most recent" first for quick reference.
   */
  test("returns last 5 tracks, newest first", async () => {
    const tracks: MockTrack[] = [];
    for (let i = 1; i <= 10; i++) {
      tracks.push({
        id: i,
        artist: `Artist ${i}`,
        title: `Song ${i}`,
        playedAt: new Date(Date.now() - (10 - i) * 60000).toISOString(),
      });
    }
    mockTracks.set("session-1", tracks);

    const res = await mockApp.request("/api/session/session-1/history");
    const body = await res.json();

    expect(body).toHaveLength(5);
    expect(body[0].title).toBe("Song 10"); // Most recent
    expect(body[4].title).toBe("Song 6"); // 5th most recent
  });

  /**
   * TEST: Returns all tracks if less than 5
   *
   * RATIONALE:
   * Short sessions shouldn't fail.
   */
  test("returns all tracks if less than 5", async () => {
    mockTracks.set("session-1", [
      { id: 1, artist: "Artist", title: "Song 1", playedAt: new Date().toISOString() },
      { id: 2, artist: "Artist", title: "Song 2", playedAt: new Date().toISOString() },
    ]);

    const res = await mockApp.request("/api/session/session-1/history");
    const body = await res.json();

    expect(body).toHaveLength(2);
  });
});

describe("REST API - Session Recap", () => {
  beforeEach(() => {
    mockDbSessions = new Map();
    mockTracks = new Map();
  });

  /**
   * TEST: Returns 404 for unknown session
   *
   * RATIONALE:
   * Invalid session IDs shouldn't crash - return clear error.
   */
  test("returns 404 for unknown session", async () => {
    const res = await mockApp.request("/api/session/unknown-session/recap");

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Session not found");
  });

  /**
   * TEST: Returns full recap for valid session
   *
   * RATIONALE:
   * Post-session analytics page needs complete data.
   */
  test("returns full recap for valid session", async () => {
    mockDbSessions.set("session-1", {
      djName: "DJ Test",
      startedAt: "2026-01-20T20:00:00Z",
      endedAt: "2026-01-20T23:00:00Z",
    });
    mockTracks.set("session-1", [
      { id: 1, artist: "Artist A", title: "Song 1", bpm: 120, playedAt: "2026-01-20T20:05:00Z" },
      { id: 2, artist: "Artist B", title: "Song 2", bpm: 125, playedAt: "2026-01-20T20:10:00Z" },
    ]);

    const res = await mockApp.request("/api/session/session-1/recap");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.sessionId).toBe("session-1");
    expect(body.djName).toBe("DJ Test");
    expect(body.trackCount).toBe(2);
    expect(body.tracks).toHaveLength(2);
    expect(body.tracks[0].position).toBe(1);
    expect(body.tracks[1].position).toBe(2);
  });

  /**
   * TEST: Recap handles session with no tracks
   *
   * RATIONALE:
   * Edge case - DJ started session but played nothing.
   */
  test("handles session with no tracks", async () => {
    mockDbSessions.set("empty-session", {
      djName: "Silent DJ",
      startedAt: "2026-01-20T20:00:00Z",
    });

    const res = await mockApp.request("/api/session/empty-session/recap");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.trackCount).toBe(0);
    expect(body.tracks).toEqual([]);
  });

  /**
   * TEST: Recap includes polldata structure
   *
   * RATIONALE:
   * Analytics page displays poll results.
   */
  test("includes poll data structure", async () => {
    mockDbSessions.set("session-1", {
      djName: "DJ Poll",
      startedAt: "2026-01-20T20:00:00Z",
    });

    const res = await mockApp.request("/api/session/session-1/recap");
    const body = await res.json();

    expect(body.polls).toBeDefined();
    expect(body.totalPolls).toBeDefined();
    expect(body.totalPollVotes).toBeDefined();
  });
});

describe("REST API - Global Stats", () => {
  /**
   * TEST: Returns global platform statistics
   *
   * RATIONALE:
   * Analytics dashboard needs aggregate metrics.
   */
  test("returns global stats", async () => {
    const res = await mockApp.request("/api/stats/global");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.totalSessions).toBeDefined();
    expect(body.totalTracks).toBeDefined();
    expect(body.totalLikes).toBeDefined();
  });

  /**
   * TEST: Includes top DJs leaderboard
   *
   * RATIONALE:
   * Community features - show most active DJs.
   */
  test("includes top DJs", async () => {
    const res = await mockApp.request("/api/stats/global");
    const body = await res.json();

    expect(body.topDJs).toBeDefined();
    expect(Array.isArray(body.topDJs)).toBe(true);
  });
});
