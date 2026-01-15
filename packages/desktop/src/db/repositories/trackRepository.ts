import type { AnalysisResult } from "@pika/shared";
import { eq, type InferInsertModel, sql } from "drizzle-orm";
import { db, getSqlite } from "../index";
import { tracks } from "../schema";

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

  // Two-Tier Track Key System
  trackKey: string | null;
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
		track_key as trackKey
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

  async getAllTracks(): Promise<Track[]> {
    // Use raw SQL with explicit column aliasing
    const sqlite = await getSqlite();
    const result = await sqlite.select<Track[]>(`${TRACK_SELECT_SQL} ORDER BY artist ASC`);
    return result;
  },

  async getTrackById(id: number): Promise<Track | null> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<Track[]>(`${TRACK_SELECT_SQL} WHERE id = ?`, [id]);
    return result[0] ?? null;
  },

  /**
   * Find a track by its track_key (O(log n) indexed lookup)
   * This is the primary lookup method for track identification
   */
  async findByTrackKey(trackKey: string): Promise<Track | null> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<Track[]>(`${TRACK_SELECT_SQL} WHERE track_key = ?`, [
      trackKey,
    ]);
    return result[0] ?? null;
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

    // Check if track already exists by track_key (O(log n) indexed lookup)
    const existing = await sqlite.select<{ id: number }[]>(
      `SELECT id FROM tracks WHERE track_key = ?`,
      [trackKey],
    );

    if (existing.length > 0) {
      // Track exists - update metadata if provided
      const trackId = existing[0].id;
      await sqlite.execute(
        `UPDATE tracks SET 
          artist = COALESCE(?, artist),
          title = COALESCE(?, title),
          file_path = COALESCE(?, file_path),
          bpm = COALESCE(?, bpm), 
          key = COALESCE(?, key) 
        WHERE id = ?`,
        [
          track.artist ?? null,
          track.title ?? null,
          track.filePath,
          track.bpm ?? null,
          track.key ?? null,
          trackId,
        ],
      );
      return trackId;
    }

    // Insert new track
    await sqlite.execute(
      `INSERT INTO tracks (file_path, artist, title, bpm, key, track_key, analyzed) 
       VALUES (?, ?, ?, ?, ?, ?, 0)`,
      [
        track.filePath,
        track.artist ?? null,
        track.title ?? null,
        track.bpm ?? null,
        track.key ?? null,
        trackKey,
      ],
    );

    // Query back by track_key
    const inserted = await sqlite.select<{ id: number }[]>(
      `SELECT id FROM tracks WHERE track_key = ?`,
      [trackKey],
    );

    if (inserted.length === 0) {
      throw new Error(`Failed to insert track: ${track.filePath}`);
    }

    return inserted[0].id;
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
    const result = await sqlite.select<Track[]>(`${TRACK_SELECT_SQL} WHERE analyzed = 0 LIMIT 1`);
    return result[0] ?? null;
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
          // Mark as analyzed
          analyzed: true,
        })
        .where(eq(tracks.id, id));
    } else {
      // Mark as analyzed even if analysis failed (to skip on retry)
      await db.update(tracks).set({ analyzed: true }).where(eq(tracks.id, id));
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
  async deleteTracks(ids: number[]): Promise<number> {
    let deleted = 0;
    for (const id of ids) {
      const success = await this.deleteTrack(id);
      if (success) deleted++;
    }
    return deleted;
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
};

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
