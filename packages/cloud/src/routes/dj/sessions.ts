/**
 * Authed session curation — `/api/dj/me/sessions*`.
 *
 * The DJ's own set list (incl. hidden), publish toggle, and the desktop-built playlist sync.
 * Every mutation is ownership-scoped in the WHERE (`djUserId = me.id`) → not-mine == 404.
 * CSRF is enforced at the mount (`app.use("/api/dj/*", csrfCheck)` in index.ts).
 */

import { and, count, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, schema } from "../../db";
import { getUser, requireDjAuth } from "../../lib/auth";
import { invalidateCache } from "../../lib/cache";
import { parseSpotifyPlaylistId } from "../../lib/services/spotifyCatalog";

export const sessionRoutes = new Hono();

/** My sessions (incl. hidden) with their publish state — powers the /dj/live management list. */
sessionRoutes.get("/me/sessions", requireDjAuth, async (c) => {
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
sessionRoutes.patch("/me/sessions/:id", requireDjAuth, async (c) => {
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

const SyncSessionPlaylistBody = z.object({
  spotifyPlaylistId: z.string().trim().min(1).max(400),
  spotifyPlaylistUrl: z.string().trim().max(400).optional(),
});

/**
 * Share (sync) the desktop-built Spotify playlist for one of my sets. The desktop POSTs its
 * shared-account playlist here; it then embeds on that set's recap + shows a badge on the profile
 * session row. Scoped to me (404 if the session isn't mine — indistinguishable from not-found).
 */
sessionRoutes.post("/me/sessions/:id/playlist", requireDjAuth, async (c) => {
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
sessionRoutes.delete("/me/sessions/:id/playlist", requireDjAuth, async (c) => {
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
