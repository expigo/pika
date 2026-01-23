/**
 * DJ Profile Routes
 *
 * Handles DJ profile API endpoints:
 * - GET /:slug - Get DJ profile by slug
 *
 * Extracted from index.ts for modularity.
 */
import { Hono } from "hono";
import { count, desc, eq, inArray, isNull } from "drizzle-orm";
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
    // 🔍 S0.3.5 Fix: Look up the DJ user first (ensures profiles work before first session)
    const djUser = await db
      .select({
        id: schema.djUsers.id,
        displayName: schema.djUsers.displayName,
      })
      .from(schema.djUsers)
      .where(eq(schema.djUsers.slug, slug))
      .limit(1);

    const userResult = djUser[0];
    if (!userResult) {
      return c.json({ error: "DJ not found" }, 404);
    }

    const djName = userResult.displayName;

    // Find all sessions where DJ name slugifies to this slug (legacy support) OR matches the DJ UID
    // For now, we'll keep the slug-based match for historical sessions but prioritize UID if we had it
    // Actually, sessions table has djUserId (optional)
    const allSessions = await db
      .select({
        id: schema.sessions.id,
        djName: schema.sessions.djName,
        startedAt: schema.sessions.startedAt,
        endedAt: schema.sessions.endedAt,
      })
      .from(schema.sessions)
      .where(eq(schema.sessions.djUserId, userResult.id))
      .orderBy(desc(schema.sessions.startedAt));

    // Fallback: also fetch sessions where djName slug matches (for legacy/anonymous sessions)
    // In a real migration we'd link these, but for now we'll merge them
    const legacySessions = await db
      .select({
        id: schema.sessions.id,
        djName: schema.sessions.djName,
        startedAt: schema.sessions.startedAt,
        endedAt: schema.sessions.endedAt,
      })
      .from(schema.sessions)
      .where(isNull(schema.sessions.djUserId))
      .orderBy(desc(schema.sessions.startedAt));

    const matchedLegacy = legacySessions.filter((s) => slugify(s.djName) === slug);

    // Combine and deduplicate
    const djSessions = [...allSessions];
    for (const ls of matchedLegacy) {
      if (!djSessions.find((s) => s.id === ls.id)) {
        djSessions.push(ls);
      }
    }

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
