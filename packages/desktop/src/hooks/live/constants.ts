import { TIMEOUTS, LIMITS } from "@pika/shared";

// =============================================================================
// Timing Constants
// =============================================================================

/** Interval for VirtualDJ file watcher polling */
export const VDJ_WATCH_INTERVAL_MS = 2000;

/** WebSocket connection timeout */
export const CONNECTION_TIMEOUT_MS = TIMEOUTS.SOCKET_CONNECTION;

/** Maximum time to wait for ACK from server */
export const ACK_TIMEOUT_MS = TIMEOUTS.ACK_TIMEOUT;

/** Time window for batching like notifications */
export const LIKE_BATCH_TIMEOUT_MS = 3000; // UI specific

/** Time window for track deduplication */
export const TRACK_DEDUP_WINDOW_MS = 60000; // Logic specific

/** Timeout for fingerprint sync API call */
export const FINGERPRINT_SYNC_TIMEOUT_MS = TIMEOUTS.SOCKET_ABORT;

// =============================================================================
// Retry Configuration
// =============================================================================

/** Maximum retry attempts for failed messages */
export const MAX_RETRIES = 3;

/** Exponential backoff delays for retries */
export const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

/** Maximum reconnection attempts for WebSocket */
export const MAX_RECONNECT_ATTEMPTS = 10;

/** Minimum delay between reconnection attempts */
export const MIN_RECONNECTION_DELAY_MS = TIMEOUTS.SOCKET_RECONNECT_MIN;

/** Maximum delay between reconnection attempts */
export const MAX_RECONNECTION_DELAY_MS = TIMEOUTS.SOCKET_RECONNECT_MAX;

// =============================================================================
// Batch Thresholds
// =============================================================================

/** Number of likes before showing toast immediately */
export const LIKE_BATCH_THRESHOLD = 5;

/** Number of queued messages before showing sync toast */
export const QUEUE_TOAST_THRESHOLD = 5;

/** Debounce interval for batching like storage to DB */
export const LIKE_STORAGE_DEBOUNCE_MS = TIMEOUTS.LIKE_STORAGE_DEBOUNCE;

/** Maximum consecutive failures before stopping queue flush */
export const MAX_CONSECUTIVE_FAILURES = 3;

// =============================================================================
// Queue Flush Delays
// =============================================================================

/** Base delay between queue message sends */
export const QUEUE_FLUSH_BASE_DELAY_MS = 100;

/** Maximum delay between queue message sends */
export const QUEUE_FLUSH_MAX_DELAY_MS = 2000;

// =============================================================================
// Special Values
// =============================================================================

/** ID used for optimistic poll updates before server assigns real ID */
export const OPTIMISTIC_POLL_ID = -1;

/** Prefix for ghost tracks */
export const GHOST_FILE_PREFIX = "ghost://";

// =============================================================================
// Validation Limits
// =============================================================================

/** Minimum poll options required */
export const MIN_POLL_OPTIONS = LIMITS.MIN_POLL_OPTIONS;

/** Maximum poll options allowed */
export const MAX_POLL_OPTIONS = LIMITS.MAX_POLL_OPTIONS;

/** Minimum poll duration in seconds */
export const MIN_POLL_DURATION_SECONDS = TIMEOUTS.POLL_MIN_DURATION;

/** Maximum poll duration in seconds */
export const MAX_POLL_DURATION_SECONDS = TIMEOUTS.POLL_MAX_DURATION;

/** Maximum announcement message length */
export const MAX_ANNOUNCEMENT_LENGTH = LIMITS.MAX_ANNOUNCEMENT_LENGTH;

/** Minimum announcement duration in seconds */
export const MIN_ANNOUNCEMENT_DURATION_SECONDS = TIMEOUTS.ANNOUNCEMENT_MIN_DURATION;

/** Maximum announcement duration in seconds */
export const MAX_ANNOUNCEMENT_DURATION_SECONDS = TIMEOUTS.ANNOUNCEMENT_MAX_DURATION;

// =============================================================================
// Auth Token Configuration
// =============================================================================

/** Interval for periodic token revalidation (1 hour) */
export const TOKEN_REVALIDATION_INTERVAL_MS = TIMEOUTS.HEARTBEAT_INTERVAL;

/** Minimum time since last validation before revalidating on focus (5 minutes) */
export const TOKEN_FOCUS_REVALIDATION_MIN_MS = 5 * 60 * 1000;
