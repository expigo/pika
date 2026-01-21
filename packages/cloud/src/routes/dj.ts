/**
 * DJ Profile Routes
 *
 * Handles DJ profile API endpoints:
 * - GET /:slug - Get DJ profile by slug
 *
 * Extracted from index.ts for modularity.
 */
import { Hono } from "hono";
import { count, desc, inArray } from "drizzle-orm";
import { slugify } from "@pika/shared";
import { db, schema } from "../db";

const dj = new Hono();

/**
 * GET /:slug
 * Get DJ profile by slug
 */
dj.get("/:slug", async (c) => {
  const slug = c.req.param("slug");

  try {
    // Find all sessions where DJ name slugifies to this slug
    const allSessions = await db
      .select({
        id: schema.sessions.id,
        djName: schema.sessions.djName,
        startedAt: schema.sessions.startedAt,
        endedAt: schema.sessions.endedAt,
      })
      .from(schema.sessions)
      .orderBy(desc(schema.sessions.startedAt));

    // Filter sessions by slug match
    const djSessions = allSessions.filter((session) => slugify(session.djName) === slug);

    if (djSessions.length === 0) {
      return c.json({ error: "DJ not found" }, 404);
    }

    const firstSession = djSessions[0];
    if (!firstSession) {
      return c.json({ error: "DJ not found" }, 404);
    }
    const djName = firstSession.djName;

    // Limit to 20 most recent sessions BEFORE fetching counts to avoid N+1
    const recentSessions = djSessions
      .sort((a, b) => (b.startedAt?.getTime() || 0) - (a.startedAt?.getTime() || 0))
      .slice(0, 20);

    const sessionIds = recentSessions.map((s) => s.id);
    const countsMap = new Map<string, number>();

    if (sessionIds.length > 0) {
      const trackCounts = await db
        .select({
          sessionId: schema.playedTracks.sessionId,
          count: count(),
        })
        .from(schema.playedTracks)
        .where(inArray(schema.playedTracks.sessionId, sessionIds))
        .groupBy(schema.playedTracks.sessionId);

      for (const row of trackCounts) {
        if (row.sessionId) countsMap.set(row.sessionId, row.count);
      }
    }

    const sessionsWithCounts = recentSessions.map((session) => ({
      id: session.id,
      djName: session.djName,
      startedAt: session.startedAt?.toISOString() || new Date().toISOString(),
      endedAt: session.endedAt?.toISOString() || null,
      trackCount: countsMap.get(session.id) || 0,
    }));

    // Calculate totals
    const totalSessions = sessionsWithCounts.length;
    const totalTracks = sessionsWithCounts.reduce((sum, s) => sum + s.trackCount, 0);

    return c.json({
      slug,
      djName,
      sessions: sessionsWithCounts.slice(0, 20), // Limit to 20 most recent
      totalSessions,
      totalTracks,
    });
  } catch (error) {
    console.error("Failed to fetch DJ profile:", error);
    return c.json({ error: "Failed to fetch DJ profile" }, 500);
  }
});

export { dj };
