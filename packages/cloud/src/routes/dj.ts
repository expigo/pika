/**
 * DJ Profile Routes
 *
 * Handles DJ profile API endpoints:
 * - GET /:slug - Get DJ profile by slug
 *
 * Extracted from index.ts for modularity.
 */

import { LIMITS, logger, SpotifyAudioFeaturesSchema, slugify } from "@pika/shared";
import { and, asc, count, desc, eq, gte, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { db, schema } from "../db";
import { getUser, requireDjAuth } from "../lib/auth";
import { invalidateCache, withCache } from "../lib/cache";
import {
  computeSignature,
  computeSignatureWithProgress,
  getBoothPlaylists,
} from "../lib/services/signature";
import { parseSpotifyPlaylistId } from "../lib/services/spotifyCatalog";
import { seedFromPlaylist } from "../lib/services/spotifyMatch";
import { fetchSpotifyOembedTitle } from "../lib/services/spotifyOembed";

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

// ── Authed profile management (Slice 5) — the DJ curates their own public /dj/[slug] ────────────────
// Per-route `requireDjAuth` (the router stays public for GET /:slug); scoped by `getUser(c).id`.
// CSRF is enforced at the mount (`app.use("/api/dj/*", csrfCheck)` in index.ts).
const MAX_DJ_PLAYLISTS = 24;
const MAX_DJ_GIGS = 24;

/** My sessions (incl. hidden) with their publish state — powers the /dj/live management list. */
dj.get("/me/sessions", requireDjAuth, async (c) => {
  const me = getUser(c);
  const rows = await db
    .select({
      id: schema.sessions.id,
      djName: schema.sessions.djName,
      startedAt: schema.sessions.startedAt,
      endedAt: schema.sessions.endedAt,
      published: schema.sessions.published,
      spotifyPlaylistId: schema.sessions.spotifyPlaylistId,
      spotifyPlaylistUrl: schema.sessions.spotifyPlaylistUrl,
    })
    .from(schema.sessions)
    .where(eq(schema.sessions.djUserId, me.id))
    .orderBy(desc(schema.sessions.startedAt))
    .limit(100);

  const ids = rows.map((s) => s.id);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const tc = await db
      .select({ sessionId: schema.playedTracks.sessionId, count: count() })
      .from(schema.playedTracks)
      .where(inArray(schema.playedTracks.sessionId, ids))
      .groupBy(schema.playedTracks.sessionId);
    for (const r of tc) if (r.sessionId) counts.set(r.sessionId, r.count);
  }

  return c.json({
    sessions: rows.map((s) => ({
      id: s.id,
      djName: s.djName,
      startedAt: s.startedAt?.toISOString() ?? null,
      endedAt: s.endedAt?.toISOString() ?? null,
      published: s.published,
      spotifyPlaylistId: s.spotifyPlaylistId,
      spotifyPlaylistUrl: s.spotifyPlaylistUrl,
      trackCount: counts.get(s.id) ?? 0,
    })),
  });
});

const PublishBody = z.object({ published: z.boolean() });

/** Show/hide one of my sessions on my public profile. */
dj.patch("/me/sessions/:id", requireDjAuth, async (c) => {
  const me = getUser(c);
  const parsed = PublishBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);
  const updated = await db
    .update(schema.sessions)
    .set({ published: parsed.data.published })
    .where(and(eq(schema.sessions.id, c.req.param("id")), eq(schema.sessions.djUserId, me.id)))
    .returning({ id: schema.sessions.id });
  if (updated.length === 0) return c.json({ error: "Session not found" }, 404); // not mine → hidden
  if (me.slug) invalidateCache(`dj-profile:${me.slug}`);
  return c.json({ success: true });
});

