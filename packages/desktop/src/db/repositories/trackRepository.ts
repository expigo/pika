import { eq, sql } from "drizzle-orm";
import { db, getSqlite } from "../index";
import { tracks } from "../schema";
import { type AnalysisResult } from "@pika/shared";

// Helper type matching the Rust output
export interface VirtualDJTrack {
    file_path: string;
    artist?: string;
    title?: string;
    bpm?: string;
    key?: string;
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

    analyzed: boolean | null;
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
		analyzed 
	FROM tracks
`;

export const trackRepository = {
    async addTracks(tracksList: VirtualDJTrack[]) {
        const CHUNK_SIZE = 100;

        // Process in chunks to avoid overwhelming the bridge/UI
        for (let i = 0; i < tracksList.length; i += CHUNK_SIZE) {
            const chunk = tracksList.slice(i, i + CHUNK_SIZE);

            const values = chunk.map((t) => ({
                filePath: t.file_path,
                artist: t.artist ?? null,
                title: t.title ?? null,
                // Parse BPM, handle potentially empty or invalid strings
                bpm: t.bpm ? Number.parseFloat(t.bpm) || null : null,
                key: t.key ?? null,
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
                        bpm: sql`excluded.bpm`,
                        key: sql`excluded.key`,
                        // Do NOT update: analyzed, energy, fingerprint (preserve analysis data)
                    },
                });
        }

        return true;
    },

    async getAllTracks(): Promise<Track[]> {
        // Use raw SQL with explicit column aliasing
        const sqlite = await getSqlite();
        const result = await sqlite.select<Track[]>(
            `${TRACK_SELECT_SQL} ORDER BY artist ASC`
        );
        return result;
    },

    async getTrackCount(): Promise<number> {
        const sqlite = await getSqlite();
        const result = await sqlite.select<{ cnt: number }[]>(
            "SELECT COUNT(*) as cnt FROM tracks"
        );
        return result[0]?.cnt ?? 0;
    },

    async getUnanalyzedCount(): Promise<number> {
        const sqlite = await getSqlite();
        const result = await sqlite.select<{ cnt: number }[]>(
            "SELECT COUNT(*) as cnt FROM tracks WHERE analyzed = 0"
        );
        return result[0]?.cnt ?? 0;
    },

    async getNextUnanalyzedTrack(): Promise<Track | null> {
        const sqlite = await getSqlite();
        const result = await sqlite.select<Track[]>(
            `${TRACK_SELECT_SQL} WHERE analyzed = 0 LIMIT 1`
        );
        return result[0] ?? null;
    },

    async markTrackAnalyzed(
        id: number,
        analysisData: AnalysisResult | null
    ): Promise<void> {
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
            await db
                .update(tracks)
                .set({ analyzed: true })
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
};
