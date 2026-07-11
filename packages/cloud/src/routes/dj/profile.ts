/**
 * Public DJ profile read — `GET /api/dj/:slug` (the Booth).
 *
 * The ONLY public dj route; every other dj route is authed `/me/*`. Registered LAST in the
 * composer (`routes/dj.ts`) so the `:slug` param can never shadow the static `/me/*` routes —
 * Hono matches in registration order (hono.dev/docs/api/routing: general/param routes last).
 */

import { logger, slugify } from "@pika/shared";
import { and, asc, count, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { db, schema } from "../../db";
import { withCache } from "../../lib/cache";
import { computeSignature, getBoothPlaylists } from "../../lib/services/signature";
import { MAX_DJ_GIGS, MAX_LEGACY_SESSION_SCAN } from "./constants";

export const profileRoutes = new Hono();

/**
 * GET /:slug
 * Get DJ profile by slug
 */
profileRoutes.get("/:slug", async (c) => {
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
          bio: schema.user.bio,
          showFollowerCount: schema.user.showFollowerCount,
          showSignature: schema.user.showSignature,
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
          spotifyPlaylistId: schema.sessions.spotifyPlaylistId,
        })
        .from(schema.sessions)
        .where(
          and(
            eq(schema.sessions.djUserId, userResult.id),
            eq(schema.sessions.published, true), // Slice 5: only DJ-published sessions
          ),
        )
        .orderBy(desc(schema.sessions.startedAt));

      // Fallback: legacy/anonymous sessions matched by slugified djName. Bounded
      // to the most-recent N so this can't load every anonymous session ever.
      const legacySessions = await db
        .select({
          id: schema.sessions.id,
          djName: schema.sessions.djName,
          startedAt: schema.sessions.startedAt,
          endedAt: schema.sessions.endedAt,
          spotifyPlaylistId: schema.sessions.spotifyPlaylistId,
        })
        .from(schema.sessions)
        .where(and(isNull(schema.sessions.djUserId), eq(schema.sessions.published, true)))
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
        // Playlist sync: a set's synced Spotify playlist → badge on the profile session row.
        spotifyPlaylistId: session.spotifyPlaylistId ?? null,
      }));

      // Slice 5: DJ-pasted public Spotify playlists embedded on the profile.
      // `title` is slug-global display metadata (oEmbed, D.1) — cache-safe.
      const playlists = await db
        .select({
          id: schema.djPlaylists.id,
          url: schema.djPlaylists.url,
          spotifyPlaylistId: schema.djPlaylists.spotifyPlaylistId,
          title: schema.djPlaylists.title,
        })
        .from(schema.djPlaylists)
        .where(eq(schema.djPlaylists.djUserId, userResult.id))
        .orderBy(desc(schema.djPlaylists.createdAt));

      // Slice C (Booth): upcoming gigs + the DJ-gated public follower count. Both live inside
      // the cached payload (≤60s stale is fine); per-VIEWER state (isFollowing) must never be
      // computed here — the cache key is slug-only and would leak one viewer's state to all.
      const gigs = await db
        .select({
          id: schema.djGigs.id,
          date: schema.djGigs.gigDate,
          title: schema.djGigs.title,
          city: schema.djGigs.city,
          url: schema.djGigs.url,
        })
        .from(schema.djGigs)
        .where(
          and(
            eq(schema.djGigs.djUserId, userResult.id),
            gte(schema.djGigs.gigDate, sql`current_date`),
          ),
        )
        .orderBy(asc(schema.djGigs.gigDate))
        .limit(MAX_DJ_GIGS);

      let followerCount: number | undefined;
      if (userResult.showFollowerCount) {
        const [tally] = await db
          .select({ n: count() })
          .from(schema.djFollows)
          .where(eq(schema.djFollows.djUserId, userResult.id));
        followerCount = tally?.n ?? 0;
      }

      // Slice D: the Signature (slug-global, computed from published sets + promoted playlists —
      // safe inside this cached payload) and the promoted native playlists. `showSignature` is
      // the DJ's escape hatch; below the data floors computeSignature returns null anyway.
      const [signature, boothPlaylists] = await Promise.all([
        userResult.showSignature ? computeSignature(userResult.id) : Promise.resolve(null),
        getBoothPlaylists(userResult.id),
      ]);

      return {
        slug,
        djName,
        bio: userResult.bio ?? null,
        gigs,
        // Absent unless the DJ opted into public display (default hidden — owner decision).
        ...(followerCount !== undefined && { followerCount }),
        signature,
        boothPlaylists,
        sessions: sessionsWithCounts.slice(0, 20), // Limit to 20 most recent
        totalSessions: sessionsWithCounts.length,
        totalTracks: sessionsWithCounts.reduce((sum, s) => sum + s.trackCount, 0),
        playlists,
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
