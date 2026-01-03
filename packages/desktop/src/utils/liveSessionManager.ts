/**
 * Live Session Manager
 * Manages polling of VirtualDJ history folder and syncing plays to the database.
 */

import { readDir, readTextFile, stat } from "@tauri-apps/plugin-fs";
import { parseVdjM3u, normalizeForMatch, type ParsedTrack } from "./m3uParser";
import { trackRepository, type Track } from "../db/repositories/trackRepository";
import { sessionRepository } from "../db/repositories/sessionRepository";

// ============================================================================
// Types
// ============================================================================

export interface LiveSessionState {
    /** Current session ID in the database */
    sessionId: number | null;
    /** Unix timestamp when the session started */
    sessionStart: number;
    /** Set of processed play timestamps to avoid duplicates */
    processedTimestamps: Set<number>;
    /** Last M3U file path that was read */
    lastM3uPath: string | null;
    /** Polling interval handle */
    intervalHandle: ReturnType<typeof setInterval> | null;
}

export interface NewPlayEvent {
    /** The parsed track from M3U */
    track: ParsedTrack;
    /** The matched track from the database (or null if ghost) */
    dbTrack: Track | null;
    /** The play ID in the database */
    playId: number;
    /** Unix timestamp when played */
    timestamp: number;
}

// ============================================================================
// State
// ============================================================================

let state: LiveSessionState = {
    sessionId: null,
    sessionStart: 0,
    processedTimestamps: new Set(),
    lastM3uPath: null,
    intervalHandle: null,
};

// ============================================================================
// Callbacks
// ============================================================================

type OnNewPlayCallback = (event: NewPlayEvent) => void;

let onNewPlayCallback: OnNewPlayCallback | null = null;

/**
 * Register a callback for when a new play is detected
 */
export function setOnNewPlay(callback: OnNewPlayCallback | null): void {
    onNewPlayCallback = callback;
}

// ============================================================================
// History Folder Polling
// ============================================================================

/**
 * Find the latest M3U file in the VirtualDJ history folder
 */
async function findLatestM3u(folderPath: string): Promise<string | null> {
    try {
        const entries = await readDir(folderPath);

        let latestPath: string | null = null;
        let latestMtime = 0;

        for (const entry of entries) {
            if (entry.name?.endsWith(".m3u")) {
                const fullPath = `${folderPath}/${entry.name}`;
                try {
                    const fileStat = await stat(fullPath);
                    const mtime = fileStat.mtime?.getTime() || 0;
                    if (mtime > latestMtime) {
                        latestMtime = mtime;
                        latestPath = fullPath;
                    }
                } catch {
                    // Skip files we can't stat
                }
            }
        }

        return latestPath;
    } catch (e) {
        console.error("Error reading history folder:", e);
        return null;
    }
}

/**
 * Poll the history folder for new plays
 */
async function pollHistoryFolder(folderPath: string): Promise<ParsedTrack[]> {
    const m3uPath = await findLatestM3u(folderPath);

    if (!m3uPath) {
        return [];
    }

    try {
        const content = await readTextFile(m3uPath);
        const allTracks = parseVdjM3u(content);

        // Filter: Only tracks played after session start
        const sessionTracks = allTracks.filter(
            (t) => t.timestamp >= state.sessionStart
        );

        // Filter: Only new tracks (not already processed)
        const newTracks = sessionTracks.filter(
            (t) => !state.processedTimestamps.has(t.timestamp)
        );

        // Mark as processed
        for (const track of newTracks) {
            state.processedTimestamps.add(track.timestamp);
        }

        state.lastM3uPath = m3uPath;

        return newTracks;
    } catch (e) {
        console.error("Error reading M3U file:", e);
        return [];
    }
}

// ============================================================================
// Track Matching
// ============================================================================

/**
 * Find a track in the database by artist and title (fuzzy match)
 */
async function findTrackByArtistTitle(
    artist: string,
    title: string
): Promise<Track | null> {
    const allTracks = await trackRepository.getAllTracks();

    const normalizedArtist = normalizeForMatch(artist);
    const normalizedTitle = normalizeForMatch(title);

    // Exact match first
    let match = allTracks.find(
        (t) =>
            normalizeForMatch(t.artist || "") === normalizedArtist &&
            normalizeForMatch(t.title || "") === normalizedTitle
    );

    if (match) return match;

    // Partial match (contains)
    match = allTracks.find(
        (t) =>
            normalizeForMatch(t.artist || "").includes(normalizedArtist) &&
            normalizeForMatch(t.title || "").includes(normalizedTitle)
    );

    if (match) return match;

    // Title-only match (common for unknown artists)
    match = allTracks.find(
        (t) => normalizeForMatch(t.title || "") === normalizedTitle
    );

    return match ?? null;
}

