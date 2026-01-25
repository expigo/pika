import { type AnalysisResult, logger } from "@pika/shared";
import { eq, type InferInsertModel, sql } from "drizzle-orm";
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
		notes
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

      // Use upsert: update metadata on conflict, but preserve analyzed data
      await db
        .insert(tracks)
        .values(values)
        .onConflictDoUpdate({
          target: tracks.filePath,
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
  }): Promise<number> {
    const sqlite = await getSqlite();
    const { getTrackKey } = await import("@pika/shared");
    const trackKey = getTrackKey(track.artist ?? "", track.title ?? "");

    // S0.3.2 Fix: Use atomic UPSERT (ON CONFLICT) to prevent TOCTOU races
    await sqlite.execute(
      `INSERT INTO tracks (file_path, artist, title, bpm, key, track_key, analyzed) 
       VALUES (?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(track_key) DO UPDATE SET
         artist = COALESCE(excluded.artist, artist),
         title = COALESCE(excluded.title, title),
         file_path = COALESCE(excluded.file_path, file_path),
         bpm = COALESCE(excluded.bpm, bpm),
         key = COALESCE(excluded.key, key)
      `,
      [
        track.filePath,
        track.artist ?? null,
        track.title ?? null,
        track.bpm ?? null,
        track.key ?? null,
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
      const placeholders = ids.map(() => "?").join(",");
      const result = await sqlite.execute(`DELETE FROM tracks WHERE id IN (${placeholders})`, ids);

      console.log(`Batch deleted ${ids.length} tracks`);
      return (result as { rowsAffected?: number }).rowsAffected ?? 0;
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
};

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
