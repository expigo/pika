import { int, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ============================================================================
// Tracks Table - Music Library
// ============================================================================

export const tracks = sqliteTable("tracks", {
    id: int("id").primaryKey({ autoIncrement: true }),
    filePath: text("file_path").notNull().unique(),
    artist: text("artist"),
    title: text("title"),

    // Core analysis metrics
    bpm: real("bpm"),
    energy: real("energy"),
    key: text("key"),

    // Fingerprint metrics (0-100 scale)
    danceability: real("danceability"),
    brightness: real("brightness"),
    acousticness: real("acousticness"),
    groove: real("groove"),

    // Track duration in seconds (from audio file metadata)
    duration: int("duration"),

    // Analysis status
    analyzed: int("analyzed", { mode: "boolean" }).default(false),
});

// ============================================================================
// Sessions Table - DJ Set History (Logbook)
// ============================================================================

export const sessions = sqliteTable("sessions", {
    id: int("id").primaryKey({ autoIncrement: true }),

    /** Unique UUID for cloud sync */
    uuid: text("uuid").notNull().unique(),

    /** DJ identity name (for multi-DJ setups) */
    djIdentity: text("dj_identity").default("Default"),

    /** Human-readable session name (e.g., "Friday Night Set #12") */
    name: text("name"),

    /** Unix timestamp when session started */
    startedAt: int("started_at").notNull(),

    /** Unix timestamp when session ended (null if still active) */
    endedAt: int("ended_at"),
});

// ============================================================================
// Plays Table - Track Plays Within Sessions
// ============================================================================

/** Reaction type for a played track */
export type PlayReaction = "neutral" | "peak" | "brick";

export const plays = sqliteTable("plays", {
    id: int("id").primaryKey({ autoIncrement: true }),

    /** Reference to the session this play belongs to */
    sessionId: int("session_id").notNull(),

    /** Reference to the track that was played */
    trackId: int("track_id").notNull(),

    /** Unix timestamp when the track was played */
    playedAt: int("played_at").notNull(),

    /** Duration in seconds (null if unknown) */
    duration: int("duration"),

    /** DJ's reaction/rating: 'neutral', 'peak', 'brick' */
    reaction: text("reaction").default("neutral"),

    /** DJ notes about this play */
    notes: text("notes"),

    /** Count of likes from live listeners */
    dancerLikes: int("dancer_likes").default(0),
});