/** My embedded playlists (management list). */
dj.get("/me/playlists", requireDjAuth, async (c) => {
  const me = getUser(c);
  const rows = await db
    .select({
      id: schema.djPlaylists.id,
      url: schema.djPlaylists.url,
      spotifyPlaylistId: schema.djPlaylists.spotifyPlaylistId,
      title: schema.djPlaylists.title,
    })
    .from(schema.djPlaylists)
    .where(eq(schema.djPlaylists.djUserId, me.id))
    .orderBy(desc(schema.djPlaylists.createdAt));
  return c.json({ playlists: rows });
});

const AddPlaylistBody = z.object({ url: z.string().trim().min(1).max(400) });

// D.1: the add route now performs one bounded upstream oEmbed fetch, so it gets its own per-DJ
// limiter (mounted after requireDjAuth so the userId key exists — importLimiter precedent).
const embedAddLimiter = rateLimiter({
  windowMs: LIMITS.PLAYLIST_EMBED_ADD_RATE_LIMIT_WINDOW,
  limit: LIMITS.PLAYLIST_EMBED_ADD_RATE_LIMIT_MAX,
  standardHeaders: "draft-6",
  keyGenerator: (c) => {
    const user = c.get("user") as { id?: string } | undefined;
    return user?.id || c.req.header("CF-Connecting-IP") || "dj";
  },
  handler: (c) => c.json({ error: "Too many playlists added — try again in a minute" }, 429),
});

/** Add a public Spotify playlist to my profile. */
dj.post("/me/playlists", requireDjAuth, embedAddLimiter, async (c) => {
  const me = getUser(c);
  const parsed = AddPlaylistBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);
  const id = parseSpotifyPlaylistId(parsed.data.url);
  if (!id) return c.json({ error: "That doesn't look like a Spotify playlist link" }, 400);

  const [tally] = await db
    .select({ n: count() })
    .from(schema.djPlaylists)
    .where(eq(schema.djPlaylists.djUserId, me.id));
  if ((tally?.n ?? 0) >= MAX_DJ_PLAYLISTS) return c.json({ error: "Playlist limit reached" }, 409);

  // Best-effort display title (bounded 4s, null on any failure — the UI falls back gracefully).
  const title = await fetchSpotifyOembedTitle(id);

  await db
    .insert(schema.djPlaylists)
    .values({
      djUserId: me.id,
      url: `https://open.spotify.com/playlist/${id}`,
      spotifyPlaylistId: id,
      title,
    })
    .onConflictDoNothing(); // unique(dj_user_id, spotify_playlist_id) — adding twice is a no-op
  if (me.slug) invalidateCache(`dj-profile:${me.slug}`);
  return c.json({ success: true, spotifyPlaylistId: id, title });
});

/** Remove one of my embedded playlists. */
dj.delete("/me/playlists/:id", requireDjAuth, async (c) => {
  const me = getUser(c);
  const pid = Number(c.req.param("id"));
  if (!Number.isInteger(pid)) return c.json({ error: "Invalid id" }, 400);
  await db
    .delete(schema.djPlaylists)
    .where(and(eq(schema.djPlaylists.id, pid), eq(schema.djPlaylists.djUserId, me.id)));
  if (me.slug) invalidateCache(`dj-profile:${me.slug}`);
  return c.json({ success: true });
});

const SyncSessionPlaylistBody = z.object({
  spotifyPlaylistId: z.string().trim().min(1).max(400),
  spotifyPlaylistUrl: z.string().trim().max(400).optional(),
});

/**
 * Share (sync) the desktop-built Spotify playlist for one of my sets. The desktop POSTs its
 * shared-account playlist here; it then embeds on that set's recap + shows a badge on the profile
 * session row. Scoped to me (404 if the session isn't mine — indistinguishable from not-found).
 */
