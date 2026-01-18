/**
 * Shared types for the decomposed useLiveListener hooks
 */

import type { TrackInfo } from "@pika/shared";

// ============================================================================
// Connection Types
// ============================================================================

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

// ============================================================================
// Track Types
// ============================================================================

/** Track with history metadata */
export interface HistoryTrack extends TrackInfo {
  id?: number;
  playedAt?: string;
}

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

// ============================================================================
// Announcement Types
// ============================================================================

export interface Announcement {
  message: string;
  djName?: string;
  timestamp?: string;
  endsAt?: string;
}

// ============================================================================
// Tempo Types
// ============================================================================

export type TempoPreference = "faster" | "slower" | "perfect";

// ============================================================================
// Live State (full composite state)
// ============================================================================

export interface LiveState {
  status: ConnectionStatus;
  currentTrack: TrackInfo | null;
  djName: string | null;
  sessionId: string | null;
  history: HistoryTrack[];
  likedTracks: Set<string>;
  listenerCount: number;
  tempoVote: TempoPreference | null;
  activePoll: PollState | null;
  hasVotedOnPoll: boolean;
  announcement: Announcement | null;
}

// ============================================================================
// Message Handler Types
// ============================================================================

export type WebSocketMessage = {
  type: string;
  [key: string]: unknown;
};

export type MessageHandler<T = WebSocketMessage> = (message: T) => void;

export type MessageHandlers = Record<string, MessageHandler>;
