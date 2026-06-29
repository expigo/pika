/**
 * Spotify features service (desktop) — local-first read of Spotify's canonical audio-features by
 * `spotify_id`, so the UI can show them beside the Pika sidecar features. Reads the local mirror
 * first and fetches only the missing ids from the cloud (`/api/playlist/features`), caching them.
 * Cache-first with no TTL (features are static). Coverage is limited to the cloud's seeded catalog.
 */

import type { SpotifyAudioFeatures } from "@pika/shared";
import {
  type SpotifyFeatureRow,
  spotifyFeaturesRepository,
} from "../db/repositories/spotifyFeaturesRepository";
import { logger } from "../utils/logger";
import { fetchSpotifyFeatures } from "./spotifyPlaylist";

const FETCH_BATCH = 100; // matches the cloud endpoint's id cap

/** A cached row → the lean features object (drop nulls + bookkeeping fields). */
function rowToFeatures(row: SpotifyFeatureRow): SpotifyAudioFeatures {
  const f: SpotifyAudioFeatures = {};
  if (row.tempo != null) f.tempo = row.tempo;
  if (row.keyPitch != null) f.keyPitch = row.keyPitch;
  if (row.mode != null) f.mode = row.mode;
  if (row.energy != null) f.energy = row.energy;
  if (row.danceability != null) f.danceability = row.danceability;
  if (row.valence != null) f.valence = row.valence;
  if (row.acousticness != null) f.acousticness = row.acousticness;
  if (row.instrumentalness != null) f.instrumentalness = row.instrumentalness;
  if (row.liveness != null) f.liveness = row.liveness;
  if (row.speechiness != null) f.speechiness = row.speechiness;
  if (row.loudness != null) f.loudness = row.loudness;
  if (row.timeSignature != null) f.timeSignature = row.timeSignature;
  if (row.popularity != null) f.popularity = row.popularity;
  if (row.releaseDate != null) f.releaseDate = row.releaseDate;
  if (row.genres != null) f.genres = row.genres;
  if (row.recordLabel != null) f.recordLabel = row.recordLabel;
  return f;
}

/** Features fetched from the cloud → a cache row (null-filled + stamped). */
function featuresToRow(spotifyId: string, f: SpotifyAudioFeatures): SpotifyFeatureRow {
  return {
    spotifyId,
    tempo: f.tempo ?? null,
    keyPitch: f.keyPitch ?? null,
    mode: f.mode ?? null,
    energy: f.energy ?? null,
    danceability: f.danceability ?? null,
    valence: f.valence ?? null,
    acousticness: f.acousticness ?? null,
    instrumentalness: f.instrumentalness ?? null,
    liveness: f.liveness ?? null,
    speechiness: f.speechiness ?? null,
    loudness: f.loudness ?? null,
    timeSignature: f.timeSignature ?? null,
    popularity: f.popularity ?? null,
    releaseDate: f.releaseDate ?? null,
    genres: f.genres ?? null,
    recordLabel: f.recordLabel ?? null,
    fetchedAt: Math.floor(Date.now() / 1000),
  };
}

/**
 * Resolve Spotify features for the given ids. Returns a map of only the ids we actually have features
 * for (a track absent from the seeded catalog simply won't appear). Cache hits avoid the network;
 * misses are fetched and cached. A failed fetch degrades to cache-only (no throw).
 */
export async function getFeaturesForTracks(
  spotifyIds: string[],
): Promise<Map<string, SpotifyAudioFeatures>> {
  const ids = [...new Set(spotifyIds.filter(Boolean))];
  const out = new Map<string, SpotifyAudioFeatures>();
  if (ids.length === 0) return out;

  // 1. Local cache.
  const cached = await spotifyFeaturesRepository.getByIds(ids);
  const haveRows = new Set(cached.map((r) => r.spotifyId));
  for (const row of cached) out.set(row.spotifyId, rowToFeatures(row));

  // 2. Fetch the rest from the cloud (chunked), cache, and merge.
  const missing = ids.filter((id) => !haveRows.has(id));
  for (let i = 0; i < missing.length; i += FETCH_BATCH) {
    const batch = missing.slice(i, i + FETCH_BATCH);
    try {
      const { features } = await fetchSpotifyFeatures(batch);
      const rows: SpotifyFeatureRow[] = [];
      for (const [id, f] of Object.entries(features)) {
        out.set(id, f);
        rows.push(featuresToRow(id, f));
      }
      if (rows.length > 0) await spotifyFeaturesRepository.upsertMany(rows);
    } catch (e) {
      // Offline / cloud error → keep whatever we had cached; don't fail the UI.
      logger.warn("Spotify", "features fetch failed; using cache only", e);
    }
  }

  return out;
}
