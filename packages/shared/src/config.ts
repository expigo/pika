/**
 * Pika! Shared Configuration
 * Central source of truth for system constants, timeouts, limits, and URLs.
 */

import type { PikaEnvironment } from "./protocol";

// ============================================================================
// Timeouts (All values in milliseconds)
// ============================================================================
export const TIMEOUTS = {
  // WebSocket & Network
  SOCKET_CONNECTION: 5000,
  SOCKET_ABORT: 10000,
  SOCKET_RECONNECT_MIN: 1000,
  SOCKET_RECONNECT_MAX: 30000,
  ACK_TIMEOUT: 5000,
  TOKEN_REVALIDATION_INTERVAL: 60 * 60 * 1000, // 1 hour (L1)

  // Data Processing
  LIKE_STORAGE_DEBOUNCE: 1000,
  BATCH_FLUSH_INTERVAL: 5000,
  CACHE_CLEANUP_INTERVAL: 60000,
  MIN_BROADCAST_INTERVAL: 5000,

  // UI/UX
  TOAST_DURATION: 3000,
  ANNOUNCEMENT_MIN_DURATION: 15, // seconds
  ANNOUNCEMENT_MAX_DURATION: 300, // seconds
  POLL_MIN_DURATION: 30, // seconds
  POLL_MAX_DURATION: 300, // seconds
  UI_ANIMATION_PULSE_FAST: 500,
  UI_ANIMATION_PULSE_NORMAL: 1000,
  UI_ANIMATION_PULSE_SLOW: 2000,

  // System
  SHUTDOWN_FORCE_EXIT: 5000,
  SHUTDOWN_GRACE_PERIOD: 500,
  BROADCAST_DEBOUNCE: 2000,
  CLEANUP_INTERVAL: 60 * 1000, // 1 minute
  OFFLINE_RETRY_BASE: 500,
} as const;

// ============================================================================
// Limits & capacities
// ============================================================================
export const LIMITS = {
  // Rate Limiting
  AUTH_RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 min
  AUTH_RATE_LIMIT_MAX: 5,
  LIKE_RATE_LIMIT_WINDOW: 60 * 1000, // 1 min
  LIKE_RATE_LIMIT_MAX: 10,
  // Per-client (clientId) limits on amplifying dancer messages — each fans out
  // to the whole session topic, so they must be bounded to prevent broadcast
  // amplification from a single scripted socket.
  REACTION_RATE_LIMIT_WINDOW: 60 * 1000, // 1 min
  REACTION_RATE_LIMIT_MAX: 15,
  TEMPO_RATE_LIMIT_WINDOW: 60 * 1000, // 1 min
  TEMPO_RATE_LIMIT_MAX: 12,
  BULK_LIKE_RATE_LIMIT_WINDOW: 60 * 1000, // 1 min
  BULK_LIKE_RATE_LIMIT_MAX: 5,
  // Per-IP cap on the public client-likes endpoint (2 DB queries/call) — guards the DB from
  // scraping/abuse. The clientId itself is a 122-bit unguessable bearer id over anonymous data.
  CLIENT_LIKES_RATE_LIMIT_WINDOW: 60 * 1000, // 1 min
  CLIENT_LIKES_RATE_LIMIT_MAX: 30,
  // Per-session cap on push-broadcast announcements (each fans out to every subscriber's device).
  ANNOUNCEMENT_PUSH_RATE_LIMIT_WINDOW: 5 * 60 * 1000, // 5 min
  ANNOUNCEMENT_PUSH_RATE_LIMIT_MAX: 2,
  // Journal export — each call writes a playlist on the shared Spotify service account, so it is
  // bounded three ways: per-IP (below), per-clientId cooldown (journal_playlists.updated_at), and
  // a process-wide daily write budget (in-memory; single-process server per documented architecture).
  JOURNAL_EXPORT_RATE_LIMIT_WINDOW: 60 * 60 * 1000, // 1 hour
  JOURNAL_EXPORT_RATE_LIMIT_MAX: 10, // per IP
  JOURNAL_EXPORT_COOLDOWN_MS: 60 * 1000, // min gap between exports for one clientId
  JOURNAL_EXPORT_GLOBAL_DAILY_MAX: 500, // process-wide daily Spotify-write budget
  JOURNAL_EXPORT_MAX_URIS: 1000, // playlist size cap (earliest likes win)
  // Product telemetry ingest (fire-and-forget beacon; enum-whitelisted events only).
  TELEMETRY_RATE_LIMIT_WINDOW: 60 * 1000, // 1 min
  TELEMETRY_RATE_LIMIT_MAX: 60, // per IP
  MAX_TELEMETRY_PROPS_BYTES: 1024,
  // Per-IP cap on WebSocket *connection* attempts. NOTE: this is keyed on the
  // client IP (CF-Connecting-IP / X-Forwarded-For), so an entire venue behind one
  // NAT shares a single bucket. Keep it generous enough to survive a venue-wide
  // reconnect storm — real abuse protection comes from the idle-connection reaper
  // and the per-client message limits above, not this. Tune via WS_RATE_LIMIT env.
  WS_CONNECT_RATE_LIMIT_MAX: 120, // per minute, per IP
  WS_CONNECT_RATE_LIMIT_WINDOW: 60 * 1000, // 1 min

  // Data Size
  MAX_BACKPRESSURE_BUFFER: 64 * 1024, // 64KB
  MAX_POLL_OPTIONS: 10,
  MIN_POLL_OPTIONS: 2,
  MAX_ANNOUNCEMENT_LENGTH: 140, // characters
  MAX_HISTORY_ITEMS: 50, // L7
  MAX_RECAP_ITEMS: 500, // L7
} as const;

// ============================================================================
// URL Factories
// ============================================================================
export const URLS = {
  getApiUrl: (env: PikaEnvironment = "production"): string => {
    switch (env) {
      case "development":
        return "http://localhost:3001";
      case "staging":
        return "https://staging-api.pika.stream";
      default:
        return "https://api.pika.stream";
    }
  },

  getWebUrl: (env: PikaEnvironment = "production"): string => {
    switch (env) {
      case "development":
        return "http://localhost:3000";
      case "staging":
        return "https://staging.pika.stream";
      default:
        return "https://pika.stream";
    }
  },

  getWsUrl: (env: PikaEnvironment = "production"): string => {
    switch (env) {
      case "development":
        return "ws://localhost:3001";
      case "staging":
        return "wss://staging-api.pika.stream";
      default:
        return "wss://api.pika.stream";
    }
  },
} as const;
