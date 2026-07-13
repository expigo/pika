/**
 * Session Routes
 *
 * Handles all session-related REST API endpoints:
 * - GET /sessions - List active sessions
 * - GET /active - Active sessions for landing page
 * - GET /:sessionId/history - Track history
 * - GET /:sessionId/recap - Full session recap
 * - GET /recent - Recent completed sessions
 * - POST /:sessionId/sync-fingerprints - Sync analysis data
 *
 * Extracted from index.ts for modularity.
 *
 * The recap payload assembly (buildSessionRecap) lives in lib/services/sessionRecap.ts
 * (2026-07 split); this file keeps the routes, the cache branch, and the HTTP mapping.
 */

import { LIMITS, logger } from "@pika/shared";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { getUserFromToken, hasDjAccess } from "../lib/auth";
import { withCache } from "../lib/cache";
import { getListenerCount } from "../lib/listeners";
import { buildSessionRecap } from "../lib/services/sessionRecap";
import { getAllSessions, getSessionAudienceKey } from "../lib/sessions";

const sessions = new Hono();

// ============================================================================
// Active Sessions
// ============================================================================

/**
 * GET /sessions
 * Get all active sessions (simple list)
 */
sessions.get("/", (c) => {
  const sessionsList = getAllSessions();
  return c.json(sessionsList);
});

/**
 * GET /active
 * Get active sessions for landing page (lightweight check, no WebSocket needed)
 */
