/**
 * Catalog seed tool (B3) — admin-only. Reads a WCS DJ's PUBLIC Spotify playlists via the app token
 * (no DJ OAuth) so the owner can curate which playlists feed the catalog, then seeds `curated_tracks`
 * (the DJ's repertoire) + `track_links` (matching head-start). Mounted under /api/admin/* (CSRF +
 * admin gate). Owner-driven for the pilot; DJ self-serve is a later evolution.
 */

import { logger, SpotifyAudioFeaturesSchema } from "@pika/shared";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { requireAdmin } from "../lib/auth";
import { SpotifyServiceNotConnectedError } from "../lib/services/spotify";
import {
  fetchPlaylistTracks,
  fetchUserPlaylists,
  parseSpotifyUserId,
} from "../lib/services/spotifyCatalog";
import { seedFromPlaylist } from "../lib/services/spotifyMatch";

const seed = new Hono();

seed.use("*", requireAdmin);

// Catalog reads use the SERVICE account's user token (Spotify forbids the app token on user
// playlists). If it isn't connected (with the read scopes), tell the admin to (re)connect it.
function readError(c: Context, e: unknown) {
  if (e instanceof SpotifyServiceNotConnectedError) {
    return c.json(
      {
        error: "Connect the playlist service account first (with read access)",
        needsService: true,
      },
      409,
    );
  }
  logger.error("seed: Spotify read failed", e);
  return c.json(
    {
      error: `Spotify read failed (${e instanceof Error ? e.message : "unknown"}) — is the profile public?`,
    },
    502,
  );
}

/** List a DJ's public playlists from their profile link. */
seed.get("/playlists", async (c) => {
  const userId = parseSpotifyUserId(c.req.query("profile") ?? "");
  if (!userId) return c.json({ error: "Invalid Spotify profile link" }, 400);
  try {
    return c.json({ userId, playlists: await fetchUserPlaylists(userId) });
  } catch (e) {
    return readError(c, e);
  }
});

/** Preview a playlist's tracks before seeding. */
seed.get("/playlist/:id/tracks", async (c) => {
  try {
    return c.json({ tracks: await fetchPlaylistTracks(c.req.param("id")) });
  } catch (e) {
    return readError(c, e);
  }
});

const CurateBody = z.object({
  djUserId: z.string().min(1),
  playlistName: z.string().max(200).optional(),
  // Which CSV tool produced `features` — drives accretive-merge precision precedence cloud-side.
  featuresSource: z.enum(["exportify", "chosic", "csv"]).optional(),
  tracks: z
    .array(
      z.object({
        spotifyId: z.string().min(1).max(64),
        uri: z.string().min(1).max(128),
        name: z.string().min(1).max(500),
        artists: z.string().min(1).max(500),
        durationMs: z.number().int().positive().optional(),
        albumArtUrl: z.string().url().optional(),
        // Canonical Spotify audio features (CSV import only; profile-load omits these).
        features: SpotifyAudioFeaturesSchema.optional(),
      }),
    )
    .min(1)
    .max(2000), // a whole Exportify playlist in one call (seedFromPlaylist batch-upserts it)
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
      "csv",
      parsed.data.featuresSource ?? "csv",
    );
    return c.json({ success: true, seeded: seeded.trackCount });
  } catch (e) {
    logger.error("seed: curate failed", e);
    return c.json({ error: "Seed failed (unknown DJ, or Spotify error)" }, 502);
  }
});

export { seed as seedRoutes };
