/**
 * Client Routes
 *
 * Handles client (dancer) API endpoints:
 * - GET  /:clientId/likes          - The dancer's Journal: paginated likes + playlist state
 * - POST /:clientId/likes/playlist - Export/regenerate the "My Pika Journal" Spotify playlist
 *
 * Extracted from index.ts for modularity.
 */

import { LIMITS, logger } from "@pika/shared";
import { and, count, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { db, schema } from "../db";
import { CLIENT_ID_REGEX } from "../lib/services/identity";
import {
  enrichLikesWithSessions,
  exportJournalPlaylist,
  journalExportErrorResponse,
  linkFallbackUrl,
  trustedSpotifyLinkOn,
} from "../lib/services/journal";

const client = new Hono();

/** NaN-hardened integer query param with clamping. */
function clampInt(raw: string | undefined, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

// 🛡️ This endpoint is unauthenticated and runs ~3 DB queries per call. The clientId is the
// dancer's only identity — a 122-bit `client_<uuid>` bearer id over anonymous, low-sensitivity
// data (public songs liked in public sessions) — so it can't be guessed/enumerated. We don't add
// auth (there is no dancer account); we IP-rate-limit instead, to protect the DB from scraping.
client.use(
  "/:clientId/likes",
  rateLimiter({
    windowMs: LIMITS.CLIENT_LIKES_RATE_LIMIT_WINDOW,
    limit: LIMITS.CLIENT_LIKES_RATE_LIMIT_MAX,
    standardHeaders: "draft-6",
    keyGenerator: (c) =>
      c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
    handler: (c) => c.json({ error: "Too many requests, please try again later" }, 429),
  }),
);

// 🛡️ Export writes a playlist on the shared Spotify service account — much tighter per-IP cap
// (the per-clientId cooldown + global daily budget live in the journal service).
client.use(
  "/:clientId/likes/playlist",
  rateLimiter({
    windowMs: LIMITS.JOURNAL_EXPORT_RATE_LIMIT_WINDOW,
    limit: LIMITS.JOURNAL_EXPORT_RATE_LIMIT_MAX,
    standardHeaders: "draft-6",
    keyGenerator: (c) =>
      c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
    handler: (c) => c.json({ error: "Too many requests, please try again later" }, 429),
  }),
);

/**
 * GET /:clientId/likes?limit=&offset=
 * The dancer's Journal: real total, a page of likes (grouped client-side by session), the
 * journal-playlist state, and retro-enriched Spotify identity — a like whose play predates the
 * identity wedge falls back to the trusted `track_links` spine (never a low-confidence guess).
 */
client.get("/:clientId/likes", async (c) => {
  const clientId = c.req.param("clientId");

  if (!clientId || !CLIENT_ID_REGEX.test(clientId)) {
    return c.json({ error: "Invalid client ID format" }, 400);
  }

  const limit = clampInt(c.req.query("limit"), 1, 200, 100);
  const offset = clampInt(c.req.query("offset"), 0, Number.MAX_SAFE_INTEGER, 0);

  try {
    logger.debug("🔍 Fetching likes for client", { clientId, limit, offset });
    const [countRows, likeRows, playlistRows] = await Promise.all([
      db.select({ n: count() }).from(schema.likes).where(eq(schema.likes.clientId, clientId)),
      db
        .select({
          id: schema.likes.id,
          sessionId: schema.likes.sessionId,
          artist: schema.playedTracks.artist,
          title: schema.playedTracks.title,
          albumArtUrl: schema.playedTracks.albumArtUrl,
          spotifyUrl: schema.playedTracks.spotifyUrl,
          likedAt: schema.likes.createdAt,
          linkProviderId: schema.trackLinks.providerId,
          linkProviderUrl: schema.trackLinks.providerUrl,
        })
        .from(schema.likes)
        .innerJoin(schema.playedTracks, eq(schema.likes.playedTrackId, schema.playedTracks.id))
        .leftJoin(schema.trackLinks, trustedSpotifyLinkOn())
        .where(eq(schema.likes.clientId, clientId))
        .orderBy(desc(schema.likes.createdAt))
        .limit(limit)
        .offset(offset),
      db
        .select({
          url: schema.journalPlaylists.spotifyPlaylistUrl,
          trackCount: schema.journalPlaylists.trackCount,
          updatedAt: schema.journalPlaylists.updatedAt,
        })
        .from(schema.journalPlaylists)
        .where(eq(schema.journalPlaylists.clientId, clientId))
        .limit(1),
    ]);

    const totalLikes = countRows[0]?.n ?? 0;

    // Retro-enriched Spotify link (strip the raw link columns), then batch session info.
    const withLinks = likeRows.map(({ linkProviderId, linkProviderUrl, ...like }) => ({
      ...like,
      spotifyUrl: like.spotifyUrl ?? linkFallbackUrl(linkProviderUrl, linkProviderId),
    }));
    const enrichedLikes = await enrichLikesWithSessions(withLinks);

    const playlistRow = playlistRows[0];
    return c.json({
      clientId,
      totalLikes,
      limit,
      offset,
      likes: enrichedLikes,
      playlist: playlistRow
        ? {
            url: playlistRow.url,
            trackCount: playlistRow.trackCount,
            updatedAt: playlistRow.updatedAt,
          }
        : null,
    });
  } catch (error) {
    logger.error("Failed to fetch client likes", error);
    return c.json({ error: "Failed to fetch likes" }, 500);
  }
});

/**
 * POST /:clientId/likes/playlist
 * Create — or regenerate in place — the dancer's "My Pika Journal" playlist on the shared Pika
 * service account. No body; the URL is the entire input. Guarded by per-IP limiter (above),
 * per-clientId cooldown, in-flight lock, and a global daily budget (journal service).
 */
client.post("/:clientId/likes/playlist", async (c) => {
  const clientId = c.req.param("clientId");

  if (!clientId || !CLIENT_ID_REGEX.test(clientId)) {
    return c.json({ error: "Invalid client ID format" }, 400);
  }

  try {
    const result = await exportJournalPlaylist(clientId);
    return c.json(result);
  } catch (e) {
    const mapped = journalExportErrorResponse(c, e);
    if (mapped) return mapped;
    logger.error("❌ Journal playlist export failed", e);
    return c.json({ error: "Failed to create playlist" }, 502);
  }
});

// Removal shares the read endpoint's per-IP budget (a cheap ownership-scoped delete). Route-level
// middleware (playlist.ts pattern) — a path-wide `use` on /:clientId/likes/:likeId would also
// match the export POST (`playlist` matches `:likeId`) and double-count its budget.
const likeRemovalLimiter = rateLimiter({
  windowMs: LIMITS.CLIENT_LIKES_RATE_LIMIT_WINDOW,
  limit: LIMITS.CLIENT_LIKES_RATE_LIMIT_MAX,
  standardHeaders: "draft-6",
  keyGenerator: (c) =>
    c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
  handler: (c) => c.json({ error: "Too many requests, please try again later" }, 429),
});

/**
 * DELETE /:clientId/likes/:likeId
 * Post-hoc unlike from the Journal (live unlikes go over WS REMOVE_LIKE). Ownership lives in the
 * WHERE — not-found and not-yours are indistinguishable (dj.ts precedent), and NULL-owner likes
 * can never match. The exported playlist drops the song on the next export (full rewrite).
 */
client.delete("/:clientId/likes/:likeId", likeRemovalLimiter, async (c) => {
  const clientId = c.req.param("clientId");
  if (!clientId || !CLIENT_ID_REGEX.test(clientId)) {
    return c.json({ error: "Invalid client ID format" }, 400);
  }
  const likeId = Number.parseInt(c.req.param("likeId") ?? "", 10);
  if (!Number.isInteger(likeId) || likeId <= 0) {
    return c.json({ error: "Invalid like id" }, 400);
  }

  try {
    const deleted = await db
      .delete(schema.likes)
      .where(and(eq(schema.likes.id, likeId), eq(schema.likes.clientId, clientId)))
      .returning({ id: schema.likes.id });
    if (deleted.length === 0) {
      return c.json({ error: "Like not found" }, 404);
    }

    const countRows = await db
      .select({ n: count() })
      .from(schema.likes)
      .where(eq(schema.likes.clientId, clientId));
    return c.json({ success: true, totalLikes: countRows[0]?.n ?? 0 });
  } catch (error) {
    logger.error("Failed to remove like", error);
    return c.json({ error: "Failed to remove like" }, 500);
  }
});

export { client };
