/**
 * Pika! Cloud Database Schema
 * PostgreSQL schema for session persistence, played tracks, and likes.
 */

import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  json,
  pgTable,
  real,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

// Better Auth tables (user/session/account/verification) — CLI-generated, the source of truth for
// auth. Re-exported so `db` (drizzle with `* as schema`) includes them for the Better Auth adapter.
export * from "./auth-schema";

import { user } from "./auth-schema";

// ============================================================================
// DJ Users & Authentication → Better Auth (db/auth-schema.ts)
// ============================================================================
// DJ accounts + tokens are now Better Auth's `user` / `session` / `account` tables. The Pika
// specifics live on `user`: `status` (approval: pending|approved|rejected), `role` (dj|admin),
// `slug` (/dj/[slug] profile path). FK columns below reference `user.id` (text).

// ============================================================================
// Stages & Events (multi-DJ venue model)
// ============================================================================

/**
 * Events - a collection of Stages (e.g. "WCS Budapest 2026"). A persistent
 * context that groups stages for event-wide announcements.
 * ownerUserId (organizer) is nullable; the full identity model is deferred to a
 * separate blueprint.
 */
export const events = pgTable("events", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerUserId: text("owner_user_id").references(() => user.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  archivedAt: timestamp("archived_at"), // soft-delete; preserves history
});

/**
 * Stages - a persistent physical context (e.g. "Main Floor") that outlives any
 * single DJ set. Dancers subscribe to a Stage; sessions run *under* a stage.
 * eventId is nullable: a stand-alone stage (no parent event) is allowed.
 */