/**
 * Create a "ghost track" for tracks not in the library
 */
async function createGhostTrack(artist: string, title: string): Promise<Track> {
    // Create a minimal track entry for tracking purposes
    const id = await trackRepository.insertTrack({
        filePath: `ghost://${artist}/${title}`,
        artist,
        title,
    });

    const track = await trackRepository.getTrackById(id);
    if (!track) {
        throw new Error("Failed to create ghost track");
    }
    return track;
}

// ============================================================================
// Session Lifecycle
// ============================================================================

/**
 * Start a new live session
 * @param folderPath - Path to VirtualDJ History folder
 * @param pollIntervalMs - How often to poll for new plays (default 2s)
 * @param sessionName - Optional name for the session
 */
export async function startLiveSession(
    folderPath: string,
    pollIntervalMs = 2000,
    sessionName?: string
): Promise<number> {
    // End any existing session
    await stopLiveSession();

    // Create new session in database
    const session = await sessionRepository.createSession(sessionName);

    // Initialize state
    state = {
        sessionId: session.id,
        sessionStart: session.startedAt,
        processedTimestamps: new Set(),
        lastM3uPath: null,
        intervalHandle: null,
    };

    console.log(`[LiveSession] Started session ${session.id}: ${session.name}`);

    // Start polling
    state.intervalHandle = setInterval(async () => {
        await processNewPlays(folderPath);
    }, pollIntervalMs);

    // Do an initial poll
    await processNewPlays(folderPath);

    return session.id;
}

/**
 * Process new plays from the history folder
 */
async function processNewPlays(folderPath: string): Promise<void> {
    if (!state.sessionId) return;

    const newTracks = await pollHistoryFolder(folderPath);

    for (const parsedTrack of newTracks) {
        // Find or create track in database
        let dbTrack = await findTrackByArtistTitle(
            parsedTrack.artist,
            parsedTrack.title
        );

        if (!dbTrack) {
            // Create ghost track for unknown songs
            dbTrack = await createGhostTrack(parsedTrack.artist, parsedTrack.title);
            console.log(`[LiveSession] Created ghost track: ${parsedTrack.artist} - ${parsedTrack.title}`);
        }

        // Add play to database
        const play = await sessionRepository.addPlay(
            state.sessionId,
            dbTrack.id,
            parsedTrack.timestamp
        );

        console.log(`[LiveSession] New play: ${parsedTrack.artist} - ${parsedTrack.title}`);

        // Notify callback
        if (onNewPlayCallback) {
            onNewPlayCallback({
                track: parsedTrack,
                dbTrack,
                playId: play.id,
                timestamp: parsedTrack.timestamp,
            });
        }
    }
}

/**
 * Stop the current live session
 */
export async function stopLiveSession(): Promise<void> {
    // Stop polling
    if (state.intervalHandle) {
        clearInterval(state.intervalHandle);
        state.intervalHandle = null;
    }

    // End session in database
    if (state.sessionId) {
        await sessionRepository.endSession(state.sessionId);
        console.log(`[LiveSession] Ended session ${state.sessionId}`);
    }

    // Reset state
    state = {
        sessionId: null,
        sessionStart: 0,
        processedTimestamps: new Set(),
        lastM3uPath: null,
        intervalHandle: null,
    };
}

/**
 * Get current session state
 */
export function getLiveSessionState(): Readonly<LiveSessionState> {
    return { ...state };
}

/**
 * Check if a live session is currently active
 */
export function isLiveSessionActive(): boolean {
    return state.sessionId !== null && state.intervalHandle !== null;
}

/**
 * Get the current session ID (or null if not active)
 */
export function getCurrentSessionId(): number | null {
    return state.sessionId;
}

/**
 * Manually add a play to the current session (for manual logging)
 */
export async function manuallyAddPlay(
    trackId: number,
    timestamp?: number
): Promise<void> {
    if (!state.sessionId) {
        throw new Error("No active session");
    }

    const ts = timestamp ?? Math.floor(Date.now() / 1000);
    await sessionRepository.addPlay(state.sessionId, trackId, ts);
    state.processedTimestamps.add(ts);
}
