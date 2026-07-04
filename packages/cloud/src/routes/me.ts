/**
 * /api/me — the authenticated dancer/DJ account surface (Slice B).
 *
 * Everything here requires ONLY authentication (`requireAuth`, 401-only): dancers are
 * auto-approved and DJs may have journals too. State-changing routes additionally pass the
 * X-Pika-Client CSRF check applied at mount in index.ts.
 *
 *   POST   /api/me/journal/claim          → claim this device's clientId for the account
 *   GET    /api/me/journal                → union journal across claimed ids (de-duped)
 *   DELETE /api/me/journal/likes/:likeId  → account-scoped unlike (all claimed rows of the play)
 *   POST   /api/me/journal/playlist       → export/regenerate the account playlist (adopt-first)
 */

import { zValidator } from "@hono/zod-validator";
import { LIMITS, logger } from "@pika/shared";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { db, schema } from "../db";
import { getUser, requireAuth } from "../lib/auth";
import { CLIENT_ID_REGEX, claimClientId, getClaimedClientIds } from "../lib/services/identity";
import {
  adoptOrUpsertAccountPlaylistRow,
  defaultJournalExportDeps,
  enrichLikesWithSessions,
  exportJournalPlaylist,
  getAccountPlaylistRow,
  getAccountPlaylistView,
  journalExportErrorResponse,
  linkFallbackUrl,
  loadAccountLikedRows,
  trustedSpotifyLinkOn,
} from "../lib/services/journal";

const me = new Hono();

/** NaN-hardened integer query param with clamping (mirrors routes/client.ts). */
function clampInt(raw: string | undefined, min: number, max: number, fallback: number): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Real total for the union view: distinct (session, play) pairs across claimed ids. */
async function countAccountLikes(claimed: string[]): Promise<number> {
  const [row] = await db
    .select({
      n: sql<string>`count(distinct (${schema.likes.sessionId}, ${schema.likes.playedTrackId}))`,
    })
    .from(schema.likes)
    .where(inArray(schema.likes.clientId, claimed));
  return Number(row?.n ?? 0);
}

me.use("*", requireAuth);

// Same per-IP budget as the public journal read — claims are cheap single-row writes.
me.use(
  "/journal/*",
  rateLimiter({
    windowMs: LIMITS.CLIENT_LIKES_RATE_LIMIT_WINDOW,
    limit: LIMITS.CLIENT_LIKES_RATE_LIMIT_MAX,
    standardHeaders: "draft-6",
    keyGenerator: (c) =>
      c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
    handler: (c) => c.json({ error: "Too many requests, please try again later" }, 429),
  }),
);

const ClaimBody = z.object({
  clientId: z.string().max(80).regex(CLIENT_ID_REGEX),
});

/**
 * Claim this device's anonymous clientId for the signed-in account. Idempotent
 * (`already_yours`); FIRST-CLAIM-WINS — an id owned by another account returns 409 and the
 * device is expected to rotate to a fresh id (kiosk rule) rather than ever reassigning.
 */
me.post("/journal/claim", zValidator("json", ClaimBody), async (c) => {
  const { clientId } = c.req.valid("json");
  const outcome = await claimClientId(getUser(c).id, clientId);
  if (outcome === "conflict") {
    return c.json({ error: "claimed_by_another_account" }, 409);
  }
  return c.json({ status: outcome });
});

/**
 * GET /journal?limit=&offset=
 * The account journal: union of likes across every claimed clientId, de-duped WITHIN a session
 * by playedTrackId (the same play liked from two devices renders once — DISTINCT ON keeps the
 * earliest like), newest-first, with the same retro-enriched Spotify identity as the public
 * read. Response mirrors the public shape (`claimedCount` instead of `clientId`).
 */