dj.post("/me/sessions/:id/playlist", requireDjAuth, async (c) => {
  const me = getUser(c);
  const parsed = SyncSessionPlaylistBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);
  const id = parseSpotifyPlaylistId(parsed.data.spotifyPlaylistId);
  if (!id) return c.json({ error: "That doesn't look like a Spotify playlist" }, 400);
  const url = parsed.data.spotifyPlaylistUrl?.trim() || `https://open.spotify.com/playlist/${id}`;

  const updated = await db
    .update(schema.sessions)
    .set({ spotifyPlaylistId: id, spotifyPlaylistUrl: url })
    .where(and(eq(schema.sessions.id, c.req.param("id")), eq(schema.sessions.djUserId, me.id)))
    .returning({ id: schema.sessions.id });
  if (updated.length === 0) return c.json({ error: "Session not found" }, 404);
  if (me.slug) invalidateCache(`dj-profile:${me.slug}`);
  return c.json({ success: true, spotifyPlaylistId: id });
});

/** Un-share the synced playlist from one of my sets. */
dj.delete("/me/sessions/:id/playlist", requireDjAuth, async (c) => {
  const me = getUser(c);
  const updated = await db
    .update(schema.sessions)
    .set({ spotifyPlaylistId: null, spotifyPlaylistUrl: null })
    .where(and(eq(schema.sessions.id, c.req.param("id")), eq(schema.sessions.djUserId, me.id)))
    .returning({ id: schema.sessions.id });
  if (updated.length === 0) return c.json({ error: "Session not found" }, 404);
  if (me.slug) invalidateCache(`dj-profile:${me.slug}`);
  return c.json({ success: true });
});

// ── Booth management (Slice C) — bio, public follower-count toggle, gigs ────────────────────────

/** My Booth content for the editor: bio, toggles, ALL gigs (incl. past), own follower count,
 * and the private Signature preview (computed regardless of the public toggle — the DJ sees
 * the card before dancers do) plus its floors progress. Progress is OWNER-ONLY: it must never
 * enter the slug-cached public payload (below-floors numbers don't ship publicly). */
dj.get("/me/booth", requireDjAuth, async (c) => {
  const me = getUser(c);
  const [[row], gigs, [tally], signatureWithProgress] = await Promise.all([
    db
      .select({
        bio: schema.user.bio,
        showFollowerCount: schema.user.showFollowerCount,
        showSignature: schema.user.showSignature,
      })
      .from(schema.user)
      .where(eq(schema.user.id, me.id))
      .limit(1),
    db
      .select({
        id: schema.djGigs.id,
        date: schema.djGigs.gigDate,
        title: schema.djGigs.title,
        city: schema.djGigs.city,
        url: schema.djGigs.url,
      })
      .from(schema.djGigs)
      .where(eq(schema.djGigs.djUserId, me.id))
      .orderBy(asc(schema.djGigs.gigDate)),
    db.select({ n: count() }).from(schema.djFollows).where(eq(schema.djFollows.djUserId, me.id)),
    computeSignatureWithProgress(me.id),
  ]);
  return c.json({
    bio: row?.bio ?? null,
    showFollowerCount: row?.showFollowerCount ?? false,
    showSignature: row?.showSignature ?? true,
    // The owner ALWAYS sees their count; the toggle only gates the public payload.
    followerCount: tally?.n ?? 0,
    gigs,
    signaturePreview: signatureWithProgress.signature,
    signatureProgress: signatureWithProgress.progress,
  });
});

const BoothBody = z
  .object({
    bio: z.string().trim().max(500).optional(),
    showFollowerCount: z.boolean().optional(),
    showSignature: z.boolean().optional(),
  })
  .refine(
    (b) =>
      b.bio !== undefined || b.showFollowerCount !== undefined || b.showSignature !== undefined,
    { message: "Nothing to update" },
  );