export const stages = pgTable(
  "stages",
  {
    id: text("id").primaryKey(),
    eventId: text("event_id").references(() => events.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    archivedAt: timestamp("archived_at"),
  },
  (table) => ({
    idxEventId: index("idx_stages_event_id").on(table.eventId),
  }),
);

/**
 * Stage subscriptions - which anonymous client (clientId) is currently at which
 * stage. The single source of truth for SCOPED push routing:
 *   push_subscriptions JOIN stage_subscriptions ON client_id WHERE stage_id = $1
 * This replaces the unscoped "Global Megaphone" broadcast.
 */
export const stageSubscriptions = pgTable(
  "stage_subscriptions",
  {
    id: serial("id").primaryKey(),
    stageId: text("stage_id")
      .notNull()
      .references(() => stages.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    subscribedAt: timestamp("subscribed_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqueStageClient: unique("unique_stage_client").on(table.stageId, table.clientId),
    idxStageId: index("idx_stage_subscriptions_stage_id").on(table.stageId),
    idxClientId: index("idx_stage_subscriptions_client_id").on(table.clientId),
  }),
);

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
    djUserId: text("dj_user_id").references(() => user.id), // nullable: anonymous/legacy sessions
    stageId: text("stage_id").references(() => stages.id, { onDelete: "set null" }), // nullable: a stage-less session behaves exactly as before
    djName: text("dj_name").notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
    // Slice 5: DJ curates which sessions appear on their public /dj/[slug] profile. Default true so
    // existing sessions stay visible; the DJ opts to hide.
    published: boolean("published").notNull().default(true),
  },
  (table) => ({
    idxDjUserId: index("idx_sessions_dj_user_id").on(table.djUserId),
    idxStageId: index("idx_sessions_stage_id").on(table.stageId),
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
    // Normalized exact key (getTrackKey) — joins to `track_links.match_key` to reach the Spotify
    // identity (and its features) without a denormalized spotify_id that would go stale.
    matchKey: text("match_key"),
    // Core metrics
    bpm: integer("bpm"),
    key: text("key"),
    durationSec: integer("duration_sec"), // track length (B3 — Spotify version-match + analytics)
    // Fingerprint metrics (0-100 scale) for energy flow analysis
    energy: integer("energy"),
    danceability: integer("danceability"),
    brightness: integer("brightness"),
    acousticness: integer("acousticness"),
    groove: integer("groove"),
    // Spotify identity snapshot at play time (Slice 4) — powers album art + "Listen on Spotify" on the
    // recap + my-likes surfaces. Present only for matched tracks (the broadcast carried them); nullable.
    albumArtUrl: text("album_art_url"),
    spotifyUrl: text("spotify_url"),
    // Timestamp of when the track started playing
    playedAt: timestamp("played_at").defaultNow().notNull(),
  },
  (table) => ({
    // Fast lookup for history and "Similar Tracks" logic
    idxArtistTitle: index("idx_played_tracks_artist_title").on(table.artist, table.title),
    // Join key to track_links (→ Spotify identity / features) for the catalog's Pika aggregate.
    idxMatchKey: index("idx_played_tracks_match_key").on(table.matchKey),
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
    // Idempotency: One client can only like a specific play instance once
    uniqueIdempotency: unique("unique_like_idempotency").on(
      table.sessionId,
      table.clientId,
      table.playedTrackId,
    ),
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
  userId: text("user_id").references(() => user.id), // Link to DJ if authenticated
  createdAt: timestamp("created_at").defaultNow().notNull(),
  unsubscribedAt: timestamp("unsubscribed_at"), // Opt-out flag
});

// ============================================================================
// Spotify Connections (Track D — Web DJ Spotify-source broadcaster)
// ============================================================================

/**
 * Per-DJ Spotify account link (BFF). The cloud holds the OAuth refresh token so it can poll
 * the DJ's now-playing server-side. The token is AES-256-GCM encrypted at rest (lib/crypto.ts)
 * and NEVER sent to the browser. One connection per DJ.
 */
export const spotifyConnections = pgTable("spotify_connections", {
  id: serial("id").primaryKey(),
  djUserId: text("dj_user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" })
    .unique(),
  refreshTokenEnc: text("refresh_token_enc").notNull(), // encrypted refresh token
  scope: text("scope").notNull(),
  spotifyUserId: text("spotify_user_id"),
  status: text("status").notNull().default("active"), // 'active' | 'needs_reauth'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ============================================================================
// Live Pollers (Track D — server-side now-playing poll loops)
// ============================================================================

/**
 * One row per active server-side Spotify poll loop ("virtual DJ"). Persisted so loops resume
 * after a cloud restart and so cleanup survives crashes. `leaseOwner` is the seam for future
 * multi-instance coordination (single-instance today; Redis deferred).
 */
export const livePollers = pgTable(
  "live_pollers",
  {
    id: serial("id").primaryKey(),
    djUserId: text("dj_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    sessionId: text("session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("running"), // 'running' | 'paused' | 'stopped'
    leaseOwner: text("lease_owner"), // cloud instance id holding the loop
    heartbeatAt: timestamp("heartbeat_at").defaultNow().notNull(),
    startedAt: timestamp("started_at").defaultNow().notNull(),
  },
  (table) => ({
    idxDjUserId: index("idx_live_pollers_dj_user_id").on(table.djUserId),
    idxStatus: index("idx_live_pollers_status").on(table.status),
    // One poller per session
    uniqueSession: unique("unique_live_poller_session").on(table.sessionId),
  }),
);

// ============================================================================
// Admin Audit (admin panel)
// ============================================================================

/**
 * Append-only log of privileged admin actions (DJ approve/reject, …) for accountability.
 * `adminUserId` is the acting admin; nullable-on-delete so history survives an account removal.
 */
export const adminAudit = pgTable(
  "admin_audit",
  {
    id: serial("id").primaryKey(),
    adminUserId: text("admin_user_id").references(() => user.id, { onDelete: "set null" }),
    action: text("action").notNull(), // e.g. 'dj.approve' | 'dj.reject'
    targetType: text("target_type"), // e.g. 'dj_user'
    targetId: text("target_id"), // stringified id of the target
    metadata: json("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    idxCreatedAt: index("idx_admin_audit_created_at").on(table.createdAt.desc()),
  }),
);

// Canonical track-identity / resolution cache (B3). Maps a fuzzy `artist::title` key to a resolved
// provider track, shared across ALL DJs — a track searched/confirmed once benefits everyone, and is
// the identity spine for future analytics. `manual`/`source:manual` (a DJ confirmation) outranks an
// `auto` match. See docs/blueprints/music-provider-integration.md §5 + §12.
export const trackLinks = pgTable(
  "track_links",
  {
    id: serial("id").primaryKey(),
    matchKey: text("match_key").notNull().unique(), // getTrackKey — EXACT (version-precise) key
    songKey: text("song_key"), // getFuzzyKey — version-collapsing "song" axis for analytics grouping
    provider: text("provider").notNull().default("spotify"), // 'spotify' (Apple later)
    providerId: text("provider_id"), // Spotify track id
    providerUrl: text("provider_url"), // open.spotify.com/track/...
    status: text("status").notNull().default("matched"), // 'matched' | 'unmatched' | 'manual'
    confidence: real("confidence"), // 0..1 from the match tier (null for manual)
    source: text("source").notNull().default("auto"), // 'auto' | 'manual' | 'playlist'
    resolvedAt: timestamp("resolved_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    idxProviderId: index("idx_track_links_provider_id").on(table.providerId),
    idxSongKey: index("idx_track_links_song_key").on(table.songKey),
  }),
);

// A WCS DJ's curated Spotify repertoire (B3 seed) — what a DJ PUTS IN A PLAYLIST, distinct from
// what they PLAYED live (`played_tracks`). Seeded via the app token from public playlists (no DJ
// OAuth). Also the Spotify-metadata cache the future "songs catalog" admin view reads.
export const curatedTracks = pgTable(
  "curated_tracks",
  {
    id: serial("id").primaryKey(),
    djUserId: text("dj_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    spotifyId: text("spotify_id").notNull(),
    name: text("name").notNull(),
    artists: text("artists").notNull(),
    durationMs: integer("duration_ms"),
    albumArtUrl: text("album_art_url"),
    playlistName: text("playlist_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqDjTrack: unique("uniq_curated_dj_track").on(table.djUserId, table.spotifyId),
    idxSpotifyId: index("idx_curated_spotify_id").on(table.spotifyId),
  }),
);

// Spotify's OWN audio features (tempo/key/energy/…), CANONICAL per Spotify track id — one row per
// URI, shared across all DJs (unlike `curated_tracks`, which is the per-(DJ,track) curation edge).
// Spotify deprecated this endpoint for new apps, so these arrive only via the Exportify CSV import
// (B3). Kept STRICTLY SEPARATE from Pika's own sidecar features (per-file, 0-100, on `played_tracks`):
// same concept, different source/scale — never conflated. Native Spotify scales preserved.
export const spotifyTrackFeatures = pgTable("spotify_track_features", {
  spotifyId: text("spotify_id").primaryKey(), // Spotify track id (canonical join key)
  tempo: real("tempo"), // BPM
  keyPitch: integer("key_pitch"), // pitch class 0-11 (-1 = none)
  mode: integer("mode"), // 0 minor, 1 major
  energy: real("energy"), // 0-1
  danceability: real("danceability"), // 0-1
  valence: real("valence"), // 0-1
  acousticness: real("acousticness"), // 0-1
  instrumentalness: real("instrumentalness"), // 0-1
  liveness: real("liveness"), // 0-1
  speechiness: real("speechiness"), // 0-1
  loudness: real("loudness"), // dB
  timeSignature: integer("time_signature"),
  popularity: integer("popularity"), // 0-100
  releaseDate: text("release_date"),
  genres: text("genres"),
  recordLabel: text("record_label"),
  isrc: text("isrc"), // recording id (Chosic CSV) — Apple cross-match key; Exportify lacks it
  camelot: text("camelot"), // harmonic-mixing wheel notation e.g. "9B" (Chosic CSV)
  // Provenance of the numeric feature block, driving accretive-merge precision precedence
  // (exportify 0-1 floats > chosic rounded 0-100 ints > other). Never let a rounded value clobber a float.
  featuresSource: text("features_source"), // 'exportify' | 'chosic' | 'csv'
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Playlists as first-class entities (B3) — a DJ's named curated list (CSV import or profile). A track
// belongs to MANY playlists, so playlist membership lives in `curated_playlist_tracks` (the per-(dj,
// track) `curated_tracks.playlist_name` only ever held the LAST import — lossy). This is what powers a
// song's "appears in" view and, later, DJ-facing playlist pages.
export const curatedPlaylists = pgTable(
  "curated_playlists",
  {
    id: serial("id").primaryKey(),
    djUserId: text("dj_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    source: text("source").notNull().default("csv"), // 'csv' | 'profile'
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqDjName: unique("uniq_curated_playlist_dj_name").on(table.djUserId, table.name),
    idxDjUserId: index("idx_curated_playlists_dj_user_id").on(table.djUserId),
  }),
);

// Slice 5: DJ-pasted public Spotify playlists embedded on their /dj/[slug] profile (cap-free — a plain
// iframe, no OAuth/matching). Distinct from `curated_playlists` (B3 catalog-seed infra).
export const djPlaylists = pgTable(
  "dj_playlists",
  {
    id: serial("id").primaryKey(),
    djUserId: text("dj_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    spotifyPlaylistId: text("spotify_playlist_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqDjPlaylist: unique("uniq_dj_playlist").on(table.djUserId, table.spotifyPlaylistId),
    idxDjUserId: index("idx_dj_playlists_dj_user_id").on(table.djUserId),
  }),
);

// Membership edge: which Spotify track is in which curated playlist. The join that makes "this song
// appears in playlists X/Y across DJs A/B" answerable.
export const curatedPlaylistTracks = pgTable(
  "curated_playlist_tracks",
  {
    id: serial("id").primaryKey(),
    playlistId: integer("playlist_id")
      .notNull()
      .references(() => curatedPlaylists.id, { onDelete: "cascade" }),
    spotifyId: text("spotify_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    uniqPlaylistTrack: unique("uniq_curated_playlist_track").on(table.playlistId, table.spotifyId),
    idxSpotifyId: index("idx_curated_playlist_tracks_spotify_id").on(table.spotifyId),
  }),
);

// Shared service accounts Pika controls (B3): the single "Pika" Spotify account that owns every
// generated playlist (scope playlist-modify-public). Owner connects it ONCE per env via the
// admin OAuth flow; the encrypted refresh token lets the cloud create playlists on its behalf.
export const serviceConnections = pgTable("service_connections", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(), // logical slot, e.g. 'spotify-playlist'
  refreshTokenEnc: text("refresh_token_enc").notNull(), // encrypted (AES-256-GCM)
  scope: text("scope").notNull(),
  spotifyUserId: text("spotify_user_id"),
  status: text("status").notNull().default("active"), // 'active' | 'needs_reauth'
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
