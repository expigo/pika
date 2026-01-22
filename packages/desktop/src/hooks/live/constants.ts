/**
 * Live Session Constants
 *
 * All magic numbers and strings centralized for maintainability.
 * Each constant has a clear name indicating its unit and purpose.
 *
 * @package @pika/desktop
 */

// =============================================================================
// Timing Constants
// =============================================================================

/** Interval for VirtualDJ file watcher polling */
export const VDJ_WATCH_INTERVAL_MS = 2000;

/** WebSocket connection timeout */
export const CONNECTION_TIMEOUT_MS = 5000;

/** Maximum time to wait for ACK from server */
export const ACK_TIMEOUT_MS = 5000;

/** Time window for batching like notifications */
export const LIKE_BATCH_TIMEOUT_MS = 3000;

/** Time window for track deduplication (same track within window = skip) */
export const TRACK_DEDUP_WINDOW_MS = 60000;

/** Timeout for fingerprint sync API call */
export const FINGERPRINT_SYNC_TIMEOUT_MS = 10000;

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
export const MIN_RECONNECTION_DELAY_MS = 1000;

/** Maximum delay between reconnection attempts */
export const MAX_RECONNECTION_DELAY_MS = 10000;

// =============================================================================
// Batch Thresholds
// =============================================================================

/** Number of likes before showing toast immediately */
export const LIKE_BATCH_THRESHOLD = 5;

/** Number of queued messages before showing sync toast */
export const QUEUE_TOAST_THRESHOLD = 5;

/** Debounce interval for batching like storage to DB (prevents spam writes) */
export const LIKE_STORAGE_DEBOUNCE_MS = 2000;

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

/** Prefix for ghost tracks (tracks without file path) */
export const GHOST_FILE_PREFIX = "ghost://";

// =============================================================================
// Validation Limits
// =============================================================================

/** Minimum poll options required */
export const MIN_POLL_OPTIONS = 2;

/** Maximum poll options allowed */
export const MAX_POLL_OPTIONS = 10;

/** Minimum poll duration in seconds */
export const MIN_POLL_DURATION_SECONDS = 10;

/** Maximum poll duration in seconds (1 hour) */
export const MAX_POLL_DURATION_SECONDS = 3600;

/** Maximum announcement message length */
export const MAX_ANNOUNCEMENT_LENGTH = 500;

/** Minimum announcement duration in seconds */
export const MIN_ANNOUNCEMENT_DURATION_SECONDS = 5;

/** Maximum announcement duration in seconds (5 minutes) */
export const MAX_ANNOUNCEMENT_DURATION_SECONDS = 300;

// =============================================================================
// Auth Token Configuration
// =============================================================================

/** Interval for periodic token revalidation (1 hour) */
export const TOKEN_REVALIDATION_INTERVAL_MS = 60 * 60 * 1000;

/** Minimum time since last validation before revalidating on focus (5 minutes) */
export const TOKEN_FOCUS_REVALIDATION_MIN_MS = 5 * 60 * 1000;
