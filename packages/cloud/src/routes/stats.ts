/**
 * Stats Routes
 *
 * Handles global statistics and discovery API endpoints:
 * - GET /top-tracks - Most liked tracks
 * - GET /global - Global aggregate statistics
 *
 * Extracted from index.ts for modularity.
 */
import { Hono } from "hono";
import { count, desc, eq } from "drizzle-orm";
import { db, schema } from "../db";
import { withCache } from "../lib/cache";

const stats = new Hono();

/**
 * GET /top-tracks
 * Get the most liked tracks across all sessions.
 * This is used for the "Live" zero-state to show community favorites.
 */
stats.get("/top-tracks", async (c) => {
  try {
    const topTracks = await withCache("top-tracks", 5 * 60 * 1000, async () => {
      return await db
        .select({
          artist: schema.playedTracks.artist,
          title: schema.playedTracks.title,
          likeCount: count(),
        })
        .from(schema.playedTracks)
        .innerJoin(schema.likes, eq(schema.playedTracks.id, schema.likes.playedTrackId))
        .groupBy(schema.playedTracks.artist, schema.playedTracks.title)
        .orderBy(desc(count()))
        .limit(10);
    });

    return c.json(topTracks);
  } catch (e) {
    console.error("Failed to fetch top tracks:", e);
    return c.json([], 500);
  }
});

/**
 * GET /global
 * Get global aggregate statistics for the analytics dashboard.
 * Returns total sessions, tracks, and likes across all time.
 */
stats.get("/global", async (c) => {
  try {
    const globalStats = await withCache("global-stats", 5 * 60 * 1000, async () => {
      const [sessionsResult, tracksResult, likesResult] = await Promise.all([
        db.select({ count: count() }).from(schema.sessions),
        db.select({ count: count() }).from(schema.playedTracks),
        db.select({ count: count() }).from(schema.likes),
      ]);

      return {
        totalSessions: sessionsResult[0]?.count ?? 0,
        totalTracks: tracksResult[0]?.count ?? 0,
        totalLikes: likesResult[0]?.count ?? 0,
      };
    });

    return c.json(globalStats);
  } catch (e) {
    console.error("Failed to fetch global stats:", e);
    return c.json({ totalSessions: 0, totalTracks: 0, totalLikes: 0 }, 500);
  }
});

export { stats };
