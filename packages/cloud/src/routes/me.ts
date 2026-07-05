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
 *   PUT    /api/me/follows/:slug          → follow a DJ (account-keyed edge; Slice C)
 *   DELETE /api/me/follows/:slug          → unfollow
 *   GET    /api/me/follows                → "Your DJs" list (+ each DJ's next gig)
 *   GET    /api/me/preferences            → marketing-email consents (recap / DJ digest)
 *   PUT    /api/me/preferences            → explicit consent writes (timestamps = GDPR proof)
 */

import { zValidator } from "@hono/zod-validator";
import { LIMITS, logger } from "@pika/shared";
import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { db, schema } from "../db";
import { getUser, hasDjAccess, requireAuth } from "../lib/auth";
import {
  CLIENT_ID_REGEX,
  claimClientId,
  deriveDeviceLabel,
  getClaimedClientIds,
  getClaimedDevices,
  unlinkDevice,
} from "../lib/services/identity";
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
  const label = deriveDeviceLabel(c.req.header("User-Agent"));
  const outcome = await claimClientId(getUser(c).id, clientId, label);
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
    const devices = await getClaimedDevices(userId);
    const claimed = devices.map((d) => d.clientId);
    if (claimed.length === 0) {
      return c.json({
        totalLikes: 0,
        limit,
        offset,
        likes: [],
        playlist: await getAccountPlaylistView(userId),
        claimedCount: 0,
        devices: [],
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
      // Full ids are the owner's own bearer credentials (requireAuth-scoped); the web needs
      // them to mark "this device" and to target the unlink route. maskClientId is log-only.
      devices,
    });
  } catch (error) {
    logger.error("Failed to fetch account journal", error);
    return c.json({ error: "Failed to fetch journal" }, 500);
  }
});

/**
 * DELETE /journal/devices/:clientId
 * Unlink one device from the account: its likes leave the union and the device reverts to
 * anonymous per-device history — nothing is destroyed (re-claimable any time). Ownership lives
 * in the WHERE (not-found == not-yours). The web hides unlink for the CURRENT device — the
 * signed-in auto-claim would silently re-claim it on the next visit; sign-out is that action.
 */
