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
import { count, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { db, schema } from "../db";
import {
  exportJournalPlaylist,
  JournalEmptyError,
  JournalExportCooldownError,
  JournalExportDailyCapError,
  JournalExportInFlightError,
  JournalNoMatchesError,
  linkFallbackUrl,
  trustedSpotifyLinkOn,
} from "../lib/services/journal";
import { SpotifyRateLimitError, SpotifyServiceNotConnectedError } from "../lib/services/spotify";

const client = new Hono();

// Validation: client IDs must match client_{uuid} or client_{timestamp}_{random} format
// We accept both strict UUIDs and the browser-generated generic IDs
const CLIENT_ID_REGEX = /^client_[a-zA-Z0-9_-]+$/i;

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

    // Get session info for each unique session in a single batch
    const sessionIds = [...new Set(likeRows.map((l) => l.sessionId).filter(Boolean))];
    const sessionsMap = new Map<string, { djName: string; startedAt: Date | null }>();

    if (sessionIds.length > 0) {
      const sessions = await db
        .select({
          id: schema.sessions.id,
          djName: schema.sessions.djName,
          startedAt: schema.sessions.startedAt,
        })
        .from(schema.sessions)
        .where(inArray(schema.sessions.id, sessionIds as string[]));

      for (const session of sessions) {
        sessionsMap.set(session.id, session);
      }
    }

    // Enrich with session info + retro-enriched Spotify link; strip the raw link columns.
    const enrichedLikes = likeRows.map(({ linkProviderId, linkProviderUrl, ...like }) => {
      const sessionInfo = like.sessionId ? sessionsMap.get(like.sessionId) : undefined;
      return {
        ...like,
        spotifyUrl: like.spotifyUrl ?? linkFallbackUrl(linkProviderUrl, linkProviderId),
        djName: sessionInfo?.djName ?? null,
        sessionDate: sessionInfo?.startedAt ?? null,
      };
    });

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
    if (e instanceof JournalExportInFlightError) {
      return c.json({ error: "Export already in progress" }, 429);
    }
    if (e instanceof JournalExportCooldownError) {
      return c.json(
        { error: "Please wait before updating again", retryAfterSec: e.retryAfterSec },
        429,
        { "Retry-After": String(e.retryAfterSec) },
      );
    }
    if (e instanceof JournalExportDailyCapError) {
      return c.json({ error: "Playlist exports are temporarily unavailable" }, 503);
    }
    if (e instanceof JournalEmptyError) {
      return c.json({ error: "No liked tracks to export" }, 404);
    }
    if (e instanceof JournalNoMatchesError) {
      return c.json(
        {
          error: "None of your liked tracks matched Spotify yet",
          totalLiked: e.totalLiked,
          matchedCount: 0,
        },
        422,
      );
    }
    if (e instanceof SpotifyServiceNotConnectedError) {
      // Same mapping as routes/playlist.ts — the shared account isn't connected in this env.
      return c.json({ error: "Playlist service not connected", needsService: true }, 409);
    }
    if (e instanceof SpotifyRateLimitError) {
      return c.json({ error: "Spotify is busy — try again shortly" }, 503, {
        "Retry-After": String(Math.max(1, Math.ceil(e.retryAfterMs / 1000))),
      });
    }
    logger.error("❌ Journal playlist export failed", e);
    return c.json({ error: "Failed to create playlist" }, 502);
  }
});

export { client };
