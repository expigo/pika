/**
 * Authed musical-identity engine (Slice D) — crowd-pleasers + DJ playlist import + curated-playlist
 * management under `/api/dj/me/*`.
 *
 * NOTE `/me/playlists/import` (POST) shares the `/me/playlists` prefix with embeds.ts's
 * `/me/playlists/:id` (DELETE) — they never collide (different method + depth). Keep it a POST.
 * Ownership is in the WHERE; CSRF at the mount.
 */

import { LIMITS, logger, SpotifyAudioFeaturesSchema } from "@pika/shared";
import { and, count, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { db, schema } from "../../db";
import { getUser, requireDjAuth } from "../../lib/auth";
import { invalidateCache } from "../../lib/cache";
import { seedFromPlaylist } from "../../lib/services/spotifyMatch";

export const identityRoutes = new Hono();

/**
 * GET /me/crowd-pleasers (Slice D) — which of MY tracks drew the most floor love, across ALL my
 * sessions. DJ-PRIVATE surface → publish-agnostic (only publicly-ATTRIBUTED surfaces respect
 * `published`, per the locked provenance decisions). Legacy anonymous sessions (djUserId NULL)
 * are invisible here — documented limitation.
 */
identityRoutes.get("/me/crowd-pleasers", requireDjAuth, async (c) => {
  const me = getUser(c);
  const trackKeyExpr = sql`coalesce(${schema.playedTracks.matchKey}, ${schema.playedTracks.artist} || '::' || ${schema.playedTracks.title})`;
  const [tracks, [totals]] = await Promise.all([
    db
      .select({
        artist: sql<string>`max(${schema.playedTracks.artist})`,
        title: sql<string>`max(${schema.playedTracks.title})`,
        albumArtUrl: sql<string | null>`max(${schema.playedTracks.albumArtUrl})`,
        spotifyUrl: sql<string | null>`max(${schema.playedTracks.spotifyUrl})`,
        plays: sql<number>`count(distinct ${schema.playedTracks.id})::int`,
        likes: sql<number>`count(${schema.likes.id})::int`,
      })
      .from(schema.playedTracks)
      .innerJoin(schema.sessions, eq(schema.playedTracks.sessionId, schema.sessions.id))
      .leftJoin(schema.likes, eq(schema.likes.playedTrackId, schema.playedTracks.id))
      .where(eq(schema.sessions.djUserId, me.id))
      .groupBy(trackKeyExpr)
      .having(sql`count(${schema.likes.id}) > 0`)
      .orderBy(sql`count(${schema.likes.id}) desc`)
      .limit(LIMITS.CROWD_PLEASERS_TOP_N),
    db
      .select({
        sessions: sql<number>`count(distinct ${schema.sessions.id})::int`,
        likes: sql<number>`count(${schema.likes.id})::int`,
        dancers: sql<number>`count(distinct ${schema.likes.clientId})::int`,
      })
      .from(schema.sessions)
      .leftJoin(schema.playedTracks, eq(schema.playedTracks.sessionId, schema.sessions.id))
      .leftJoin(schema.likes, eq(schema.likes.playedTrackId, schema.playedTracks.id))
      .where(eq(schema.sessions.djUserId, me.id)),
  ]);
  return c.json({
    totals: totals ?? { sessions: 0, likes: 0, dancers: 0 },
    tracks: tracks.map((t) => ({
      ...t,
      likesPerPlay: t.plays > 0 ? Math.round((t.likes / t.plays) * 10) / 10 : 0,
    })),
  });
});

// ── Playlist import + curated-playlist management (Slice D) ─────────────────────────────────────

// Per-DJ import limiter — mounted per-route AFTER requireDjAuth so the userId key exists
// (dj-live.ts engagementLimiter precedent).
const importLimiter = rateLimiter({
  windowMs: LIMITS.PLAYLIST_IMPORT_RATE_LIMIT_WINDOW,
  limit: LIMITS.PLAYLIST_IMPORT_RATE_LIMIT_MAX,
  standardHeaders: "draft-6",
  keyGenerator: (c) => {
    const user = c.get("user") as { id?: string } | undefined;
    return user?.id || c.req.header("CF-Connecting-IP") || "dj";
  },
  handler: (c) => c.json({ error: "Import limit reached — try again in an hour" }, 429),
});

const ImportBody = z.object({
  name: z.string().trim().min(1).max(120),
  featuresSource: z.enum(["exportify", "chosic", "csv"]).optional(),
  // Same track shape the admin seed accepts (routes/seed.ts CurateBody) — the client parses the
  // CSV with the @pika/shared parsers; the server only ever sees validated rows.
  tracks: z
    .array(
      z.object({
        spotifyId: z.string().min(1).max(64),
        uri: z.string().min(1).max(128),
        name: z.string().min(1).max(500),
        artists: z.string().min(1).max(500),
        durationMs: z.number().int().positive().optional(),
        albumArtUrl: z.string().url().optional(),
        features: SpotifyAudioFeaturesSchema.optional(),
      }),
    )
    .min(1)
    .max(LIMITS.PLAYLIST_IMPORT_MAX_TRACKS),
});

/**
 * POST /me/playlists/import — DJ-facing CSV import (Slice D). Provenance is 'csv' (self-asserted
 * → "DJ's pick" badge), and the identity spine is written with linkMode:"fill": a DJ's import
 * must never overwrite `track_links` rows that other dancers' journals/exports/compat already
 * trust (see seedFromPlaylist). Re-importing the same name is the dual-CSV accretion path —
 * Exportify + Chosic in any order.
 */
identityRoutes.post("/me/playlists/import", requireDjAuth, importLimiter, async (c) => {
  const me = getUser(c);
  const parsed = ImportBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);

  // Cap NEW names only — a re-import of an existing name must always work (accretive merge),
  // even for a DJ at the cap.
  const [existing] = await db
    .select({ id: schema.curatedPlaylists.id })
    .from(schema.curatedPlaylists)
    .where(
      and(
        eq(schema.curatedPlaylists.djUserId, me.id),
        eq(schema.curatedPlaylists.name, parsed.data.name),
      ),
    )
    .limit(1);
  if (!existing) {
    const [tally] = await db
      .select({ n: count() })
      .from(schema.curatedPlaylists)
      .where(eq(schema.curatedPlaylists.djUserId, me.id));
    if ((tally?.n ?? 0) >= LIMITS.MAX_CURATED_PLAYLISTS_PER_DJ) {
      return c.json({ error: "Playlist limit reached" }, 409);
    }
  }

  try {
    const seeded = await seedFromPlaylist(
      me.id,
      parsed.data.name,
      parsed.data.tracks,
      "csv",
      parsed.data.featuresSource ?? "csv",
      { linkMode: "fill" },
    );
    // Audit trail for the identity-spine residual: new matchKeys are DJ-seedable by design.
    logger.info("🎛️ DJ playlist import", {
      djUserId: me.id,
      playlistId: seeded.playlistId,
      tracks: seeded.trackCount,
    });
    if (me.slug) invalidateCache(`dj-profile:${me.slug}`);
    return c.json({
      playlistId: seeded.playlistId,
      trackCount: seeded.trackCount,
      featureCount: parsed.data.tracks.filter((t) => t.features).length,
    });
  } catch (e) {
    logger.error("DJ playlist import failed", e);
    return c.json({ error: "Import failed" }, 502);
  }
});

