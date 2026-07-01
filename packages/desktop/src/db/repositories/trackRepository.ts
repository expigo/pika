import { type AnalysisResult, logger } from "@pika/shared";
import { eq, type InferInsertModel, isNull, sql } from "drizzle-orm";
import { db, getSqlite } from "../index";
import { tracks } from "../schema";

// Current analysis algorithm version
// Increment this when the analysis algorithm changes significantly
// Tracks with analysisVersion < CURRENT_ANALYSIS_VERSION need re-analysis
export const CURRENT_ANALYSIS_VERSION = 1;

// Type-safe insert model from schema (exclude ID for auto-increment)
type NewTrack = Omit<InferInsertModel<typeof tracks>, "id">;

// Helper type matching the Rust output
export interface VirtualDJTrack {
  file_path: string;
  artist?: string;
  title?: string;
  bpm?: string;
  key?: string;
  duration?: number;
}

// Re-export AnalysisResult for backwards compatibility
export type { AnalysisResult } from "@pika/shared";

// Track type for UI display (includes fingerprint metrics)
export interface Track {
  id: number;
  filePath: string;
  artist: string | null;
  title: string | null;

  // Core metrics
  bpm: number | null;
  energy: number | null;
  key: string | null;

  // Fingerprint metrics
  danceability: number | null;
  brightness: number | null;
  acousticness: number | null;
  groove: number | null;

  // Duration in seconds
  duration: number | null;

  analyzed: boolean | null;

  // Schema versioning for re-analysis support
  analysisVersion: number | null;

  // Two-Tier Track Key System
  trackKey: string | null;

  // Custom tags (parsed from JSON array)
  tags: string[];

  // DJ personal notes
  notes: string | null;

  // Remembered Spotify match (B3) — null until matched via the Build Playlist tool.
  spotifyId: string | null;
  spotifyUrl: string | null;
  spotifyAlbumArtUrl: string | null;
  spotifyMatchConfidence: number | null;
  spotifyMatchSource: string | null; // 'auto' | 'dj_confirmed'
}

/**
 * Raw row type from database before remapping
 */
interface TrackRow extends Omit<Track, "tags"> {
  tags: string | null;
}

// Raw SQL query for track selection with proper aliasing
const TRACK_SELECT_SQL = `
	SELECT 
		id, 
		file_path as filePath, 
		artist, 
		title, 
		bpm, 
		energy, 
		key, 
		danceability,
		brightness,
		acousticness,
		groove,
		duration,
		analyzed,
		analysis_version as analysisVersion,
		track_key as trackKey,
		tags,
		notes,
		spotify_id as spotifyId,
		spotify_url as spotifyUrl,
		spotify_album_art_url as spotifyAlbumArtUrl,
		spotify_match_confidence as spotifyMatchConfidence,
		spotify_match_source as spotifyMatchSource
	FROM tracks
`;

