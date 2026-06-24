import { sql } from "drizzle-orm";
import { index, int, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// ============================================================================
// Tracks Table - Music Library
// ============================================================================

export const tracks = sqliteTable(
  "tracks",
  {
    id: int("id").primaryKey({ autoIncrement: true }),
    filePath: text("file_path").notNull().unique(),
    artist: text("artist"),
    title: text("title"),

    // Raw (unnormalized) artist/title as read from VirtualDJ before cleanup (Ghost Data fix).
    rawArtist: text("raw_artist"),
    rawTitle: text("raw_title"),

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

    // Analysis version - enables re-analysis when algorithm changes
    analysisVersion: int("analysis_version").default(0),

    // Two-Tier Track Key System
    trackKey: text("track_key"),

    // Custom tags (JSON array: ["blues", "competition", "opener"])
    tags: text("tags").default("[]"),

    // DJ personal notes for the track
    notes: text("notes"),
  },
  (t) => ({
    // UNIQUE so the same normalized artist::title can't be inserted twice.
    trackKeyIdx: uniqueIndex("idx_track_key").on(t.trackKey),
    analyzedIdx: index("idx_tracks_analyzed").on(t.analyzed),
  }),
);

// ============================================================================
// Sessions Table - DJ Set History (Logbook)
// ============================================================================

export const sessions = sqliteTable(
  "sessions",
  {
    id: int("id").primaryKey({ autoIncrement: true }),

    /** Unique UUID for cloud sync */
    uuid: text("uuid").notNull().unique(),

    /** Cloud session ID (pika_xxx format) for recap link */
    cloudSessionId: text("cloud_session_id"),

    /** DJ identity name (for multi-DJ setups) */
    djIdentity: text("dj_identity").default("Default"),

    /** Human-readable session name (e.g., "Friday Night Set #12") */
    name: text("name"),

    /** Unix timestamp when session started */
    startedAt: int("started_at").notNull(),

    /** Unix timestamp when session ended (null if still active) */
    endedAt: int("ended_at"),
  },
  (t) => ({
    endedAtIdx: index("idx_sessions_ended_at").on(t.endedAt),
    startedAtIdx: index("idx_sessions_started_at").on(t.startedAt),
    // Partial index for ultra-fast active-session lookups. (SQLite scans a plain
    // started_at index in either direction; drizzle-sqlite has no per-column order.)
    activeIdx: index("idx_sessions_active").on(t.startedAt).where(sql`ended_at IS NULL`),
  }),
);

// ============================================================================
// Plays Table - Track Plays Within Sessions
// ============================================================================

/** Reaction type for a played track */
export type PlayReaction = "neutral" | "peak" | "brick";

export const plays = sqliteTable(
  "plays",
  {
    id: int("id").primaryKey({ autoIncrement: true }),

    /** Reference to the session this play belongs to */
    sessionId: int("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),

    /** Reference to the track that was played */
    trackId: int("track_id")
      .notNull()
      .references(() => tracks.id),

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
  },
  (t) => ({
    sessionIdIdx: index("idx_plays_session_id").on(t.sessionId),
    trackIdIdx: index("idx_plays_track_id").on(t.trackId),
    reactionIdx: index("idx_plays_reaction").on(t.reaction),
    playedAtIdx: index("idx_plays_played_at").on(t.playedAt),
    // Composite index for high-performance track-history lookups.
    trackPlayedIdx: index("idx_plays_track_played").on(t.trackId, t.playedAt),
  }),
);

// ============================================================================
// Saved Sets Table - Named Playlists
// ============================================================================

export const savedSets = sqliteTable("saved_sets", {
  id: int("id").primaryKey({ autoIncrement: true }),

  /** Name of the saved set */
  name: text("name").notNull(),

  /** Optional description/notes */
  description: text("description"),

  /** Unix timestamp when set was created */
  createdAt: int("created_at").notNull(),

  /** Unix timestamp when set was last modified */
  updatedAt: int("updated_at").notNull(),
});

// ============================================================================
// Saved Set Tracks - Track Order Within Saved Sets
// ============================================================================

export const savedSetTracks = sqliteTable(
  "saved_set_tracks",
  {
    id: int("id").primaryKey({ autoIncrement: true }),

    /** Reference to the saved set */
    setId: int("set_id")
      .notNull()
      .references(() => savedSets.id, { onDelete: "cascade" }),

    /** Reference to the track */
    trackId: int("track_id")
      .notNull()
      .references(() => tracks.id),

    /** Position in the set (0-indexed) */
    position: int("position").notNull(),
  },
  (t) => ({
    setIdIdx: index("idx_saved_set_tracks_set_id").on(t.setId),
    trackIdIdx: index("idx_saved_set_tracks_track_id").on(t.trackId),
  }),
);

// ============================================================================
// Offline Queue Table - Persist messages when valid connection is lost
// ============================================================================

export const offlineQueue = sqliteTable("offline_queue", {
  id: int("id").primaryKey({ autoIncrement: true }),

  /** JSON payload of the message */
  payload: text("payload").notNull(),

  /** Unix timestamp when message was queued */
  createdAt: int("created_at").notNull(),
});

// ============================================================================
// Settings Table - App Configuration
// ============================================================================

export const settings = sqliteTable("settings", {
  /** Setting key (e.g., "analysis.onTheFly") */
  key: text("key").primaryKey(),

  /** Setting value as JSON string */
  value: text("value").notNull(),

  /** Unix timestamp when setting was last updated */
  updatedAt: int("updated_at").notNull(),
});

// ============================================================================
// Set Templates Table - Reusable set structures (Phase 2.3)
// ============================================================================

export const setTemplates = sqliteTable("set_templates", {
  id: int("id").primaryKey({ autoIncrement: true }),

  /** Template name (e.g., "3-Hour Social Dance") */
  name: text("name").notNull(),

  /** Optional description */
  description: text("description"),

  /**
   * JSON array of slot definitions:
   * [{ position: 1, targetBpmMin: 70, targetBpmMax: 80, targetEnergy: 6, notes: "Opener" }, ...]
   */
  slots: text("slots").notNull(),

  /** Unix timestamp when created */
  createdAt: int("created_at").notNull(),

  /** Unix timestamp when last updated */
  updatedAt: int("updated_at").notNull(),
});
