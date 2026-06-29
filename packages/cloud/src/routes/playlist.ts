/**
 * Spotify playlist tools (B3) — the cloud half of the desktop "Build playlist" assist tool.
 *
 *   POST /api/playlist/search  → resolve one track (artist/title[+durationMs]) to ranked Spotify
 *                                candidates (app-token search + track_links cache)
 *   POST /api/playlist/create  → create a public playlist on the shared Pika account from confirmed
 *                                tracks; write-through DJ confirmations to the canonical cache
 *
 * Both require an authenticated DJ + the X-Pika-Client CSRF header (mounted under csrfCheck), and
 * are per-DJ rate-limited (each hits the Spotify API).
 */

import { getFuzzyKey, getTrackKey, logger } from "@pika/shared";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { getUser, requireDjAuth } from "../lib/auth";
import { createPlaylist, SpotifyServiceNotConnectedError } from "../lib/services/spotify";
import {
  cacheManualMatch,
  getSpotifyFeatures,
  resolveTrack,
  resolveTracks,
  searchAndRank,
} from "../lib/services/spotifyMatch";

const playlist = new Hono();

playlist.use("*", requireDjAuth);

// Each endpoint hits the Spotify API, so cap per-DJ (keyed by the authenticated user id; runs
// after requireDjAuth). Generous enough for a one-by-one set review of a long set.
const playlistLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 60,
  standardHeaders: "draft-6",
  keyGenerator: (c) => {
    const user = c.get("user") as { id?: string } | undefined;
    return user?.id || c.req.header("CF-Connecting-IP") || "dj";
  },
  handler: (c) => c.json({ error: "Too many requests — slow down" }, 429),
});

const SearchBody = z.object({
  artist: z.string().trim().min(1).max(500),
  title: z.string().trim().min(1).max(500),
  durationMs: z.number().int().positive().max(3_600_000).optional(),
});

const CreateBody = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().max(300).optional(),
  tracks: z
    .array(
      z.object({
        artist: z.string().trim().min(1).max(500),
        title: z.string().trim().min(1).max(500),
        spotifyId: z.string().trim().min(1).max(64),
        uri: z.string().trim().min(1).max(128),
      }),
    )
    .min(1)
    .max(500),
});

/** Resolve a pasted Spotify track id → a single candidate (the "paste a link" override). */
playlist.post("/resolve", playlistLimiter, async (c) => {
  const parsed = z
    .object({ spotifyId: z.string().trim().min(1).max(64) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid track id" }, 400);
  try {
    const candidate = await resolveTrack(parsed.data.spotifyId);
    if (!candidate) return c.json({ error: "Track not found" }, 404);
    return c.json({ candidate });
  } catch (e) {
    logger.error("Spotify track resolve failed", e);
    return c.json({ error: "Spotify lookup failed" }, 502);
  }
});

/** Resolve many track ids → candidates (backfills album art for remembered matches). */
playlist.post("/resolve-batch", playlistLimiter, async (c) => {
  const parsed = z
    .object({ ids: z.array(z.string().trim().min(1).max(64)).min(1).max(50) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid ids" }, 400);
  try {
    return c.json({ candidates: await resolveTracks(parsed.data.ids) });
  } catch (e) {
    logger.error("Spotify batch resolve failed", e);
    return c.json({ error: "Spotify lookup failed" }, 502);
  }
});

/** Canonical Spotify audio features for a batch of track ids (desktop reads these by spotify_id to
 *  display Spotify features beside its own Pika features). Pure DB read — no Spotify call. */
playlist.post("/features", async (c) => {
  const parsed = z
    .object({ ids: z.array(z.string().trim().min(1).max(64)).min(1).max(100) })
    .safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid ids" }, 400);
  try {
    return c.json({ features: await getSpotifyFeatures(parsed.data.ids) });
  } catch (e) {
    logger.error("Spotify features lookup failed", e);
    return c.json({ error: "Features lookup failed" }, 502);
  }
});

/** Resolve one track → ranked Spotify candidates (recommended first). */
playlist.post("/search", playlistLimiter, async (c) => {
  const parsed = SearchBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "Invalid search", issues: parsed.error.issues }, 400);
  }
  try {
    return c.json(await searchAndRank(parsed.data));
  } catch (e) {
    logger.error("Spotify search failed", e);
    return c.json({ error: "Spotify search failed" }, 502);
  }
});

/** Create the playlist on the shared account + record the DJ's confirmations in the canonical cache. */
playlist.post("/create", playlistLimiter, async (c) => {
  const parsed = CreateBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) {
    return c.json({ error: "Invalid playlist", issues: parsed.error.issues }, 400);
  }
  const { name, description, tracks } = parsed.data;

  try {
    const result = await createPlaylist(
      name,
      tracks.map((t) => t.uri),
      description,
    );
    // Slice 4: write-through the DJ's confirmed matches to the canonical cache (authoritative).
    await Promise.allSettled(
      tracks.map((t) =>
        cacheManualMatch(
          getTrackKey(t.artist, t.title),
          getFuzzyKey(t.artist, t.title),
          t.spotifyId,
          `https://open.spotify.com/track/${t.spotifyId}`,
        ),
      ),
    );
    logger.info("🎶 Playlist created", { dj: getUser(c).id, name, count: tracks.length });
    return c.json({ success: true, ...result });
  } catch (e) {
    if (e instanceof SpotifyServiceNotConnectedError) {
      return c.json({ error: "Playlist service not connected", needsService: true }, 409);
    }
    logger.error("Create playlist failed", e);
    return c.json({ error: "Failed to create playlist" }, 502);
  }
});

export { playlist as playlistRoutes };
