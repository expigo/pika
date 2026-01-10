import { getSqlite } from "../index";
import type { Track } from "./trackRepository";

// ============================================================================
// Types
// ============================================================================

export interface SavedSet {
  id: number;
  name: string;
  description: string | null;
  createdAt: number;
  updatedAt: number;
  trackCount?: number;
}

export interface SavedSetWithTracks extends SavedSet {
  tracks: Track[];
}

// ============================================================================
// Repository
// ============================================================================

export const savedSetRepository = {
  /**
   * Get all saved sets with track counts
   */
  async getAllSets(): Promise<SavedSet[]> {
    const sqlite = await getSqlite();
    const result = await sqlite.select<SavedSet[]>(`
            SELECT 
                s.id,
                s.name,
                s.description,
                s.created_at as createdAt,
                s.updated_at as updatedAt,
                COUNT(st.id) as trackCount
            FROM saved_sets s
            LEFT JOIN saved_set_tracks st ON s.id = st.set_id
            GROUP BY s.id
            ORDER BY s.updated_at DESC
        `);
    return result;
  },

  /**
   * Get a single set with all its tracks
   */
  async getSetWithTracks(setId: number): Promise<SavedSetWithTracks | null> {
    const sqlite = await getSqlite();

    // Get the set metadata
    const sets = await sqlite.select<SavedSet[]>(
      `
            SELECT 
                id,
                name,
                description,
                created_at as createdAt,
                updated_at as updatedAt
            FROM saved_sets
            WHERE id = $1
        `,
      [setId],
    );

    if (sets.length === 0) {
      return null;
    }

    const set = sets[0];

    // Get the tracks in order
    const tracks = await sqlite.select<Track[]>(
      `
            SELECT 
                t.id,
                t.file_path as filePath,
                t.artist,
                t.title,
                t.bpm,
                t.energy,
                t.key,
                t.danceability,
                t.brightness,
                t.acousticness,
                t.groove,
                t.duration,
                t.analyzed
            FROM tracks t
            INNER JOIN saved_set_tracks st ON t.id = st.track_id
            WHERE st.set_id = $1
            ORDER BY st.position ASC
        `,
      [setId],
    );

    return { ...set, tracks };
  },

  /**
   * Save a new set with tracks
   */
  async saveSet(name: string, trackIds: number[], description?: string): Promise<number> {
    const sqlite = await getSqlite();
    const now = Math.floor(Date.now() / 1000);

    // Insert the set
    const result = await sqlite.execute(
      `INSERT INTO saved_sets (name, description, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
      [name, description ?? null, now, now],
    );

    const setId = result.lastInsertId as number;

    // Insert the track positions
    for (let i = 0; i < trackIds.length; i++) {
      await sqlite.execute(
        `INSERT INTO saved_set_tracks (set_id, track_id, position) VALUES ($1, $2, $3)`,
        [setId, trackIds[i], i],
      );
    }

    return setId;
  },

  /**
   * Update an existing set's tracks (replaces all tracks)
   */
  async updateSetTracks(setId: number, trackIds: number[]): Promise<void> {
    const sqlite = await getSqlite();
    const now = Math.floor(Date.now() / 1000);

    // Delete existing track associations
    await sqlite.execute(`DELETE FROM saved_set_tracks WHERE set_id = $1`, [setId]);

    // Insert new track positions
    for (let i = 0; i < trackIds.length; i++) {
      await sqlite.execute(
        `INSERT INTO saved_set_tracks (set_id, track_id, position) VALUES ($1, $2, $3)`,
        [setId, trackIds[i], i],
      );
    }

    // Update the set's updated_at timestamp
    await sqlite.execute(`UPDATE saved_sets SET updated_at = $1 WHERE id = $2`, [now, setId]);
  },

  /**
   * Rename a set
   */
  async renameSet(setId: number, name: string): Promise<void> {
    const sqlite = await getSqlite();
    const now = Math.floor(Date.now() / 1000);

    await sqlite.execute(`UPDATE saved_sets SET name = $1, updated_at = $2 WHERE id = $3`, [
      name,
      now,
      setId,
    ]);
  },

  /**
   * Delete a saved set
   */
  async deleteSet(setId: number): Promise<void> {
    const sqlite = await getSqlite();

    // Delete track associations first (cascade should handle this, but be explicit)
    await sqlite.execute(`DELETE FROM saved_set_tracks WHERE set_id = $1`, [setId]);

    // Delete the set
    await sqlite.execute(`DELETE FROM saved_sets WHERE id = $1`, [setId]);
  },
};
