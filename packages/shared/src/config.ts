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
  CLEANUP_INTERVAL: 5 * 60 * 1000, // 5 minutes
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
  WS_CONNECT_RATE_LIMIT_MAX: 20, // per minute
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
      case "production":
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
      case "production":
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
      case "production":
      default:
        return "wss://api.pika.stream";
    }
  },
} as const;
