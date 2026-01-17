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

  // Analysis version - enables re-analysis when algorithm changes
  // Tracks with version < CURRENT_ANALYSIS_VERSION need re-analysis
  analysisVersion: int("analysis_version").default(0),

  // Two-Tier Track Key System
  trackKey: text("track_key"),

  // Custom tags (JSON array: ["blues", "competition", "opener"])
  tags: text("tags").default("[]"),

  // DJ personal notes for the track
  notes: text("notes"),
});

// ============================================================================
// Sessions Table - DJ Set History (Logbook)
// ============================================================================

export const sessions = sqliteTable("sessions", {
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

export const savedSetTracks = sqliteTable("saved_set_tracks", {
  id: int("id").primaryKey({ autoIncrement: true }),

  /** Reference to the saved set */
  setId: int("set_id").notNull(),

  /** Reference to the track */
  trackId: int("track_id").notNull(),

  /** Position in the set (0-indexed) */
  position: int("position").notNull(),
});
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
