/**
 * Authed external-playlist embeds — `/api/dj/me/playlists*`.
 *
 * DJ-pasted PUBLIC Spotify playlists shown on the Booth (a plain iframe embed — distinct from the
 * catalog-seed `/me/playlists/import` in identity.ts, which shares the `/me/playlists` prefix but
 * never collides: `/me/playlists/:id` here is DELETE, `/me/playlists/import` there is POST).
 * Ownership-scoped in the WHERE; CSRF at the mount.
 */

import { LIMITS } from "@pika/shared";
import { and, count, desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { db, schema } from "../../db";
import { getUser, requireDjAuth } from "../../lib/auth";
import { invalidateCache } from "../../lib/cache";
import { parseSpotifyPlaylistId } from "../../lib/services/spotifyCatalog";
import { fetchSpotifyOembedTitle } from "../../lib/services/spotifyOembed";
import { MAX_DJ_PLAYLISTS } from "./constants";

export const embedRoutes = new Hono();

/** My embedded playlists (management list). */
embedRoutes.get("/me/playlists", requireDjAuth, async (c) => {
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
embedRoutes.post("/me/playlists", requireDjAuth, embedAddLimiter, async (c) => {
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
embedRoutes.delete("/me/playlists/:id", requireDjAuth, async (c) => {
  const me = getUser(c);
  const pid = Number(c.req.param("id"));
  if (!Number.isInteger(pid)) return c.json({ error: "Invalid id" }, 400);
  await db
    .delete(schema.djPlaylists)
    .where(and(eq(schema.djPlaylists.id, pid), eq(schema.djPlaylists.djUserId, me.id)));
  if (me.slug) invalidateCache(`dj-profile:${me.slug}`);
  return c.json({ success: true });
});