me.get("/journal", async (c) => {
  const userId = getUser(c).id;
  const limit = clampInt(c.req.query("limit"), 1, 200, 100);
  const offset = clampInt(c.req.query("offset"), 0, Number.MAX_SAFE_INTEGER, 0);

  try {
    const claimed = await getClaimedClientIds(userId);
    if (claimed.length === 0) {
      return c.json({
        totalLikes: 0,
        limit,
        offset,
        likes: [],
        playlist: await getAccountPlaylistView(userId),
        claimedCount: 0,
      });
    }

    // DISTINCT ON requires the leading ORDER BY to match its columns; created_at ASC keeps the
    // EARLIEST like of a (session, play) pair. The outer query re-orders the page newest-first.
    const base = db
      .selectDistinctOn([schema.likes.sessionId, schema.likes.playedTrackId], {
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
      .where(inArray(schema.likes.clientId, claimed))
      .orderBy(schema.likes.sessionId, schema.likes.playedTrackId, asc(schema.likes.createdAt))
      .as("journal_base");

    const [likeRows, totalLikes, playlist] = await Promise.all([
      db.select().from(base).orderBy(desc(base.likedAt), desc(base.id)).limit(limit).offset(offset),
      countAccountLikes(claimed),
      getAccountPlaylistView(userId),
    ]);

    const withLinks = likeRows.map(({ linkProviderId, linkProviderUrl, ...like }) => ({
      ...like,
      spotifyUrl: like.spotifyUrl ?? linkFallbackUrl(linkProviderUrl, linkProviderId),
    }));
    const enriched = await enrichLikesWithSessions(withLinks);

    return c.json({
      totalLikes,
      limit,
      offset,
      likes: enriched,
      playlist,
      claimedCount: claimed.length,
    });
  } catch (error) {
    logger.error("Failed to fetch account journal", error);
    return c.json({ error: "Failed to fetch journal" }, 500);
  }
});

/**
 * DELETE /journal/likes/:likeId
 * Account-scoped unlike. Ownership lives in the WHERE (not-found == not-yours); deletes ALL
 * claimed-id rows for that (session, play) pair — the render-once model would otherwise
 * resurrect the other device's duplicate.
 */
me.delete("/journal/likes/:likeId", async (c) => {
  const userId = getUser(c).id;
  const likeId = Number.parseInt(c.req.param("likeId") ?? "", 10);
  if (!Number.isInteger(likeId) || likeId <= 0) {
    return c.json({ error: "Invalid like id" }, 400);
  }

  try {
    const claimed = await getClaimedClientIds(userId);
    if (claimed.length === 0) return c.json({ error: "Like not found" }, 404);

    const [target] = await db
      .select({
        sessionId: schema.likes.sessionId,
        playedTrackId: schema.likes.playedTrackId,
      })
      .from(schema.likes)
      .where(and(eq(schema.likes.id, likeId), inArray(schema.likes.clientId, claimed)))
      .limit(1);
    if (!target) return c.json({ error: "Like not found" }, 404);

    await db
      .delete(schema.likes)
      .where(
        and(
          eq(schema.likes.sessionId, target.sessionId),
          eq(schema.likes.playedTrackId, target.playedTrackId),
          inArray(schema.likes.clientId, claimed),
        ),
      );

    return c.json({ success: true, totalLikes: await countAccountLikes(claimed) });
  } catch (error) {
    logger.error("Failed to remove account like", error);
    return c.json({ error: "Failed to remove like" }, 500);
  }
});

// Export writes to the shared Spotify account — same tight per-IP cap as the public route.
me.use(
  "/journal/playlist",
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
 * POST /journal/playlist
 * Export/regenerate the ACCOUNT's "My Pika Journal" playlist over the union of claimed ids.
 * Reuses the export orchestration via DI: the `user_<id>` pseudo-key (can't collide with
 * `client_*`) provides the per-account in-flight lock + shared daily budget; the playlist row is
 * resolved adopt-first, so the cooldown correctly spans a device-side export of the same
 * playlist moments earlier.
 */
me.post("/journal/playlist", async (c) => {
  const userId = getUser(c).id;
  try {
    const result = await exportJournalPlaylist(`user_${userId}`, {
      ...defaultJournalExportDeps,
      loadLikedRows: () => loadAccountLikedRows(userId),
      getPlaylistRow: () => getAccountPlaylistRow(userId),
      upsertPlaylistRow: (row) =>
        adoptOrUpsertAccountPlaylistRow(userId, {
          spotifyPlaylistId: row.spotifyPlaylistId,
          spotifyPlaylistUrl: row.spotifyPlaylistUrl,
          trackCount: row.trackCount,
        }),
    });
    return c.json(result);
  } catch (e) {
    const mapped = journalExportErrorResponse(c, e);
    if (mapped) return mapped;
    logger.error("❌ Account journal playlist export failed", e);
    return c.json({ error: "Failed to create playlist" }, 502);
  }
});

export { me as meRoutes };
