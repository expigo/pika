/**
 * Relationship routes (Slices C/D) — follows (`/api/me/follows*`), marketing-email preferences
 * (`/api/me/preferences`), and dancer↔DJ compatibility (`/api/me/compat/:slug`).
 *
 * ONE module deliberately: these paths share a single `relationshipLimiter` instance (one
 * per-IP budget across follows/preferences/compat) and `findUserBySlug` — splitting further
 * would need shared plumbing to preserve the budget. Auth: the composer applies `requireAuth`.
 */

import { zValidator } from "@hono/zod-validator";
import { LIMITS, logger } from "@pika/shared";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { db, schema } from "../../db";
import { getUser, hasDjAccess } from "../../lib/auth";
import { parseSpotifyTrackId } from "../../lib/services/finalizeWebSet";
import { getClaimedClientIds } from "../../lib/services/identity";
import { trustedSpotifyLinkOn } from "../../lib/services/journal";
import { getDjRepertoire } from "../../lib/services/signature";

export const relationshipRoutes = new Hono();

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
relationshipRoutes.use("/follows", relationshipLimiter);
relationshipRoutes.use("/follows/*", relationshipLimiter);
relationshipRoutes.use("/preferences", relationshipLimiter);

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
relationshipRoutes.put("/follows/:slug", zValidator("json", FollowBody), async (c) => {
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
relationshipRoutes.delete("/follows/:slug", async (c) => {
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
relationshipRoutes.get("/follows", async (c) => {
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

// ── Compatibility (Slice D) ─────────────────────────────────────────────────

relationshipRoutes.use("/compat/*", relationshipLimiter);

/**
 * GET /compat/:slug — overlap-first dancer↔DJ compatibility: how many of the viewer's liked
 * tracks live in this DJ's public repertoire (ALL published sets + promoted playlists — the
 * exact context set the Signature uses, via getDjRepertoire). Identity is SNAPSHOT-FIRST
 * (a wedge-era like carrying only a broadcast-time spotifyUrl still counts — matches the
 * journal's own resolution), then the strict-gated link. Per-viewer data — never cached under
 * a slug-only key (dj.ts doctrine).
 */
relationshipRoutes.get("/compat/:slug", async (c) => {
  const slug = c.req.param("slug") ?? "";
  if (slug.length === 0 || slug.length > 120) return c.json({ error: "Invalid slug" }, 400);
  const userId = getUser(c).id;
  try {
    const dj = await findUserBySlug(slug);
    if (!dj) return c.json({ error: "DJ not found" }, 404);

    const claimed = await getClaimedClientIds(userId);
    if (claimed.length === 0) {
      return c.json({ sharedCount: 0, viewerTrackCount: 0, topShared: [] });
    }

    const [likedRows, repertoire] = await Promise.all([
      db
        .select({
          artist: schema.playedTracks.artist,
          title: schema.playedTracks.title,
          albumArtUrl: schema.playedTracks.albumArtUrl,
          spotifyUrl: schema.playedTracks.spotifyUrl,
          linkProviderId: schema.trackLinks.providerId,
        })
        .from(schema.likes)
        .innerJoin(schema.playedTracks, eq(schema.likes.playedTrackId, schema.playedTracks.id))
        .leftJoin(schema.trackLinks, trustedSpotifyLinkOn())
        .where(inArray(schema.likes.clientId, claimed))
        .orderBy(desc(schema.likes.createdAt)) // most recently loved first → topShared ordering
        .limit(5000),
      getDjRepertoire(dj.id),
    ]);

    const seen = new Set<string>();
    const topShared: {
      title: string;
      artist: string;
      albumArtUrl: string | null;
      spotifyUrl: string;
    }[] = [];
    let sharedCount = 0;
    for (const row of likedRows) {
      const id = parseSpotifyTrackId(row.spotifyUrl) ?? row.linkProviderId ?? null;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      if (repertoire.ids.has(id)) {
        sharedCount += 1;
        if (topShared.length < 5) {
          topShared.push({
            title: row.title,
            artist: row.artist,
            albumArtUrl: row.albumArtUrl ?? null,
            spotifyUrl: row.spotifyUrl ?? `https://open.spotify.com/track/${id}`,
          });
        }
      }
    }
    return c.json({ sharedCount, viewerTrackCount: seen.size, topShared });
  } catch (error) {
    logger.error("Failed to compute compatibility", error);
    return c.json({ error: "Failed to compute compatibility" }, 500);
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
relationshipRoutes.get("/preferences", async (c) => {
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
relationshipRoutes.put("/preferences", zValidator("json", PreferencesBody), async (c) => {
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