me.delete("/journal/devices/:clientId", async (c) => {
  const clientId = c.req.param("clientId") ?? "";
  if (!CLIENT_ID_REGEX.test(clientId) || clientId.length > 80) {
    return c.json({ error: "Invalid client id" }, 400);
  }
  try {
    const removed = await unlinkDevice(getUser(c).id, clientId);
    if (!removed) return c.json({ error: "Device not found" }, 404);
    return c.json({ success: true });
  } catch (error) {
    logger.error("Failed to unlink device", error);
    return c.json({ error: "Failed to unlink device" }, 500);
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

// ============================================================================
// Follows + email preferences (Slice C — The Relationship Loop)
// ============================================================================

// One shared per-IP bucket across follow/unfollow/list + preference writes — all cheap
// single-row ops. A single limiter instance is reused so the paths share the same budget.
const relationshipLimiter = rateLimiter({
  windowMs: LIMITS.FOLLOWS_RATE_LIMIT_WINDOW,
  limit: LIMITS.FOLLOWS_RATE_LIMIT_MAX,
  standardHeaders: "draft-6",
  keyGenerator: (c) =>
    c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
  handler: (c) => c.json({ error: "Too many requests, please try again later" }, 429),
});
me.use("/follows", relationshipLimiter);
me.use("/follows/*", relationshipLimiter);
me.use("/preferences", relationshipLimiter);

const FollowBody = z.object({
  // Funnel provenance for the pilot — recorded verbatim, never trusted for anything else.
  source: z.enum(["live", "recap", "booth", "journal", "interstitial", "signin"]).optional(),
});

/** Resolve a public DJ slug to its account row. The slug IS the public identifier. */
async function findUserBySlug(slug: string): Promise<{ id: string; name: string } | null> {
  const [row] = await db
    .select({ id: schema.user.id, name: schema.user.name })
    .from(schema.user)
    .where(eq(schema.user.slug, slug))
    .limit(1);
  return row ?? null;
}

/**
 * PUT /follows/:slug — follow a DJ. Idempotent (the composite PK absorbs repeats); the edge
 * hangs off the ACCOUNT so it survives device rotation/eviction — this is precisely why Follow
 * is the account-upsell moment. Self-follows are rejected (they'd only pollute the count).
 */
me.put("/follows/:slug", zValidator("json", FollowBody), async (c) => {
  const slug = c.req.param("slug") ?? "";
  if (slug.length === 0 || slug.length > 120) return c.json({ error: "Invalid slug" }, 400);
  try {
    const dj = await findUserBySlug(slug);
    if (!dj) return c.json({ error: "DJ not found" }, 404);
    const userId = getUser(c).id;
    if (dj.id === userId) return c.json({ error: "You can't follow yourself" }, 400);
    await db
      .insert(schema.djFollows)
      .values({ userId, djUserId: dj.id, source: c.req.valid("json").source ?? null })
      .onConflictDoNothing();
    return c.json({ following: true });
  } catch (error) {
    logger.error("Failed to follow DJ", error);
    return c.json({ error: "Failed to follow" }, 500);
  }
});

/** DELETE /follows/:slug — unfollow. Idempotent: an absent edge is already the desired state. */
me.delete("/follows/:slug", async (c) => {
  const slug = c.req.param("slug") ?? "";
  if (slug.length === 0 || slug.length > 120) return c.json({ error: "Invalid slug" }, 400);
  try {
    const dj = await findUserBySlug(slug);
    if (!dj) return c.json({ error: "DJ not found" }, 404);
    await db
      .delete(schema.djFollows)
      .where(and(eq(schema.djFollows.userId, getUser(c).id), eq(schema.djFollows.djUserId, dj.id)));
    return c.json({ following: false });
  } catch (error) {
    logger.error("Failed to unfollow DJ", error);
    return c.json({ error: "Failed to unfollow" }, 500);
  }
});

/**
 * GET /follows — "Your DJs": followed DJs newest-first, each with their next upcoming gig
 * (the Booth's night-planning hook). Only slugged DJs can be followed, so slug is non-null.
 */
me.get("/follows", async (c) => {
  try {
    const rows = await db
      .select({
        slug: schema.user.slug,
        djName: schema.user.name,
        djUserId: schema.djFollows.djUserId,
        followedAt: schema.djFollows.createdAt,
      })
      .from(schema.djFollows)
      .innerJoin(schema.user, eq(schema.djFollows.djUserId, schema.user.id))
      .where(eq(schema.djFollows.userId, getUser(c).id))
      .orderBy(desc(schema.djFollows.createdAt));

    const djIds = rows.map((r) => r.djUserId);
    const nextGigs = new Map<string, string>();
    if (djIds.length > 0) {
      const gigRows = await db
        .select({
          djUserId: schema.djGigs.djUserId,
          nextGig: sql<string>`min(${schema.djGigs.gigDate})`,
        })
        .from(schema.djGigs)
        .where(
          and(
            inArray(schema.djGigs.djUserId, djIds),
            gte(schema.djGigs.gigDate, sql`current_date`),
          ),
        )
        .groupBy(schema.djGigs.djUserId);
      for (const g of gigRows) nextGigs.set(g.djUserId, g.nextGig);
    }

    return c.json({
      follows: rows.map(({ djUserId, ...r }) => ({
        ...r,
        nextGig: nextGigs.get(djUserId) ?? null,
      })),
    });
  } catch (error) {
    logger.error("Failed to list follows", error);
    return c.json({ error: "Failed to list follows" }, 500);
  }
});

const PreferencesBody = z
  .object({
    recapEmails: z.boolean().optional(),
    djDigest: z.boolean().optional(),
  })
  .refine((b) => b.recapEmails !== undefined || b.djDigest !== undefined, {
    message: "No preference provided",
  });

/** GET /preferences — the account's marketing-email consents. */
me.get("/preferences", async (c) => {
  const user = getUser(c);
  try {
    const [row] = await db
      .select()
      .from(schema.emailPreferences)
      .where(eq(schema.emailPreferences.userId, user.id))
      .limit(1);
    return c.json({
      recapEmails: !!row?.recapOptInAt,
      djDigest: !!row?.digestOptInAt,
      djDigestAvailable: hasDjAccess(user) === "ok",
    });
  } catch (error) {
    logger.error("Failed to read email preferences", error);
    return c.json({ error: "Failed to read preferences" }, 500);
  }
});

/**
 * PUT /preferences — explicit consent writes ONLY (never a signup side effect: magic-link
 * signups bypass additionalFields, and pre-ticked consent isn't consent). Turning a consent on
 * stamps now() — the timestamp is the GDPR proof; off nulls it. djDigest is DJ-surface-gated.
 */
me.put("/preferences", zValidator("json", PreferencesBody), async (c) => {
  const user = getUser(c);
  const body = c.req.valid("json");
  if (body.djDigest !== undefined && hasDjAccess(user) !== "ok") {
    return c.json({ error: "DJ digest is only available to approved DJ accounts" }, 403);
  }
  try {
    const [existing] = await db
      .select()
      .from(schema.emailPreferences)
      .where(eq(schema.emailPreferences.userId, user.id))
      .limit(1);
    const now = new Date();
    const recapOptInAt =
      body.recapEmails === undefined
        ? (existing?.recapOptInAt ?? null)
        : body.recapEmails
          ? now
          : null;
    const digestOptInAt =
      body.djDigest === undefined ? (existing?.digestOptInAt ?? null) : body.djDigest ? now : null;
    await db
      .insert(schema.emailPreferences)
      .values({ userId: user.id, recapOptInAt, digestOptInAt, updatedAt: now })
      .onConflictDoUpdate({
        target: schema.emailPreferences.userId,
        set: { recapOptInAt, digestOptInAt, updatedAt: now },
      });
    return c.json({ recapEmails: !!recapOptInAt, djDigest: !!digestOptInAt });
  } catch (error) {
    logger.error("Failed to update email preferences", error);
    return c.json({ error: "Failed to update preferences" }, 500);
  }
});

export { me as meRoutes };
