/**
 * Pika! Cloud Database Schema
 * PostgreSQL schema for session persistence, played tracks, and likes.
 */

import {
  check,
  index,
  integer,
  json,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// ============================================================================
// DJ Users & Authentication
// ============================================================================

/**
 * DJ Accounts for authentication and profile management.
 */
export const djUsers = pgTable("dj_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(), // bcrypt hash for security
  displayName: text("display_name").notNull(),
  slug: text("slug").notNull().unique(), // URL-friendly profile path
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/**
 * Persisted API/Session tokens for DJ authentication.
 * Allows multiple devices/keys per DJ account.
 */
export const djTokens = pgTable("dj_tokens", {
  id: serial("id").primaryKey(),
  djUserId: integer("dj_user_id")
    .notNull()
    .references(() => djUsers.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  name: text("name").default("Default"),
  lastUsed: timestamp("last_used"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// Sessions Table
// ============================================================================

/**
 * DJ sessions - tracks when a DJ goes live and ends their set.
 * Crucial for historical reporting and session-based likes.
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    djUserId: integer("dj_user_id").references(() => djUsers.id), // Optional for legacy compatibility
    djName: text("dj_name").notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
  },
  (table) => ({
    idxDjUserId: index("idx_sessions_dj_user_id").on(table.djUserId),
    // Composite index for fast history lookup ordered by time
    idxDjHistory: index("idx_sessions_dj_history").on(table.djUserId, table.startedAt.desc()),
    // Partial index for ultra-fast active session lookups (Dashboard/Live query)
    idxSessionsActive: index("idx_sessions_active").on(table.endedAt).where(sql`ended_at IS NULL`),
  }),
);

// ============================================================================
// Played Tracks Table
// ============================================================================

/**
 * Tracks played during a session.
 * Includes BPM, key, and fingerprint data for analytics and set flow visualization.
 */
export const playedTracks = pgTable(
  "played_tracks",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    artist: text("artist").notNull(),
    title: text("title").notNull(),
    // Core metrics
    bpm: integer("bpm"),
    key: text("key"),
    // Fingerprint metrics (0-100 scale) for energy flow analysis
    energy: integer("energy"),
    danceability: integer("danceability"),
    brightness: integer("brightness"),
    acousticness: integer("acousticness"),
    groove: integer("groove"),
    // Timestamp of when the track started playing
    playedAt: timestamp("played_at").defaultNow().notNull(),
  },
  (table) => ({
    // Fast lookup for history and "Similar Tracks" logic
    idxArtistTitle: index("idx_played_tracks_artist_title").on(table.artist, table.title),
    // Composite index for session history ordered by time (descending)
    idxSessionPlayedAt: index("idx_played_tracks_session_played_at").on(
      table.sessionId,
      table.playedAt.desc(),
    ),
    // Data Integrity: Metric Ranges (0-100)
    chkEnergy: check("chk_energy_range", sql`energy IS NULL OR (energy >= 0 AND energy <= 100)`),
    chkDanceability: check(
      "chk_danceability_range",
      sql`danceability IS NULL OR (danceability >= 0 AND danceability <= 100)`,
    ),
    chkBrightness: check(
      "chk_brightness_range",
      sql`brightness IS NULL OR (brightness >= 0 AND brightness <= 100)`,
    ),
    chkAcousticness: check(
      "chk_acousticness_range",
      sql`acousticness IS NULL OR (acousticness >= 0 AND acousticness <= 100)`,
    ),
    chkGroove: check("chk_groove_range", sql`groove IS NULL OR (groove >= 0 AND groove <= 100)`),
    // Data Integrity: BPM Range (20-300)
    chkBpm: check("chk_bpm_range", sql`bpm IS NULL OR (bpm >= 20 AND bpm <= 300)`),
  }),
);

// ============================================================================
// Likes Table
// ============================================================================

/**
 * Listener likes for tracks during a session.
 * clientId allows tracking "my likes" for each dancer (browser-based identity).
 */
export const likes = pgTable(
  "likes",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    clientId: text("client_id"), // Anonymous browser identity
    playedTrackId: integer("played_track_id")
      .notNull()
      .references(() => playedTracks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    idxSessionId: index("idx_likes_session_id").on(table.sessionId),
    idxClientId: index("idx_likes_client_id").on(table.clientId),
    idxPlayedTrackId: index("idx_likes_played_track_id").on(table.playedTrackId),
  }),
);

// ============================================================================
// Tempo Votes Table
// ============================================================================

/**
 * Aggregated tempo feedback for a track in a session.
 * Captured when track changes (snapshot of dancer sentiment).
 */
export const tempoVotes = pgTable(
  "tempo_votes",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    trackArtist: text("track_artist").notNull(),
    trackTitle: text("track_title").notNull(),
    slowerCount: integer("slower_count").notNull().default(0),
    perfectCount: integer("perfect_count").notNull().default(0),
    fasterCount: integer("faster_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    idxSessionId: index("idx_tempo_votes_session_id").on(table.sessionId),
    // Data Integrity: Positive counts
    chkSlowerPositive: check("chk_slower_count_positive", sql`slower_count >= 0`),
    chkPerfectPositive: check("chk_perfect_count_positive", sql`perfect_count >= 0`),
    chkFasterPositive: check("chk_faster_count_positive", sql`faster_count >= 0`),
  }),
);

// ============================================================================
// Polls Table
// ============================================================================

/**
 * Live polls created by DJs during sessions.
 * Helps drive floor consensus on music direction.
 */
export const polls = pgTable(
  "polls",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    options: json("options").$type<string[]>().notNull(), // ["Blues", "Pop", "Electro"]
    status: text("status").notNull().default("active"), // active, closed
    currentTrackArtist: text("current_track_artist"),
    currentTrackTitle: text("current_track_title"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
  },
  (table) => ({
    idxSessionId: index("idx_polls_session_id").on(table.sessionId),
  }),
);

// ============================================================================
// Poll Votes Table
// ============================================================================

/**
 * Individual votes on polls.
 * One vote per client per poll (enforced via unique constraint).
 */
export const pollVotes = pgTable(
  "poll_votes",
  {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(), // Anonymous browser identity
    optionIndex: integer("option_index").notNull(), // 0-indexed reference to poll.options
    votedAt: timestamp("voted_at").defaultNow().notNull(),
  },
  (table) => ({
    // Prevents double-voting
    uniqueVote: unique().on(table.pollId, table.clientId),
    idxPollId: index("idx_poll_votes_poll_id").on(table.pollId),
    // Data Integrity: Non-negative option reference
    chkOptionIndexPositive: check("chk_option_index_positive", sql`option_index >= 0`),
  }),
);

// ============================================================================
// Session Events Table (Telemetry)
// ============================================================================

/**
 * Session lifecycle events for operational telemetry.
 * Tracks DJ connection stability without collecting PII.
 */
export const sessionEvents = pgTable(
  "session_events",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(), // 'connect', 'disconnect', etc.
    timestamp: timestamp("timestamp").defaultNow().notNull(),
    metadata: json("metadata").$type<{
      reason?: string;
      reconnectMs?: number;
      clientVersion?: string;
    }>(),
  },
  (table) => ({
    idxSessionId: index("idx_session_events_session_id").on(table.sessionId),
  }),
);

// ============================================================================
// Push Notifications Table
// ============================================================================

/**
 * Web Push subscriptions for engaging users.
 * GDPR Compliance: unsubscribedAt tracks opt-outs without deleting history.
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(), // Unique URL per subscription
  p256dh: text("p256dh").notNull(), // Encryption public key
  auth: text("auth").notNull(), // Authentication secret
  clientId: text("client_id"), // Browser identity for targeted notifications
  userId: integer("user_id").references(() => djUsers.id), // Link to DJ if authenticated
  createdAt: timestamp("created_at").defaultNow().notNull(),
  unsubscribedAt: timestamp("unsubscribed_at"), // Opt-out flag
});
