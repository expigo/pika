/**
 * Pika! Cloud Database Schema
 * PostgreSQL schema for session persistence, played tracks, and likes.
 */

import { pgTable, text, timestamp, serial } from "drizzle-orm/pg-core";

// ============================================================================
// Sessions Table
// ============================================================================

/**
 * DJ sessions - tracks when a DJ goes live and ends their set.
 */
export const sessions = pgTable("sessions", {
    id: text("id").primaryKey(),
    djName: text("dj_name").notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
});

// ============================================================================
// Played Tracks Table
// ============================================================================

/**
 * Tracks played during a session.
 */
export const playedTracks = pgTable("played_tracks", {
    id: serial("id").primaryKey(),
    sessionId: text("session_id").notNull().references(() => sessions.id),
    artist: text("artist").notNull(),
    title: text("title").notNull(),
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
    clientId: text("client_id"),  // Browser-based identity for "my likes"
    trackArtist: text("track_artist").notNull(),
    trackTitle: text("track_title").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
});
