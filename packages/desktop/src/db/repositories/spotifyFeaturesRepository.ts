import type { InferInsertModel } from "drizzle-orm";
import { db, getSqlite } from "../index";
import { spotifyTrackFeatures } from "../schema";

/** A cached Spotify-features row (camelCase, all feature fields nullable). */
export type SpotifyFeatureRow = InferInsertModel<typeof spotifyTrackFeatures>;

// Raw row shape from tauri-plugin-sql (snake_case columns).
interface DbRow {
  spotify_id: string;
  tempo: number | null;
  key_pitch: number | null;
  mode: number | null;
  energy: number | null;
  danceability: number | null;
  valence: number | null;
  acousticness: number | null;
  instrumentalness: number | null;
  liveness: number | null;
  speechiness: number | null;
  loudness: number | null;
  time_signature: number | null;
  popularity: number | null;
  release_date: string | null;
  genres: string | null;
  record_label: string | null;
  fetched_at: number;
}

function remap(r: DbRow): SpotifyFeatureRow {
  return {
    spotifyId: r.spotify_id,
    tempo: r.tempo,
    keyPitch: r.key_pitch,
    mode: r.mode,
    energy: r.energy,
    danceability: r.danceability,
    valence: r.valence,
    acousticness: r.acousticness,
    instrumentalness: r.instrumentalness,
    liveness: r.liveness,
    speechiness: r.speechiness,
    loudness: r.loudness,
    timeSignature: r.time_signature,
    popularity: r.popularity,
    releaseDate: r.release_date,
    genres: r.genres,
    recordLabel: r.record_label,
    fetchedAt: r.fetched_at,
  };
}

/**
 * Local mirror of the cloud's canonical Spotify audio-features (see schema). Reads use the raw
 * sqlite driver (matches the rest of the repos); the upsert uses drizzle.
 */
export const spotifyFeaturesRepository = {
  /** Cached rows for the given Spotify ids (only those present). */
  async getByIds(ids: string[]): Promise<SpotifyFeatureRow[]> {
    if (ids.length === 0) return [];
    const sqlite = await getSqlite();
    const placeholders = ids.map(() => "?").join(",");
    const rows = await sqlite.select<DbRow[]>(
      `SELECT * FROM spotify_track_features WHERE spotify_id IN (${placeholders})`,
      ids,
    );
    return rows.map(remap);
  },

  /** Insert or replace cached features (latest fetch wins). */
  async upsertMany(rows: SpotifyFeatureRow[]): Promise<void> {
    for (const row of rows) {
      const { spotifyId: _omit, ...set } = row;
      await db
        .insert(spotifyTrackFeatures)
        .values(row)
        .onConflictDoUpdate({ target: spotifyTrackFeatures.spotifyId, set });
    }
  },
};
