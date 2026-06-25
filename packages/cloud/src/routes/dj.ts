/**
 * DJ Profile Routes
 *
 * Handles DJ profile API endpoints:
 * - GET /:slug - Get DJ profile by slug
 *
 * Extracted from index.ts for modularity.
 */

import { logger, slugify } from "@pika/shared";
import { count, desc, eq, inArray, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../db";
import { withCache } from "../lib/cache";

// Bound the legacy (anonymous) session scan. Pre-auth sessions have no djUserId,
// so they can only be matched to a profile by slugifying their djName in JS. We
// cap the scan to the most-recent N so this public endpoint can't be made to
// load every anonymous session ever into memory.
const MAX_LEGACY_SESSION_SCAN = 500;

const dj = new Hono();

/**
 * GET /:slug
 * Get DJ profile by slug
 */
dj.get("/:slug", async (c) => {
  const slug = c.req.param("slug");

  try {
    // Profiles change slowly; cache per-slug to blunt repeated public hits.
    // `null` (DJ not found) is cached too — fine for a short TTL.
    const payload = await withCache(`dj-profile:${slug}`, 60_000, async () => {
      // 🔍 S0.3.5 Fix: Look up the DJ user first (ensures profiles work before first session)
      const djUser = await db
        .select({
          id: schema.user.id,
          name: schema.user.name,
        })
        .from(schema.user)
        .where(eq(schema.user.slug, slug))
        .limit(1);

      const userResult = djUser[0];
      if (!userResult) return null;

      const djName = userResult.name;

      // Authenticated sessions match directly on djUserId (indexed).
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

      // Fallback: legacy/anonymous sessions matched by slugified djName. Bounded
      // to the most-recent N so this can't load every anonymous session ever.
      const legacySessions = await db
        .select({
          id: schema.sessions.id,
          djName: schema.sessions.djName,
          startedAt: schema.sessions.startedAt,
          endedAt: schema.sessions.endedAt,
        })
        .from(schema.sessions)
        .where(isNull(schema.sessions.djUserId))
        .orderBy(desc(schema.sessions.startedAt))
        .limit(MAX_LEGACY_SESSION_SCAN);

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

      return {
        slug,
        djName,
        sessions: sessionsWithCounts.slice(0, 20), // Limit to 20 most recent
        totalSessions: sessionsWithCounts.length,
        totalTracks: sessionsWithCounts.reduce((sum, s) => sum + s.trackCount, 0),
      };
    });

    if (!payload) {
      return c.json({ error: "DJ not found" }, 404);
    }

    return c.json(payload);
  } catch (error) {
    logger.error("Failed to fetch DJ profile", error);
    return c.json({ error: "Failed to fetch DJ profile" }, 500);
  }
});

export { dj };
