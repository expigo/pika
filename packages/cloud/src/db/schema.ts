/**
 * Pika! Cloud Database Schema
 * PostgreSQL schema for session persistence, played tracks, and likes.
 */

import { integer, json, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";

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
export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  djUserId: integer("dj_user_id").references(() => djUsers.id), // Optional for now (backward compatibility)
  djName: text("dj_name").notNull(),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
});

// ============================================================================
// Played Tracks Table
// ============================================================================

/**
 * Tracks played during a session.
 * Includes BPM, key, and fingerprint data for analytics and set flow visualization.
 */
export const playedTracks = pgTable("played_tracks", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  artist: text("artist").notNull(),
  title: text("title").notNull(),
  // Raw metadata for reference
  rawArtist: text("raw_artist"),
  rawTitle: text("raw_title"),
  // Core metrics
  bpm: integer("bpm"),
  key: text("key"),
  // Fingerprint metrics (0-100 scale)
  energy: integer("energy"),
  danceability: integer("danceability"),
  brightness: integer("brightness"),
  acousticness: integer("acousticness"),
  groove: integer("groove"),
  // Timestamp
  playedAt: timestamp("played_at").defaultNow().notNull(),
});

// ============================================================================
// Likes Table
// ============================================================================

/**
 * Listener likes for tracks during a session.
 * clientId allows tracking "my likes" for each dancer (browser-based identity).
 */
export const likes = pgTable("likes", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").references(() => sessions.id),
  clientId: text("client_id"), // Browser-based identity for "my likes"

  playedTrackId: integer("played_track_id")
    .notNull()
    .references(() => playedTracks.id, { onDelete: "cascade" }), // Link to specific play instance
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// Tempo Votes Table
// ============================================================================

/**
 * Aggregated tempo votes per track per session.
 * Captured when track changes (snapshot of dancer feedback).
 * Used for post-session analysis in recap.
 */
export const tempoVotes = pgTable("tempo_votes", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  trackArtist: text("track_artist").notNull(),
  trackTitle: text("track_title").notNull(),
  slowerCount: integer("slower_count").notNull().default(0),
  perfectCount: integer("perfect_count").notNull().default(0),
  fasterCount: integer("faster_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ============================================================================
// Polls Table
// ============================================================================

/**
 * Live polls created by DJs during sessions.
 * DJs can ask questions like "What vibe next? Pop / Blues / Electro"
 */
export const polls = pgTable("polls", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id),
  question: text("question").notNull(),
  options: json("options").$type<string[]>().notNull(), // JSON array: ["Pop", "Blues", "Electro"]
  status: text("status").notNull().default("active"), // active, closed
  // Track context: what was playing when poll was created
  currentTrackArtist: text("current_track_artist"),
  currentTrackTitle: text("current_track_title"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  endedAt: timestamp("ended_at"),
});

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
      .references(() => polls.id),
    clientId: text("client_id").notNull(), // Browser identity
    optionIndex: integer("option_index").notNull(), // Which option they voted for (0-indexed)
    votedAt: timestamp("voted_at").defaultNow().notNull(),
  },
  (table) => ({
    // Unique constraint: one vote per client per poll
    uniqueVote: unique().on(table.pollId, table.clientId),
  }),
);
