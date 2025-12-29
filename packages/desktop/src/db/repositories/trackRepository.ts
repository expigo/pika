import { eq, sql } from "drizzle-orm";
import { db, getSqlite } from "../index";
import { tracks } from "../schema";

// Helper type matching the Rust output
export interface VirtualDJTrack {
    file_path: string;
    artist?: string;
    title?: string;
    bpm?: string;
    key?: string;
}

// Analysis result from Python sidecar
export interface AnalysisResult {
    bpm?: number;
    energy?: number;
    key?: string;
    error?: string;
}

// Track type for UI display
export interface Track {
    id: number;
    filePath: string;
    artist: string | null;
    title: string | null;
    bpm: number | null;
    energy: number | null;
    key: string | null;
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
                energy: null, // Not provided by VirtualDJ XML usually
                analyzed: false,
            }));

            // Use upsert: update metadata on conflict, but preserve analyzed/energy
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
                        // Do NOT update: analyzed, energy (preserve analysis data)
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
            // Update with analysis results
            await db
                .update(tracks)
                .set({
                    bpm: analysisData.bpm ?? null,
                    energy: analysisData.energy ?? null,
                    key: analysisData.key ?? null,
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
};