export const trackRepository = {
  async addTracks(tracksList: VirtualDJTrack[]) {
    const CHUNK_SIZE = 100;
    const { getTrackKey } = await import("@pika/shared");

    // Process in chunks to avoid overwhelming the bridge/UI
    for (let i = 0; i < tracksList.length; i += CHUNK_SIZE) {
      const chunk = tracksList.slice(i, i + CHUNK_SIZE);

      const values: NewTrack[] = chunk.map((t) => ({
        filePath: t.file_path,
        artist: t.artist ?? null,
        title: t.title ?? null,
        // Compute track_key for indexed lookup
        trackKey: getTrackKey(t.artist ?? "", t.title ?? ""),
        // Parse BPM, handle potentially empty or invalid strings
        bpm: t.bpm ? Number.parseFloat(t.bpm) || null : null,
        key: t.key ?? null,
        // Duration from VirtualDJ (in seconds)
        duration: t.duration ?? null,
        // These will be filled in during analysis
        energy: null,
        danceability: null,
        brightness: null,
        acousticness: null,
        groove: null,
        analyzed: false,
      }));

      // Atomic upsert keyed on track_key (= artist::title). Two different files
      // with the same artist/title — or blank metadata — share a track_key, so we
      // must conflict on track_key (not file_path) to dedupe them rather than throw
      // on the UNIQUE(track_key) index. Wrapped so one bad chunk can't abort import.
      try {
        await db
          .insert(tracks)
          .values(values)
          .onConflictDoUpdate({
            target: tracks.trackKey,
            set: {
              // Use excluded.* to reference the new values being inserted
              artist: sql`excluded.artist`,
              title: sql`excluded.title`,
              trackKey: sql`excluded.track_key`,
              bpm: sql`excluded.bpm`,
              key: sql`excluded.key`,
              duration: sql`excluded.duration`,
              // Do NOT update: analyzed, energy, fingerprint (preserve analysis data)
            },
          });
      } catch (e) {
        logger.error("[Repository] Failed to import a track chunk; continuing", e);
      }
    }

    return true;
  },

  async getTracks(limit: number, offset = 0): Promise<Track[]> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<TrackRow[]>(
      `${TRACK_SELECT_SQL} ORDER BY artist ASC LIMIT ? OFFSET ?`,
      [limit, offset],
    );

    if (result.length > 4000) {
      logger.info(
        "[Repository] Large track list returned. Redesign to explicit pagination recommended.",
        {
          count: result.length,
        },
      );
    }

    return result.map(remapTrack);
  },

  /**
   * Get tracks that haven't been analyzed yet
   */
  async getUnanalyzedTracks(): Promise<Track[]> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<TrackRow[]>(
      `${TRACK_SELECT_SQL} WHERE analyzed = 0 OR analyzed IS NULL`,
    );
    return result.map(remapTrack);
  },

  /**
   * Get tracks that were analyzed with an older version
   * Used for re-analysis when the algorithm changes
   */
  async getOutdatedTracks(): Promise<Track[]> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<Track[]>(
      `${TRACK_SELECT_SQL} WHERE analyzed = 1 AND (analysis_version IS NULL OR analysis_version < ?)`,
      [CURRENT_ANALYSIS_VERSION],
    );
    return result;
  },

  async getTrackById(id: number): Promise<Track | null> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<TrackRow[]>(`${TRACK_SELECT_SQL} WHERE id = ?`, [id]);
    return result[0] ? remapTrack(result[0]) : null;
  },

  /**
   * Find a track by its track_key (O(log n) indexed lookup)
   * This is the primary lookup method for track identification
   */
  async findByTrackKey(trackKey: string): Promise<Track | null> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<TrackRow[]>(`${TRACK_SELECT_SQL} WHERE track_key = ?`, [
      trackKey,
    ]);
    return result[0] ? remapTrack(result[0]) : null;
  },

  /**
   * Insert or update a track by track_key
   * Automatically computes track_key from artist/title
   * Returns the track ID
   */
  async insertTrack(track: {
    filePath: string;
    artist?: string | null;
    title?: string | null;
    bpm?: number | null;
    key?: string | null;
    duration?: number | null;
  }): Promise<number> {
    const sqlite = await getSqlite();
    const { getTrackKey } = await import("@pika/shared");
    const trackKey = getTrackKey(track.artist ?? "", track.title ?? "");

    // S0.3.2 Fix: Use atomic UPSERT (ON CONFLICT) to prevent TOCTOU races.
    // COALESCE(excluded.x, x) intentionally preserves existing metadata when the
    // incoming value is null — re-inserting a track without metadata must not wipe it.
    await sqlite.execute(
      `INSERT INTO tracks (file_path, artist, title, bpm, key, duration, track_key, analyzed)
       VALUES (?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(track_key) DO UPDATE SET
         artist = COALESCE(excluded.artist, artist),
         title = COALESCE(excluded.title, title),
         file_path = COALESCE(excluded.file_path, file_path),
         bpm = COALESCE(excluded.bpm, bpm),
         key = COALESCE(excluded.key, key),
         duration = COALESCE(excluded.duration, duration)
      `,
      [
        track.filePath,
        track.artist ?? null,
        track.title ?? null,
        track.bpm ?? null,
        track.key ?? null,
        track.duration ?? null,
        trackKey,
      ],
    );

    // Query back the ID (safe now as it's guaranteed to exist)
    const result = await sqlite.select<{ id: number }[]>(
      `SELECT id FROM tracks WHERE track_key = ?`,
      [trackKey],
    );

    if (result.length === 0) {
      throw new Error(`Failed to insert/update track: ${track.filePath}`);
    }

    return result[0].id;
  },

  async getTrackCount(): Promise<number> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<{ cnt: number }[]>("SELECT COUNT(*) as cnt FROM tracks");
    return result[0]?.cnt ?? 0;
  },

  async getUnanalyzedCount(): Promise<number> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<{ cnt: number }[]>(
      "SELECT COUNT(*) as cnt FROM tracks WHERE analyzed = 0",
    );
    return result[0]?.cnt ?? 0;
  },

  async getNextUnanalyzedTrack(): Promise<Track | null> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<TrackRow[]>(
      `${TRACK_SELECT_SQL} WHERE analyzed = 0 LIMIT 1`,
    );
    return result[0] ? remapTrack(result[0]) : null;
  },

  async markTrackAnalyzed(id: number, analysisData: AnalysisResult | null): Promise<void> {
    if (analysisData) {
      // Update with all analysis results (core + fingerprint)
      await db
        .update(tracks)
        .set({
          // Core metrics
          bpm: analysisData.bpm ?? null,
          energy: analysisData.energy ?? null,
          key: analysisData.key ?? null,
          // Fingerprint metrics
          danceability: analysisData.danceability ?? null,
          brightness: analysisData.brightness ?? null,
          acousticness: analysisData.acousticness ?? null,
          groove: analysisData.groove ?? null,
          // Mark as analyzed with current version
          analyzed: true,
          analysisVersion: CURRENT_ANALYSIS_VERSION,
        })
        .where(eq(tracks.id, id));
    } else {
      // Mark as analyzed even if analysis failed (to skip on retry)
      await db
        .update(tracks)
        .set({ analyzed: true, analysisVersion: CURRENT_ANALYSIS_VERSION })
        .where(eq(tracks.id, id));
    }
  },

  /**
   * Delete a single track by ID
   */
  async deleteTrack(id: number): Promise<boolean> {
    try {
      await db.delete(tracks).where(eq(tracks.id, id));
      console.log(`Track ${id} deleted`);
      return true;
    } catch (e) {
      console.error(`Failed to delete track ${id}:`, e);
      return false;
    }
  },

  /**
   * Delete multiple tracks by IDs
   */
  /**
   * Delete multiple tracks by IDs (Batch Optimized)
   */
  async deleteTracks(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;

    try {
      const sqlite = await getSqlite();
      // Chunk to stay under SQLite's bound-parameter limit (default 999).
      const CHUNK_SIZE = 500;
      let deleted = 0;
      for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
        const chunk = ids.slice(i, i + CHUNK_SIZE);
        const placeholders = chunk.map(() => "?").join(",");
        const result = await sqlite.execute(
          `DELETE FROM tracks WHERE id IN (${placeholders})`,
          chunk,
        );
        deleted += (result as { rowsAffected?: number }).rowsAffected ?? 0;
      }
      console.log(`Batch deleted ${ids.length} tracks`);
      return deleted;
    } catch (e) {
      console.error("Failed to batch delete tracks:", e);
      return 0;
    }
  },

  /**
   * Clear all tracks from the database
   * WARNING: This removes all tracks!
   */
  async clearAllTracks(): Promise<boolean> {
    try {
      const sqlite = await getSqlite();
      await sqlite.execute("DELETE FROM tracks");
      console.log("All tracks cleared");
      return true;
    } catch (e) {
      console.error("Failed to clear tracks:", e);
      return false;
    }
  },

  /**
   * Reset analysis for all tracks (re-analyze everything)
   */
  async resetAnalysis(): Promise<boolean> {
    try {
      const sqlite = await getSqlite();
      await sqlite.execute(`
                UPDATE tracks SET 
                    analyzed = 0,
                    energy = NULL,
                    danceability = NULL,
                    brightness = NULL,
                    acousticness = NULL,
                    groove = NULL
            `);
      console.log("Analysis reset for all tracks");
      return true;
    } catch (e) {
      console.error("Failed to reset analysis:", e);
      return false;
    }
  },

  /**
   * Update track tags (JSON array stored as string)
   */
  async updateTrackTags(trackId: number, tags: string[]): Promise<boolean> {
    try {
      const sqlite = await getSqlite();
      await sqlite.execute(`UPDATE tracks SET tags = ? WHERE id = ?`, [
        JSON.stringify(tags),
        trackId,
      ]);
      return true;
    } catch (e) {
      console.error("Failed to update track tags:", e);
      return false;
    }
  },

  /**
   * Update track notes
   */
  async updateTrackNotes(trackId: number, notes: string | null): Promise<boolean> {
    try {
      const sqlite = await getSqlite();
      await sqlite.execute(`UPDATE tracks SET notes = ? WHERE id = ?`, [notes, trackId]);
      return true;
    } catch (e) {
      console.error("Failed to update track notes:", e);
      return false;
    }
  },

  /**
   * Get all unique tags across all tracks
   */
  async getAllTags(): Promise<string[]> {
    try {
      const sqlite = await getSqlite();
      // 🛡️ Issue 17 Fix: Use SQLite JSON functions for O(N) efficiency
      // This avoids loading all rows and parsing JSON in JavaScript
      const result = await sqlite.select<{ tag: string }[]>(
        `SELECT DISTINCT json_each.value as tag 
         FROM tracks, json_each(tracks.tags) 
         WHERE tracks.tags IS NOT NULL AND tracks.tags != '[]'
         ORDER BY tag ASC`,
      );
      return result.map((r) => r.tag);
    } catch (e) {
      console.error("Failed to get all tags:", e);
      return [];
    }
  },

  /**
   * Get play history stats for a track
   * Returns peaks count, bricks count, last notes, and sessions played on
   */
  async getTrackPlayHistory(trackId: number): Promise<TrackPlayHistory | null> {
    const sqlite = await getSqlite();

    // Get aggregated stats
    const statsResult = await sqlite.select<
      {
        play_count: number;
        peak_count: number;
        brick_count: number;
        total_likes: number;
        last_notes: string | null;
        last_played_at: number | null;
      }[]
    >(
      `
            SELECT 
                COUNT(*) as play_count,
                SUM(CASE WHEN reaction = 'peak' THEN 1 ELSE 0 END) as peak_count,
                SUM(CASE WHEN reaction = 'brick' THEN 1 ELSE 0 END) as brick_count,
                COALESCE(SUM(dancer_likes), 0) as total_likes,
                (SELECT notes FROM plays WHERE track_id = ? AND notes IS NOT NULL ORDER BY played_at DESC LIMIT 1) as last_notes,
                MAX(played_at) as last_played_at
            FROM plays
            WHERE track_id = ?
        `,
      [trackId, trackId],
    );

    const stats = statsResult[0];
    if (!stats || stats.play_count === 0) {
      return null;
    }

    // Get sessions this track was played in
    const sessionsResult = await sqlite.select<
      {
        session_id: number;
        session_name: string | null;
        played_at: number;
      }[]
    >(
      `
            SELECT DISTINCT
                s.id as session_id,
                s.name as session_name,
                p.played_at
            FROM plays p
            JOIN sessions s ON p.session_id = s.id
            WHERE p.track_id = ?
            ORDER BY p.played_at DESC
            LIMIT 10
        `,
      [trackId],
    );

    return {
      trackId,
      playCount: stats.play_count,
      peakCount: stats.peak_count,
      brickCount: stats.brick_count,
      totalLikes: stats.total_likes,
      lastNotes: stats.last_notes,
      lastPlayedAt: stats.last_played_at,
      sessions: sessionsResult.map((s) => ({
        sessionId: s.session_id,
        sessionName: s.session_name,
        playedAt: s.played_at,
      })),
    };
  },

  /**
   * Get all tracks played in a session with their fingerprint data
   * Used for syncing analysis data to Cloud at session end
   */
  async getSessionTracksWithFingerprints(sessionId: number): Promise<
    Array<{
      artist: string;
      title: string;
      bpm: number | null;
      key: string | null;
      duration: number | null;
      energy: number | null;
      danceability: number | null;
      brightness: number | null;
      acousticness: number | null;
      groove: number | null;
    }>
  > {
    const sqlite = await getSqlite();

    interface SessionTrackRow {
      artist: string;
      title: string;
      bpm: number | null;
      key: string | null;
      duration: number | null;
      energy: number | null;
      danceability: number | null;
      brightness: number | null;
      acousticness: number | null;
      groove: number | null;
    }

    const result = await sqlite.select<SessionTrackRow[]>(
      `
      SELECT DISTINCT
        t.artist,
        t.title,
        t.bpm,
        t.key,
        t.duration,
        t.energy,
        t.danceability,
        t.brightness,
        t.acousticness,
        t.groove
      FROM plays p
      JOIN tracks t ON p.track_id = t.id
      WHERE p.session_id = ?
    `,
      [sessionId],
    );

    return result;
  },

  /**
   * Distinct tracks played in a session (B3 playlist builder), in set order, each with its
   * duration + any remembered Spotify match. Repeats collapse to their first play.
   */
  async getSessionTracksForMatching(sessionId: number): Promise<SessionMatchTrack[]> {
    const sqlite = await getSqlite();
    const rows = await sqlite.select<SessionMatchTrack[]>(
      `
      SELECT
        t.id as trackId,
        t.artist as artist,
        t.title as title,
        t.duration as durationSec,
        t.spotify_id as spotifyId,
        t.spotify_url as spotifyUrl,
        t.spotify_album_art_url as spotifyAlbumArtUrl,
        t.spotify_match_source as spotifyMatchSource,
        t.spotify_match_confidence as spotifyMatchConfidence,
        MIN(p.played_at) as firstPlayedAt
      FROM plays p
      JOIN tracks t ON p.track_id = t.id
      WHERE p.session_id = ?
      GROUP BY t.id
      ORDER BY firstPlayedAt ASC
    `,
      [sessionId],
    );
    return rows;
  },

  /** Remember a Spotify match for a local track (file-keyed); `dj_confirmed` is sticky. */
  async setTrackSpotifyMatch(
    trackId: number,
    match: {
      spotifyId: string;
      spotifyUrl: string;
      albumArtUrl?: string | null;
      confidence: number | null;
      source: "auto" | "dj_confirmed";
    },
  ): Promise<void> {
    await db
      .update(tracks)
      .set({
        spotifyId: match.spotifyId,
        spotifyUrl: match.spotifyUrl,
        spotifyAlbumArtUrl: match.albumArtUrl ?? null,
        spotifyMatchConfidence: match.confidence,
        spotifyMatchSource: match.source,
        spotifyMatchedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(tracks.id, trackId));
  },

  /** Backfill just the album-art URL for a remembered match (doesn't touch source/confidence). */
  async setTrackAlbumArt(trackId: number, albumArtUrl: string): Promise<void> {
    await db.update(tracks).set({ spotifyAlbumArtUrl: albumArtUrl }).where(eq(tracks.id, trackId));
  },

  /**
   * Remove a track's Spotify match (Slice 3 "unmatch"). Nulls the match columns but SETS
   * `spotify_matched_at` so the background auto-matcher (which skips rows with `matched_at` set) won't
   * re-grab it — the DJ's removal is sticky until they "Re-match unmatched" (`clearUnmatchedAttempts`).
   */
  async clearTrackSpotifyMatch(trackId: number): Promise<void> {
    await db
      .update(tracks)
      .set({
        spotifyId: null,
        spotifyUrl: null,
        spotifyAlbumArtUrl: null,
        spotifyMatchConfidence: null,
        spotifyMatchSource: null,
        spotifyMatchedAt: Math.floor(Date.now() / 1000),
      })
      .where(eq(tracks.id, trackId));
  },

  // ── Slice 2: background library pre-match ──────────────────────────────────────────────────────
  // `spotify_matched_at IS NULL` is reused as the "not yet attempted" marker (nothing else reads it):
  // matched rows AND attempted-but-no-match rows both have it set, so a run is resumable + terminating
  // and newly-imported tracks (matched_at NULL) are auto-picked-up.

  /** Library tracks still pending a Spotify match attempt (paged; the background matcher's cursor). */
  async getUnmatchedLibraryTracks(limit: number): Promise<Track[]> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<TrackRow[]>(
      `${TRACK_SELECT_SQL} WHERE spotify_id IS NULL AND spotify_matched_at IS NULL
         AND artist IS NOT NULL AND trim(artist) != '' AND title IS NOT NULL AND trim(title) != ''
       ORDER BY id LIMIT ?`,
      [limit],
    );
    return result.map(remapTrack);
  },

  /** Count of tracks still pending a Spotify match attempt (progress total + idle "Match N" label). */
  async getUnmatchedCount(): Promise<number> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<{ cnt: number }[]>(
      `SELECT COUNT(*) as cnt FROM tracks
        WHERE spotify_id IS NULL AND spotify_matched_at IS NULL
          AND artist IS NOT NULL AND trim(artist) != '' AND title IS NOT NULL AND trim(title) != ''`,
    );
    return result[0]?.cnt ?? 0;
  },

  /**
   * Mark a track "searched, no confident match" so the matcher skips it next pass. Sets ONLY
   * `spotify_matched_at` (leaves `spotify_id` NULL → the track stays unmatched).
   */
  async markSpotifyMatchAttempted(trackId: number): Promise<void> {
    await db
      .update(tracks)
      .set({ spotifyMatchedAt: Math.floor(Date.now() / 1000) })
      .where(eq(tracks.id, trackId));
  },

  /** Clear the "attempted" marker on still-unmatched tracks so a re-run re-tries them (cache warms). */
  async clearUnmatchedAttempts(): Promise<void> {
    await db.update(tracks).set({ spotifyMatchedAt: null }).where(isNull(tracks.spotifyId));
  },
};

/** A session's distinct track with its duration + remembered Spotify match (B3). */
export interface SessionMatchTrack {
  trackId: number;
  artist: string | null;
  title: string | null;
  durationSec: number | null;
  spotifyId: string | null;
  spotifyUrl: string | null;
  spotifyAlbumArtUrl: string | null;
  spotifyMatchSource: string | null; // 'auto' | 'dj_confirmed'
  spotifyMatchConfidence: number | null;
  firstPlayedAt: number;
}

/**
 * Maps a raw database row to a clean Track object
 */
function remapTrack(row: TrackRow): Track {
  let tags: string[] = [];
  if (row.tags) {
    try {
      tags = JSON.parse(row.tags);
    } catch (e) {
      logger.debug(`[remapTrack] Failed to parse tags for track ${row.id}`, {
        tags: row.tags,
        error: e,
      });
      tags = [];
    }
  }
  return {
    ...row,
    tags,
  };
}

// Track play history interface
export interface TrackPlayHistory {
  trackId: number;
  playCount: number;
  peakCount: number;
  brickCount: number;
  totalLikes: number;
  lastNotes: string | null;
  lastPlayedAt: number | null;
  sessions: {
    sessionId: number;
    sessionName: string | null;
    playedAt: number;
  }[];
}