/** My curated playlists (manager list) with track + feature-coverage counts. */
identityRoutes.get("/me/curated-playlists", requireDjAuth, async (c) => {
  const me = getUser(c);
  const rows = await db
    .select({
      id: schema.curatedPlaylists.id,
      name: schema.curatedPlaylists.name,
      source: schema.curatedPlaylists.source,
      showOnBooth: schema.curatedPlaylists.showOnBooth,
      label: schema.curatedPlaylists.label,
      kind: schema.curatedPlaylists.kind,
      spotifyUrl: schema.curatedPlaylists.spotifyUrl,
    })
    .from(schema.curatedPlaylists)
    .where(eq(schema.curatedPlaylists.djUserId, me.id))
    .orderBy(desc(schema.curatedPlaylists.updatedAt));
  if (rows.length === 0) return c.json({ playlists: [] });

  // Grouped counts, not correlated projection subqueries (drizzle renders embedded column refs
  // unqualified inside projection sql`` — see getBoothPlaylists).
  const ids = rows.map((r) => r.id);
  const [countRows, featureRows] = await Promise.all([
    db
      .select({
        playlistId: schema.curatedPlaylistTracks.playlistId,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.curatedPlaylistTracks)
      .where(inArray(schema.curatedPlaylistTracks.playlistId, ids))
      .groupBy(schema.curatedPlaylistTracks.playlistId),
    db
      .select({
        playlistId: schema.curatedPlaylistTracks.playlistId,
        n: sql<number>`count(*)::int`,
      })
      .from(schema.curatedPlaylistTracks)
      .innerJoin(
        schema.spotifyTrackFeatures,
        and(
          eq(schema.spotifyTrackFeatures.spotifyId, schema.curatedPlaylistTracks.spotifyId),
          isNotNull(schema.spotifyTrackFeatures.tempo),
        ),
      )
      .where(inArray(schema.curatedPlaylistTracks.playlistId, ids))
      .groupBy(schema.curatedPlaylistTracks.playlistId),
  ]);
  const counts = new Map(countRows.map((r) => [r.playlistId, r.n]));
  const features = new Map(featureRows.map((r) => [r.playlistId, r.n]));
  return c.json({
    playlists: rows.map((r) => ({
      ...r,
      trackCount: counts.get(r.id) ?? 0,
      // "How sharp will my Signature be" hint — tracks with a real features row.
      featureCount: features.get(r.id) ?? 0,
    })),
  });
});

const CuratedPatchBody = z
  .object({
    showOnBooth: z.boolean().optional(),
    label: z.string().trim().max(120).optional(),
    kind: z.enum(["set", "crate"]).nullable().optional(),
    spotifyUrl: z
      .union([
        z.literal(""),
        z
          .string()
          .trim()
          .max(300)
          .regex(/^https:\/\/open\.spotify\.com\//, "Must be an open.spotify.com link"),
      ])
      .optional(),
  })
  .refine(
    (b) =>
      b.showOnBooth !== undefined ||
      b.label !== undefined ||
      b.kind !== undefined ||
      b.spotifyUrl !== undefined,
    { message: "Nothing to update" },
  );

/**
 * PATCH /me/curated-playlists/:id — promote/demote (`showOnBooth` is the one dial for imports:
 * it gates BOTH the public Booth render AND the Signature's imported contexts) + narrative
 * metadata (label/kind are display-only, never weighted). Ownership lives in the WHERE.
 */
identityRoutes.patch("/me/curated-playlists/:id", requireDjAuth, async (c) => {
  const me = getUser(c);
  const pid = Number(c.req.param("id"));
  if (!Number.isInteger(pid)) return c.json({ error: "Invalid id" }, 400);
  const parsed = CuratedPatchBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);

  const set: {
    showOnBooth?: boolean;
    label?: string | null;
    kind?: string | null;
    spotifyUrl?: string | null;
  } = {};
  if (parsed.data.showOnBooth !== undefined) set.showOnBooth = parsed.data.showOnBooth;
  if (parsed.data.label !== undefined)
    set.label = parsed.data.label.length > 0 ? parsed.data.label : null;
  if (parsed.data.kind !== undefined) set.kind = parsed.data.kind;
  if (parsed.data.spotifyUrl !== undefined)
    set.spotifyUrl = parsed.data.spotifyUrl.length > 0 ? parsed.data.spotifyUrl : null;

  const updated = await db
    .update(schema.curatedPlaylists)
    .set(set)
    .where(and(eq(schema.curatedPlaylists.id, pid), eq(schema.curatedPlaylists.djUserId, me.id)))
    .returning({ id: schema.curatedPlaylists.id });
  if (updated.length === 0) return c.json({ error: "Playlist not found" }, 404);
  if (me.slug) invalidateCache(`dj-profile:${me.slug}`);
  return c.json({ success: true });
});

/**
 * DELETE /me/curated-playlists/:id — removes the playlist + memberships (FK cascade).
 * Deliberately does NOT touch `curated_tracks` / `spotify_track_features` — that's the shared
 * corpus other features (catalog, Signature, consensus) read.
 */
identityRoutes.delete("/me/curated-playlists/:id", requireDjAuth, async (c) => {
  const me = getUser(c);
  const pid = Number(c.req.param("id"));
  if (!Number.isInteger(pid)) return c.json({ error: "Invalid id" }, 400);
  const deleted = await db
    .delete(schema.curatedPlaylists)
    .where(and(eq(schema.curatedPlaylists.id, pid), eq(schema.curatedPlaylists.djUserId, me.id)))
    .returning({ id: schema.curatedPlaylists.id });
  if (deleted.length === 0) return c.json({ error: "Playlist not found" }, 404);
  if (me.slug) invalidateCache(`dj-profile:${me.slug}`);
  return c.json({ success: true });
});