sessions.get("/active", (c) => {
  try {
    const sessionsList = getAllSessions();

    if (sessionsList.length === 0) {
      return c.json({
        live: false,
        sessions: [],
      });
    }

    // Return active sessions with basic info
    const activeSummary = sessionsList.map((session) => ({
      sessionId: session.sessionId,
      djName: session.djName,
      // Booth path (Slice C) — lets the lobby render a Follow affordance; null = anonymous DJ.
      djSlug: session.djSlug ?? null,
      startedAt: session.startedAt,
      // Stage context (when this session runs under a stage) so the landing page
      // can route a visitor to /stage/{id} — following rotation — and label it.
      stageId: session.stageId ?? null,
      stageName: session.stageName ?? null,
      eventName: session.eventName ?? null,
      currentTrack: session.currentTrack
        ? {
            title: session.currentTrack.title,
            artist: session.currentTrack.artist,
            bpm: session.currentTrack.bpm,
          }
        : null,
      listenerCount: getListenerCount(getSessionAudienceKey(session.sessionId)),
      // Calculate Vibe Momentum (0.0 to 1.0)
      // Formula: (Listeners * 0.4) + (RecentLikes * 0.6) - normalized
      momentum: Math.min(
        1,
        getListenerCount(getSessionAudienceKey(session.sessionId)) * 0.05 + 0, // RecentLikes removed
      ),
    }));

    return c.json({
      live: true,
      count: sessionsList.length,
      sessions: activeSummary,
    });
  } catch (e) {
    logger.error("Failed to fetch active sessions", e);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

/**
 * GET /recent
 * Get recent completed sessions
 */
sessions.get("/recent", async (c) => {
  try {
    const recentSessions = await withCache("recent-sessions", 5 * 60 * 1000, async () => {
      return await db
        .select({
          id: schema.sessions.id,
          djName: schema.sessions.djName,
          startedAt: schema.sessions.startedAt,
          endedAt: schema.sessions.endedAt,
        })
        .from(schema.sessions)
        .where(isNotNull(schema.sessions.endedAt))
        .orderBy(desc(schema.sessions.endedAt))
        .limit(5);
    });

    return c.json(recentSessions);
  } catch (e) {
    logger.error("Failed to fetch recent sessions", e);
    return c.json([], 500);
  }
});

// ============================================================================
// Session Details
// ============================================================================

/**
 * GET /:sessionId/history
 * Get session track history (last 5 tracks)
 */
sessions.get("/:sessionId/history", async (c) => {
  const sessionId = c.req.param("sessionId");

  try {
    const tracks = await db
      .select({
        id: schema.playedTracks.id,
        artist: schema.playedTracks.artist,
        title: schema.playedTracks.title,
        playedAt: schema.playedTracks.playedAt,
      })
      .from(schema.playedTracks)
      .where(eq(schema.playedTracks.sessionId, sessionId))
      .orderBy(desc(schema.playedTracks.playedAt))
      .limit(LIMITS.MAX_HISTORY_ITEMS);

    return c.json(tracks);
  } catch (e) {
    logger.error("Failed to fetch history", e);
    return c.json([], 500);
  }
});

/**
 * GET /:sessionId/recap
 * Get full session recap (all tracks + metadata).
 *
 * The authenticated owner view (includes polls) is always computed fresh. The
 * public/unauthenticated view is cached briefly to absorb repeated hits on this
 * otherwise unrate-limited endpoint — ended sessions are immutable, and a few
 * seconds of staleness on a still-live recap is harmless (the live view is WS).
 */
sessions.get("/:sessionId/recap", async (c) => {
  const sessionId = c.req.param("sessionId");
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  try {
    const payload = token
      ? await buildSessionRecap(sessionId, token)
      : await withCache(`recap-public:${sessionId}`, 15_000, () =>
          buildSessionRecap(sessionId, null),
        );

    if (!payload) {
      logger.info("Recap not found", { sessionId });
      return c.json({ error: "Session not found" }, 404);
    }

    return c.json(payload);
  } catch (e) {
    logger.error("Failed to fetch recap", e, { sessionId });
    return c.json({ error: "Failed to fetch recap" }, 500);
  }
});

// ============================================================================
// Fingerprint Sync
// ============================================================================

/**
 * POST /:sessionId/sync-fingerprints
 * Sync fingerprint/analysis data for tracks in a session.
 * Called by desktop at session end to update played_tracks with BPM, energy, etc.
 */
sessions.post("/:sessionId/sync-fingerprints", async (c) => {
  const sessionId = c.req.param("sessionId");

  // 🔐 Security: Require valid DJ authentication
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) {
    return c.json({ error: "Authentication required" }, 401);
  }

  const user = await getUserFromToken(token);
  if (!user) {
    return c.json({ error: "Invalid or expired token" }, 401);
  }
  // A valid session alone is not enough — a Slice-B dancer token must not write analysis data.
  if (hasDjAccess(user) !== "ok") {
    return c.json({ error: "Forbidden" }, 403);
  }

  const body = await c.req.json<{
    tracks: Array<{
      artist: string;
      title: string;
      bpm?: number | null;
      key?: string | null;
      duration?: number | null;
      energy?: number | null;
      danceability?: number | null;
      brightness?: number | null;
      acousticness?: number | null;
      groove?: number | null;
    }>;
  }>();

  if (!body.tracks || !Array.isArray(body.tracks)) {
    return c.json({ error: "Invalid request: tracks array required" }, 400);
  }

  // 🔐 Security: Verify session ownership
  const sessionData = await db
    .select({ djUserId: schema.sessions.djUserId })
    .from(schema.sessions)
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);

  const sessionRow = sessionData[0];
  if (!sessionRow) {
    return c.json({ error: "Session not found" }, 404);
  }

  if (sessionRow.djUserId !== user.id) {
    logger.warn("🚫 Unauthorized fingerprint sync attempt", {
      sessionId,
      userId: user.id,
      sessionOwnerId: sessionRow.djUserId,
    });
    return c.json({ error: "You do not own this session" }, 403);
  }

  logger.info("🔄 Syncing fingerprints for session", { sessionId, count: body.tracks.length });

  try {
    // Filter tracks that have data to update
    const tracksToUpdate = body.tracks.filter(
      (track) => track.bpm || track.key || track.energy || track.duration,
    );

    if (tracksToUpdate.length === 0) {
      return c.json({ synced: 0, total: body.tracks.length, sessionId });
    }

    // Use transaction to batch all updates
    let updated = 0;
    await db.transaction(async (tx) => {
      // Build promises for all updates (executed in parallel within transaction)
      const updatePromises = tracksToUpdate.map(async (track) => {
        // Build update object with only non-null values
        const updateData: Record<string, unknown> = {};
        if (track.bpm != null) updateData["bpm"] = Math.round(track.bpm);
        if (track.key != null) updateData["key"] = track.key;
        if (track.duration != null) updateData["durationSec"] = Math.round(track.duration);
        if (track.energy != null) updateData["energy"] = Math.round(track.energy);
        if (track.danceability != null) updateData["danceability"] = Math.round(track.danceability);
        if (track.brightness != null) updateData["brightness"] = Math.round(track.brightness);
        if (track.acousticness != null) updateData["acousticness"] = Math.round(track.acousticness);
        if (track.groove != null) updateData["groove"] = Math.round(track.groove);

        if (Object.keys(updateData).length === 0) {
          return 0;
        }

        // Update by sessionId + artist + title match
        const result = await tx
          .update(schema.playedTracks)
          .set(updateData)
          .where(
            and(
              eq(schema.playedTracks.sessionId, sessionId),
              eq(schema.playedTracks.artist, track.artist),
              eq(schema.playedTracks.title, track.title),
            ),
          )
          .returning({ id: schema.playedTracks.id });

        return result.length > 0 ? 1 : 0;
      });

      const results = await Promise.all(updatePromises);
      updated = results.reduce<number>((sum, r) => sum + r, 0);
    });

    logger.info("✅ Synced tracks for session", {
      sessionId,
      synced: updated,
      total: body.tracks.length,
    });

    return c.json({
      synced: updated,
      total: body.tracks.length,
      sessionId,
    });
  } catch (e) {
    logger.error("Failed to sync fingerprints", e, { sessionId });
    return c.json({ error: "Failed to sync fingerprints" }, 500);
  }
});

export { sessions };