/** Update my Booth (bio and/or the public toggles). Plain text only. */
dj.patch("/me/booth", requireDjAuth, async (c) => {
  const me = getUser(c);
  const parsed = BoothBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);
  const set: { bio?: string | null; showFollowerCount?: boolean; showSignature?: boolean } = {};
  if (parsed.data.bio !== undefined) set.bio = parsed.data.bio.length > 0 ? parsed.data.bio : null;
  if (parsed.data.showFollowerCount !== undefined)
    set.showFollowerCount = parsed.data.showFollowerCount;
  if (parsed.data.showSignature !== undefined) set.showSignature = parsed.data.showSignature;
  await db.update(schema.user).set(set).where(eq(schema.user.id, me.id));
  if (me.slug) invalidateCache(`dj-profile:${me.slug}`);
  return c.json({ success: true });
});

const GigBody = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date"),
  title: z.string().trim().min(1).max(120),
  city: z.string().trim().max(80).optional(),
  // Bare domains ("budafest.com") get an https:// prefix so DJs don't have to type it; anything
  // already carrying a scheme is left as-is, so a non-web scheme (javascript:, data:) still fails
  // the http(s) regex rather than being silently rewritten into a valid-looking link.
  url: z.preprocess(
    (v) => {
      if (typeof v !== "string") return v;
      const t = v.trim();
      if (t === "") return undefined;
      if (/^https?:\/\//i.test(t)) return t;
      if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t; // has some other scheme → keep, regex rejects it
      return `https://${t}`;
    },
    z
      .string()
      .max(300)
      .regex(/^https?:\/\//i, "Enter a valid web address")
      .optional(),
  ),
});

/** Add an upcoming gig to my Booth ("I'll be at Budafest, Jan 15"). */
dj.post("/me/gigs", requireDjAuth, async (c) => {
  const me = getUser(c);
  const parsed = GigBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);

  const [tally] = await db
    .select({ n: count() })
    .from(schema.djGigs)
    .where(eq(schema.djGigs.djUserId, me.id));
  if ((tally?.n ?? 0) >= MAX_DJ_GIGS) return c.json({ error: "Gig limit reached" }, 409);

  const [gig] = await db
    .insert(schema.djGigs)
    .values({
      djUserId: me.id,
      gigDate: parsed.data.date,
      title: parsed.data.title,
      city: parsed.data.city?.length ? parsed.data.city : null,
      url: parsed.data.url?.length ? parsed.data.url : null,
    })
    .returning({ id: schema.djGigs.id });
  if (me.slug) invalidateCache(`dj-profile:${me.slug}`);
  return c.json({ success: true, id: gig?.id });
});

/** Remove one of my gigs. Ownership lives in the WHERE (not-found == not-yours). */
dj.delete("/me/gigs/:id", requireDjAuth, async (c) => {
  const me = getUser(c);
  const gid = Number(c.req.param("id"));
  if (!Number.isInteger(gid)) return c.json({ error: "Invalid id" }, 400);
  const deleted = await db
    .delete(schema.djGigs)
    .where(and(eq(schema.djGigs.id, gid), eq(schema.djGigs.djUserId, me.id)))
    .returning({ id: schema.djGigs.id });
  if (deleted.length === 0) return c.json({ error: "Gig not found" }, 404);
  if (me.slug) invalidateCache(`dj-profile:${me.slug}`);
  return c.json({ success: true });
});

/**
 * GET /me/crowd-pleasers (Slice D) — which of MY tracks drew the most floor love, across ALL my
 * sessions. DJ-PRIVATE surface → publish-agnostic (only publicly-ATTRIBUTED surfaces respect
 * `published`, per the locked provenance decisions). Legacy anonymous sessions (djUserId NULL)
 * are invisible here — documented limitation.
 */
dj.get("/me/crowd-pleasers", requireDjAuth, async (c) => {
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
dj.post("/me/playlists/import", requireDjAuth, importLimiter, async (c) => {
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
dj.get("/me/curated-playlists", requireDjAuth, async (c) => {
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
dj.patch("/me/curated-playlists/:id", requireDjAuth, async (c) => {
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
dj.delete("/me/curated-playlists/:id", requireDjAuth, async (c) => {
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

export { dj };
