/**
 * Catalog seed tool (B3) — admin-only. Reads a WCS DJ's PUBLIC Spotify playlists via the app token
 * (no DJ OAuth) so the owner can curate which playlists feed the catalog, then seeds `curated_tracks`
 * (the DJ's repertoire) + `track_links` (matching head-start). Mounted under /api/admin/* (CSRF +
 * admin gate). Owner-driven for the pilot; DJ self-serve is a later evolution.
 */

import { logger } from "@pika/shared";
import { Hono } from "hono";
import { z } from "zod";
import { requireAdmin } from "../lib/auth";
import {
  fetchPlaylistTracks,
  fetchUserPlaylists,
  parseSpotifyUserId,
} from "../lib/services/spotifyCatalog";
import { seedFromPlaylist } from "../lib/services/spotifyMatch";

const seed = new Hono();

seed.use("*", requireAdmin);

/** List a DJ's public playlists from their profile link. */
seed.get("/playlists", async (c) => {
  const userId = parseSpotifyUserId(c.req.query("profile") ?? "");
  if (!userId) return c.json({ error: "Invalid Spotify profile link" }, 400);
  try {
    return c.json({ userId, playlists: await fetchUserPlaylists(userId) });
  } catch (e) {
    logger.error("seed: list playlists failed", e);
    return c.json({ error: "Could not read playlists — is the profile public?" }, 502);
  }
});

/** Preview a playlist's tracks before seeding. */
seed.get("/playlist/:id/tracks", async (c) => {
  try {
    return c.json({ tracks: await fetchPlaylistTracks(c.req.param("id")) });
  } catch (e) {
    logger.error("seed: read tracks failed", e);
    return c.json({ error: "Could not read playlist tracks" }, 502);
  }
});

const CurateBody = z.object({
  djUserId: z.string().min(1),
  playlistName: z.string().max(200).optional(),
  tracks: z
    .array(
      z.object({
        spotifyId: z.string().min(1).max(64),
        uri: z.string().min(1).max(128),
        name: z.string().min(1).max(500),
        artists: z.string().min(1).max(500),
        durationMs: z.number().int().positive().optional(),
        albumArtUrl: z.string().url().optional(),
      }),
    )
    .min(1)
    .max(1000),
});

/** Seed the chosen tracks into the catalog, attributed to `djUserId`. */
seed.post("/curate", async (c) => {
  const parsed = CurateBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid seed", issues: parsed.error.issues }, 400);
  try {
    const seeded = await seedFromPlaylist(
      parsed.data.djUserId,
      parsed.data.playlistName ?? "",
      parsed.data.tracks,
    );
    return c.json({ success: true, seeded });
  } catch (e) {
    logger.error("seed: curate failed", e);
    return c.json({ error: "Seed failed (unknown DJ, or Spotify error)" }, 502);
  }
});

export { seed as seedRoutes };
