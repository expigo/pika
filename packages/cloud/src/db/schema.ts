/**
 * Pika! Cloud Database Schema
 * PostgreSQL schema for session persistence, played tracks, and likes.
 */

import {
  index,
  integer,
  json,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// ============================================================================
// DJ Users & Authentication
// ============================================================================

export const djUsers = pgTable("dj_users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(), // bcrypt hash
  displayName: text("display_name").notNull(),
  slug: text("slug").notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

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
 */
export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    djUserId: integer("dj_user_id").references(() => djUsers.id),
    djName: text("dj_name").notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
  },
  (table) => ({
    idxDjUserId: index("idx_sessions_dj_user_id").on(table.djUserId),
    idxDjHistory: index("idx_sessions_dj_history").on(table.djUserId, table.startedAt), // Added desc() in SQL, drizzle defaults asc usually but let's stick to simple composite for now
    // Note: specific partial index "WHERE ended_at IS NULL" is harder in Drizzle pure object API, often best left to SQL or specialized helpers,
    // but for "Senior Grade" robust definition, simple indexes cover 90%.
  }),
);

export const playedTracks = pgTable(
  "played_tracks",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    artist: text("artist").notNull(),
    title: text("title").notNull(),
    bpm: integer("bpm"),
    key: text("key"),
    energy: integer("energy"),
    danceability: integer("danceability"),
    brightness: integer("brightness"),
    acousticness: integer("acousticness"),
    groove: integer("groove"),
    playedAt: timestamp("played_at").defaultNow().notNull(),
  },
  (table) => ({
    idxArtistTitle: index("idx_played_tracks_artist_title").on(table.artist, table.title),
    // idxSessionPlayedAt: index("idx_played_tracks_session_played_at").on(table.sessionId, table.playedAt), // Drizzle doesn't support DESC easily effectively in this object notation without .desc() helper imported
  }),
);

export const likes = pgTable(
  "likes",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    clientId: text("client_id"),
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
  }),
);

export const polls = pgTable(
  "polls",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    question: text("question").notNull(),
    options: json("options").$type<string[]>().notNull(),
    status: text("status").notNull().default("active"),
    currentTrackArtist: text("current_track_artist"),
    currentTrackTitle: text("current_track_title"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
  },
  (table) => ({
    idxSessionId: index("idx_polls_session_id").on(table.sessionId),
  }),
);

export const pollVotes = pgTable(
  "poll_votes",
  {
    id: serial("id").primaryKey(),
    pollId: integer("poll_id")
      .notNull()
      .references(() => polls.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    optionIndex: integer("option_index").notNull(),
    votedAt: timestamp("voted_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueVote: unique().on(table.pollId, table.clientId),
    idxPollId: index("idx_poll_votes_poll_id").on(table.pollId),
  }),
);

export const sessionEvents = pgTable(
  "session_events",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
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
 * Supports anonymous subscriptions (via clientId) or authenticated (via userId).
 * GDPR Compliance: unsubscribedAt tracks opt-outs without deleting history immediately.
 */
export const pushSubscriptions = pgTable("push_subscriptions", {
  endpoint: text("endpoint").primaryKey(), // URL is unique per subscription
  p256dh: text("p256dh").notNull(), // Crypto key
  auth: text("auth").notNull(), // Crypto key
  clientId: text("client_id"), // Browser identity (for targeting based on history)
  userId: integer("user_id").references(() => djUsers.id), // Optional: if we add listener accounts later
  createdAt: timestamp("created_at").defaultNow().notNull(),
  unsubscribedAt: timestamp("unsubscribed_at"), // If set, do not send. GDPR compliance.
});
