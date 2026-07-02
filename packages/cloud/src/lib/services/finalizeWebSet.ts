/**
 * Finalize a web (Track-D) broadcast set at session end.
 *
 * A web broadcast is Spotify-native: every played track already carries its real Spotify URL, so at
 * session end we can (1) auto-build a shareable Spotify playlist of the set and (2) feed those plays
 * into the Songs Catalog as identity-only entries — both from data we already persisted, with no
 * matching. The DJ's own Track-D token is read-only (`user-read-currently-playing`), so the playlist
 * is created on the shared Pika service account (same as the desktop flow).
 *
 * Everything here is best-effort: failures are logged, never thrown — the caller ends the session
 * regardless, and the playlist/catalog are non-critical enrichment.
 */

import { logger } from "@pika/shared";
import { and, asc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "../../db";
import { playedTracks, sessions, user } from "../../db/schema";
import { invalidateCache } from "../cache";
import { createPlaylist, SpotifyServiceNotConnectedError } from "./spotify";
import { type SeedTrack, seedFromPlaylist } from "./spotifyMatch";

/** A set shorter than this won't auto-create a playlist or seed the catalog (avoids trivial noise). */
const MIN_TRACKS = 3;

/** Extract the Spotify track id from an `open.spotify.com/track/<id>` URL (ignores query/hash). */
export function parseSpotifyTrackId(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/track\/([A-Za-z0-9]+)/);
  return m ? (m[1] ?? null) : null;
}

/** A persisted play, reduced to the columns needed to rebuild its Spotify identity. */
export interface PlayRow {
  artist: string;
  title: string;
  albumArtUrl: string | null;
  spotifyUrl: string | null;
}

/**
 * Turn persisted plays into de-duped `SeedTrack`s in play order. Pure (no I/O): skips rows without a
 * parseable Spotify id and collapses repeats (a track played twice) to its first appearance. Carries
 * identity only — no `features`, so Spotify canonical features stay CSV-seeded.
 */
export function tracksFromPlays(rows: PlayRow[]): SeedTrack[] {
  const seen = new Set<string>();
  const tracks: SeedTrack[] = [];
  for (const r of rows) {
    const id = parseSpotifyTrackId(r.spotifyUrl);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    tracks.push({
      spotifyId: id,
      uri: `spotify:track:${id}`,
      name: r.title,
      artists: r.artist,
      albumArtUrl: r.albumArtUrl ?? undefined,
    });
  }
  return tracks;
}

/** Reconstruct the set's Spotify tracks (in play order, de-duped by id) from persisted plays. */
async function reconstructSetTracks(sessionId: string): Promise<SeedTrack[]> {
  const rows = await db
    .select({
      artist: playedTracks.artist,
      title: playedTracks.title,
      albumArtUrl: playedTracks.albumArtUrl,
      spotifyUrl: playedTracks.spotifyUrl,
    })
    .from(playedTracks)
    .where(and(eq(playedTracks.sessionId, sessionId), isNotNull(playedTracks.spotifyUrl)))
    .orderBy(asc(playedTracks.playedAt));
  return tracksFromPlays(rows);
}

/**
 * Auto-build the set playlist + feed the catalog for a just-ended web-broadcast session. Best-effort;
 * never throws. Fire-and-forget from the poller so it doesn't delay the session-end response.
 */
export async function finalizeWebSet(
  sessionId: string,
  djUserId: string,
  djName: string,
): Promise<void> {
  let tracks: SeedTrack[];
  try {
    tracks = await reconstructSetTracks(sessionId);
  } catch (e) {
    logger.error("finalizeWebSet: failed to read set tracks", e);
    return;
  }
  if (tracks.length < MIN_TRACKS) return;

  // #3a — feed the catalog as identity-only rows (features null until a later CSV/enrichment pass).
  // Empty playlistName → no curated_playlists entity, just the repertoire + track_links edges.
  try {
    await seedFromPlaylist(djUserId, "", tracks, "profile");
  } catch (e) {
    logger.error("finalizeWebSet: catalog feed failed", e);
  }

  // #2 — auto-create the set playlist on the shared account and sync it to the profile/recap.
  try {
    await buildSetPlaylist(sessionId, djUserId, djName, tracks);
  } catch (e) {
    if (e instanceof SpotifyServiceNotConnectedError) {
      logger.info("finalizeWebSet: playlist skipped — service account not connected", {
        sessionId,
      });
    } else {
      logger.error("finalizeWebSet: playlist build failed", e);
    }
  }
}

async function buildSetPlaylist(
  sessionId: string,
  djUserId: string,
  djName: string,
  tracks: SeedTrack[],
): Promise<void> {
  // Don't clobber an already-synced (e.g. desktop-built) playlist for this session.
  const [existing] = await db
    .select({ spotifyPlaylistId: sessions.spotifyPlaylistId })
    .from(sessions)
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!existing || existing.spotifyPlaylistId) return;

  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const { playlistId, playlistUrl } = await createPlaylist(
    `${djName} — ${date}`,
    tracks.map((t) => t.uri),
    `${djName}'s live set on Pika · pika.stream`,
  );

  // Guard the write with `spotify_playlist_id IS NULL` so a concurrent sync can't be overwritten.
  const updated = await db
    .update(sessions)
    .set({ spotifyPlaylistId: playlistId, spotifyPlaylistUrl: playlistUrl })
    .where(and(eq(sessions.id, sessionId), isNull(sessions.spotifyPlaylistId)))
    .returning({ id: sessions.id });
  if (updated.length === 0) return; // lost the race — leave the winner's playlist in place

  const [dj] = await db
    .select({ slug: user.slug })
    .from(user)
    .where(eq(user.id, djUserId))
    .limit(1);
  if (dj?.slug) invalidateCache(`dj-profile:${dj.slug}`);
  logger.info("🎵 Web set playlist created", { sessionId, playlistId, tracks: tracks.length });
}
