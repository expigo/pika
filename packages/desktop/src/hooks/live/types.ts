/**
 * Shared types for live session modules
 *
 * @package @pika/desktop
 */

import type { TrackInfo } from "@pika/shared";

// ============================================================================
// Connection & Session Types
// ============================================================================

export type LiveStatus = "offline" | "connecting" | "live" | "error";

export interface SessionState {
  sessionId: string | null;
  dbSessionId: number | null;
  status: LiveStatus;
  error: string | null;
}

// ============================================================================
// ACK/NACK Protocol Types
// ============================================================================

export interface PendingMessage {
  messageId: string;
  payload: object;
  resolve: (ack: boolean) => void;
  retryCount: number;
  timeout: ReturnType<typeof setTimeout>;
}

export interface ReliabilityConfig {
  ackTimeoutMs: number;
  maxRetries: number;
  retryDelays: number[];
}

export const DEFAULT_RELIABILITY_CONFIG: ReliabilityConfig = {
  ackTimeoutMs: 5000,
  maxRetries: 3,
  retryDelays: [1000, 2000, 4000],
};

// ============================================================================
// Offline Queue Types
// ============================================================================

export interface QueuedMessage {
  id: number;
  payload: object;
  timestamp: number;
}

export interface QueueFlushConfig {
  baseDelayMs: number;
  maxDelayMs: number;
  maxConsecutiveFailures: number;
}

export const DEFAULT_QUEUE_FLUSH_CONFIG: QueueFlushConfig = {
  baseDelayMs: 100,
  maxDelayMs: 2000,
  maxConsecutiveFailures: 3,
};

// ============================================================================
// Like Batching Types
// ============================================================================

export interface LikeBatchConfig {
  threshold: number;
  timeoutMs: number;
}

export const DEFAULT_LIKE_BATCH_CONFIG: LikeBatchConfig = {
  threshold: 5,
  timeoutMs: 3000,
};

// ============================================================================
// Reaction Types
// ============================================================================

export type Reaction = "thank_you";
export type ReactionCallback = (reaction: Reaction) => void;

// ============================================================================
// Poll Types
// ============================================================================

export interface PollState {
  id: number;
  question: string;
  options: string[];
  votes: number[];
  totalVotes: number;
  endsAt?: string;
}

export interface EndedPoll extends PollState {
  winner: string;
  winnerPercent: number;
}

// ============================================================================
// Announcement Types
// ============================================================================

export interface ActiveAnnouncement {
  message: string;
  endsAt?: string;
}

// ============================================================================
// Track Types
// ============================================================================

export type { TrackInfo };

export interface TrackBroadcastResult {
  broadcasted: boolean;
  trackKey: string;
}
