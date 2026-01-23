/**
 * Pika! Shared Schemas
 * Zod schemas for runtime validation - Single Source of Truth
 */

import { z } from "zod";

// ============================================================================
// Message Type Constants
// ============================================================================

export const MESSAGE_TYPES = {
  // Client -> Server
  REGISTER_SESSION: "REGISTER_SESSION",
  BROADCAST_TRACK: "BROADCAST_TRACK",
  TRACK_STOPPED: "TRACK_STOPPED",
  END_SESSION: "END_SESSION",
  SUBSCRIBE: "SUBSCRIBE",
  SEND_LIKE: "SEND_LIKE",
  SEND_TEMPO_REQUEST: "SEND_TEMPO_REQUEST",
  START_POLL: "START_POLL",
  END_POLL: "END_POLL",
  CANCEL_POLL: "CANCEL_POLL",
  VOTE_ON_POLL: "VOTE_ON_POLL",
  SEND_REACTION: "SEND_REACTION",
  SEND_ANNOUNCEMENT: "SEND_ANNOUNCEMENT",
  CANCEL_ANNOUNCEMENT: "CANCEL_ANNOUNCEMENT",

  // Server -> Client
  SESSION_REGISTERED: "SESSION_REGISTERED",
  SESSION_STARTED: "SESSION_STARTED",
  NOW_PLAYING: "NOW_PLAYING",
  SESSION_ENDED: "SESSION_ENDED",
  SESSIONS_LIST: "SESSIONS_LIST",
  LIKE_RECEIVED: "LIKE_RECEIVED",
  LISTENER_COUNT: "LISTENER_COUNT",
  TEMPO_FEEDBACK: "TEMPO_FEEDBACK",
  TEMPO_RESET: "TEMPO_RESET",
  POLL_STARTED: "POLL_STARTED",
  POLL_UPDATE: "POLL_UPDATE",
  POLL_ENDED: "POLL_ENDED",
  POLL_ID_UPDATED: "POLL_ID_UPDATED",
  VOTE_REJECTED: "VOTE_REJECTED",
  VOTE_CONFIRMED: "VOTE_CONFIRMED",
  REACTION_RECEIVED: "REACTION_RECEIVED",
  ANNOUNCEMENT_RECEIVED: "ANNOUNCEMENT_RECEIVED",
  ANNOUNCEMENT_CANCELLED: "ANNOUNCEMENT_CANCELLED",

  // System
  GET_SESSIONS: "GET_SESSIONS",
  PING: "PING",
  PONG: "PONG",
  ACK: "ACK",
  NACK: "NACK",
} as const;

/**
 * Basic track info for WebSocket messages
 * Includes optional fingerprint data for analytics
 */
export const TrackInfoSchema = z.object({
  title: z.string().min(1).max(500).trim(),
  artist: z.string().min(1).max(500).trim(),
  // Core metrics
  bpm: z.number().min(0).max(300).optional(),
  key: z.string().max(10).optional(),
  // Fingerprint metrics (all 0-100 scale)
  energy: z.number().min(0).max(100).optional(),
  danceability: z.number().min(0).max(100).optional(),
  brightness: z.number().min(0).max(100).optional(),
  acousticness: z.number().min(0).max(100).optional(),
  groove: z.number().min(0).max(100).optional(),
});

export type TrackInfo = z.infer<typeof TrackInfoSchema>;

/**
 * Full track metadata (for library/database)
 */
export const TrackMetadataSchema = z.object({
  title: z.string().min(1).max(500).trim(),
  artist: z.string().min(1).max(500).trim(),
  filePath: z.string().min(1).optional(),
  bpm: z.number().min(40).max(300).optional(),
  energy: z.number().min(0).max(100).optional(),
  key: z.string().max(10).optional(),
});

export type TrackMetadata = z.infer<typeof TrackMetadataSchema>;

// ============================================================================
// Analysis Result Schema (Python Sidecar Output)
// ============================================================================

/**
 * Analysis result from Python sidecar
 * All metrics use 0-100 scale (DJ-friendly)
 *
 * Core metrics:
 * - bpm: Beats per minute (40-200)
 * - energy: Overall loudness/intensity (0-100)
 * - key: Musical key (e.g., "Am", "C", "F#")
 *
 * Fingerprint metrics:
 * - danceability: Rhythmic stability, how "danceable" the track is (0-100)
 * - brightness: Spectral brightness, treble presence (0-100)
 * - acousticness: How acoustic vs electronic the sound is (0-100)
 * - groove: Onset strength, percussive punch (0-100)
 */
export const AnalysisResultSchema = z.object({
  // Core metrics
  bpm: z.number().min(0).max(300).optional().nullable(),
  energy: z.number().min(0).max(100).optional().nullable(),
  key: z.string().optional().nullable(),

  // Fingerprint metrics (all 0-100 scale)
  danceability: z.number().min(0).max(100).optional().nullable(),
  brightness: z.number().min(0).max(100).optional().nullable(),
  acousticness: z.number().min(0).max(100).optional().nullable(),
  groove: z.number().min(0).max(100).optional().nullable(),

  // Error handling
  error: z.string().optional().nullable(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

// ============================================================================
// WebSocket Message Schemas (Discriminated Union)
// ============================================================================

// --- Client -> Server Messages ---

export const RegisterSessionSchema = z.object({
  type: z.literal(MESSAGE_TYPES.REGISTER_SESSION),
  version: z.literal("0.3.0").optional(),
  sessionId: z.string().min(8).max(64).trim().optional(),
  djName: z.string().min(1).max(100).trim().optional(),
  token: z.union([z.literal(""), z.string().min(10).max(2000)]).optional(), // pk_dj_<uuid> (~42 chars) or JWT
  messageId: z.string().optional(),
  clientId: z.string().optional(),
});

export const BroadcastTrackSchema = z.object({
  type: z.literal(MESSAGE_TYPES.BROADCAST_TRACK),
  version: z.literal("0.3.0").optional(),
  sessionId: z.string().min(8).max(64).trim(),
  track: TrackInfoSchema,
  messageId: z.string().optional(),
  clientId: z.string().optional(),
});

export const TrackStoppedSchema = z.object({
  type: z.literal(MESSAGE_TYPES.TRACK_STOPPED),
  version: z.literal("0.3.0").optional(),
  sessionId: z.string().min(8).max(64).trim(),
  messageId: z.string().optional(),
  clientId: z.string().optional(),
});

export const EndSessionSchema = z.object({
  type: z.literal(MESSAGE_TYPES.END_SESSION),
  version: z.literal("0.3.0").optional(),
  sessionId: z.string().min(8).max(64).trim(),
  messageId: z.string().optional(),
  clientId: z.string().optional(),
});

export const SubscribeSchema = z.object({
  type: z.literal(MESSAGE_TYPES.SUBSCRIBE),
  version: z.literal("0.3.0").optional(),
  sessionId: z.string().min(8).max(64).trim().optional(), // Session to subscribe to (for listener tracking)
  clientId: z.string().min(8).max(256).trim().optional(), // Client identifier (for unique listener count)
  messageId: z.string().optional(),
});

export const SendLikeSchema = z.object({
  type: z.literal(MESSAGE_TYPES.SEND_LIKE),
  sessionId: z.string().optional(), // Explicit session targeting
  clientId: z.string().optional(), // For server-side tracking
  messageId: z.string().optional(),
  payload: z.object({
    track: TrackInfoSchema,
  }),
});

export const GetSessionsSchema = z.object({
  type: z.literal(MESSAGE_TYPES.GET_SESSIONS),
  clientId: z.string().optional(),
  messageId: z.string().optional(),
});

export const PingSchema = z.object({
  type: z.literal(MESSAGE_TYPES.PING),
  messageId: z.string().optional(),
});

// --- Server -> Client Messages ---

export const PongSchema = z.object({
  type: z.literal(MESSAGE_TYPES.PONG),
  timestamp: z.string().optional(),
});

export const SessionRegisteredSchema = z.object({
  type: z.literal(MESSAGE_TYPES.SESSION_REGISTERED),
  version: z.literal("0.3.0").optional(),
  sessionId: z.string().min(8).max(64).trim(),
  djName: z.string().min(1).max(100).trim().optional(), // Confirmed display name (may differ from requested)
  authenticated: z.boolean().optional(), // True if token was valid
});

export const SessionStartedSchema = z.object({
  type: z.literal(MESSAGE_TYPES.SESSION_STARTED),
  version: z.literal("0.3.0").optional(),
  sessionId: z.string().min(8).max(64).trim(),
  djName: z.string().min(1).max(100).trim(),
});

export const NowPlayingSchema = z.object({
  type: z.literal(MESSAGE_TYPES.NOW_PLAYING),
  version: z.literal("0.3.0").optional(),
  sessionId: z.string().min(8).max(64).trim(),
  djName: z.string().min(1).max(100).trim(),
  track: TrackInfoSchema,
});

export const SessionEndedSchema = z.object({
  type: z.literal(MESSAGE_TYPES.SESSION_ENDED),
  version: z.literal("0.3.0").optional(),
  sessionId: z.string().min(8).max(64).trim(),
});

export const SessionsListSchema = z.object({
  type: z.literal(MESSAGE_TYPES.SESSIONS_LIST),
  sessions: z.array(
    z.object({
      sessionId: z.string(),
      djName: z.string(),
      startedAt: z.string().optional(), // ISO timestamp
      currentTrack: TrackInfoSchema.optional(),
      activeAnnouncement: z
        .object({
          message: z.string(),
          timestamp: z.string(),
          endsAt: z.string().optional(),
        })
        .optional(),
    }),
  ),
});

export const LikeReceivedSchema = z.object({
  type: z.literal(MESSAGE_TYPES.LIKE_RECEIVED),
  payload: z.object({
    track: TrackInfoSchema,
  }),
});

export const ListenerCountSchema = z.object({
  type: z.literal(MESSAGE_TYPES.LISTENER_COUNT),
  sessionId: z.string().optional(), // Per-session listener count
  count: z.number(),
});

// Tempo preference type (includes "clear" for toggle-off)
export const TempoPreferenceSchema = z.enum(["faster", "slower", "perfect", "clear"]);
export type TempoPreference = z.infer<typeof TempoPreferenceSchema>;

// Client -> Server: Dancer sends tempo preference
export const SendTempoRequestSchema = z.object({
  type: z.literal(MESSAGE_TYPES.SEND_TEMPO_REQUEST),
  sessionId: z.string(),
  preference: TempoPreferenceSchema,
  messageId: z.string().optional(),
  clientId: z.string().optional(),
});

// Server -> DJ: Aggregated tempo feedback
export const TempoFeedbackSchema = z.object({
  type: z.literal(MESSAGE_TYPES.TEMPO_FEEDBACK),
  sessionId: z.string(), // Required for multi-session routing
  faster: z.number(), // count of "faster" votes
  slower: z.number(), // count of "slower" votes
  perfect: z.number(), // count of "perfect" votes
  total: z.number(), // total votes
});

// Server -> Clients: Reset tempo votes (track changed)
export const TempoResetSchema = z.object({
  type: z.literal(MESSAGE_TYPES.TEMPO_RESET),
  sessionId: z.string(),
});

// ============================================================================
// Poll Schemas (Live DJ Polls)
// ============================================================================

// DJ -> Server: Start a new poll
export const StartPollSchema = z.object({
  type: z.literal(MESSAGE_TYPES.START_POLL),
  sessionId: z.string(),
  question: z.string(),
  options: z.array(z.string().min(1).max(100)).min(2).max(10), // 2-10 options, max 100 chars per option
  durationSeconds: z.number().min(30).max(300).optional(), // 30s to 5min, optional
  messageId: z.string().optional(),
  clientId: z.string().optional(),
});

// DJ -> Server: End poll early
export const EndPollSchema = z.object({
  type: z.literal(MESSAGE_TYPES.END_POLL),
  pollId: z.number(),
  messageId: z.string().optional(),
  clientId: z.string().optional(),
});

// DJ -> Server: Cancel poll (by poll ID)
export const CancelPollSchema = z.object({
  type: z.literal(MESSAGE_TYPES.CANCEL_POLL),
  pollId: z.number(),
  sessionId: z.string().optional(), // Legacy/optional for backwards compat
  messageId: z.string().optional(),
  clientId: z.string().optional(),
});

// Dancer -> Server: Vote on a poll
export const VoteOnPollSchema = z.object({
  type: z.literal(MESSAGE_TYPES.VOTE_ON_POLL),
  pollId: z.number(),
  optionIndex: z.number(),
  clientId: z.string(),
  messageId: z.string().optional(),
});

// Server -> Dancers: New poll started
export const PollStartedSchema = z.object({
  type: z.literal(MESSAGE_TYPES.POLL_STARTED),
  pollId: z.number(),
  sessionId: z.string().optional(), // Included in broadcast for routing
  question: z.string(),
  options: z.array(z.string()),
  endsAt: z.string().optional(), // ISO timestamp when poll auto-closes
  votes: z.array(z.number()).optional(), // Current vote distribution (late-joiner)
  totalVotes: z.number().optional(),
  hasVoted: z.boolean().optional(), // True if this client already voted
  votedOptionIndex: z.number().optional(), // Which option client voted for
});

// Server -> DJ: Live poll results update
export const PollUpdateSchema = z.object({
  type: z.literal(MESSAGE_TYPES.POLL_UPDATE),
  pollId: z.number(),
  sessionId: z.string().optional(), // Enables session-scoped updates
  votes: z.array(z.number()), // Vote count per option [12, 8, 5]
  totalVotes: z.number(),
});

// Server -> All: Poll has ended
export const PollEndedSchema = z.object({
  type: z.literal(MESSAGE_TYPES.POLL_ENDED),
  pollId: z.number(),
  results: z.array(z.number()), // Final vote count per option
  totalVotes: z.number(),
  winnerIndex: z.number(), // Index of option with most votes
});

// Server -> All: Poll ID updated (temp ID -> DB ID)
export const PollIdUpdatedSchema = z.object({
  type: z.literal(MESSAGE_TYPES.POLL_ID_UPDATED),
  oldPollId: z.number(),
  newPollId: z.number(),
});

// Server -> Client: Vote rejected
export const VoteRejectedSchema = z.object({
  type: z.literal(MESSAGE_TYPES.VOTE_REJECTED),
  pollId: z.number(),
  reason: z.string(),
  votes: z.array(z.number()).optional(),
  totalVotes: z.number().optional(),
});

// Server -> Client: Vote confirmed
export const VoteConfirmedSchema = z.object({
  type: z.literal(MESSAGE_TYPES.VOTE_CONFIRMED),
  pollId: z.number(),
  optionIndex: z.number(),
  votes: z.array(z.number()),
  totalVotes: z.number(),
});

// ============================================================================
// Reaction Schemas
// ============================================================================

export const SendReactionSchema = z.object({
  type: z.literal(MESSAGE_TYPES.SEND_REACTION),
  sessionId: z.string(),
  reaction: z.literal("thank_you"),
  messageId: z.string().optional(),
  clientId: z.string().optional(),
});

export const ReactionReceivedSchema = z.object({
  type: z.literal(MESSAGE_TYPES.REACTION_RECEIVED),
  sessionId: z.string(),
  reaction: z.literal("thank_you"),
});

// ============================================================================
// Announcement Schemas (DJ -> Dancers)
// ============================================================================

// DJ -> Server: Send announcement to dancers
export const SendAnnouncementSchema = z.object({
  type: z.literal(MESSAGE_TYPES.SEND_ANNOUNCEMENT),
  sessionId: z.string(),
  message: z.string().max(200),
  durationSeconds: z.number().min(60).max(3600).optional(), // 1 min to 1 hour
  messageId: z.string().optional(),
  clientId: z.string().optional(),
});

// Server -> Dancers: Announcement received
export const AnnouncementReceivedSchema = z.object({
  type: z.literal(MESSAGE_TYPES.ANNOUNCEMENT_RECEIVED),
  sessionId: z.string(),
  message: z.string(),
  djName: z.string().optional(),
  timestamp: z.string(), // ISO timestamp
  endsAt: z.string().optional(), // ISO timestamp for countdown timer
});

// DJ -> Server: Cancel active announcement
export const CancelAnnouncementSchema = z.object({
  type: z.literal(MESSAGE_TYPES.CANCEL_ANNOUNCEMENT),
  sessionId: z.string(),
  messageId: z.string().optional(),
  clientId: z.string().optional(),
});

// Server -> Dancers: Announcement cancelled
export const AnnouncementCancelledSchema = z.object({
  type: z.literal(MESSAGE_TYPES.ANNOUNCEMENT_CANCELLED),
  sessionId: z.string(),
});

// ============================================================================
// Application-Level ACK Schemas (Reliable Delivery)
// ============================================================================

/**
 * Server -> Client: Acknowledge successful message processing
 */
export const AckSchema = z.object({
  type: z.literal(MESSAGE_TYPES.ACK),
  messageId: z.string(),
  status: z.literal("ok"),
  timestamp: z.string().optional(), // ISO timestamp
});

export type Ack = z.infer<typeof AckSchema>;

/**
 * Server -> Client: Negative acknowledgment (error occurred)
 */
export const NackSchema = z.object({
  type: z.literal(MESSAGE_TYPES.NACK),
  messageId: z.string(),
  error: z.string(),
  timestamp: z.string().optional(), // ISO timestamp
});

export type Nack = z.infer<typeof NackSchema>;

// ============================================================================
// Combined Message Schemas
// ============================================================================

/**
 * All client -> server messages
 */
export const ClientMessageSchema = z.discriminatedUnion("type", [
  RegisterSessionSchema,
  BroadcastTrackSchema,
  TrackStoppedSchema,
  EndSessionSchema,
  SubscribeSchema,
  SendLikeSchema,
  SendTempoRequestSchema,
  // Client Polls
  StartPollSchema,
  EndPollSchema,
  CancelPollSchema,
  VoteOnPollSchema,
  // Client Reactions
  SendReactionSchema,
  // Client Announcements
  SendAnnouncementSchema,
  CancelAnnouncementSchema,
  // Client System
  GetSessionsSchema,
  PingSchema,
]);

export type ClientMessage = z.infer<typeof ClientMessageSchema>;

/**
 * All server -> client messages
 */
export const ServerMessageSchema = z.discriminatedUnion("type", [
  SessionRegisteredSchema,
  SessionStartedSchema,
  NowPlayingSchema,
  SessionEndedSchema,
  SessionsListSchema,
  LikeReceivedSchema,
  ListenerCountSchema,
  TempoFeedbackSchema,
  TempoResetSchema,
  TrackStoppedSchema,
  // Server Polls
  PollStartedSchema,
  PollUpdateSchema,
  PollEndedSchema,
  PollIdUpdatedSchema,
  VoteRejectedSchema,
  VoteConfirmedSchema,
  // Server Reactions
  ReactionReceivedSchema,
  // Server Announcements
  AnnouncementReceivedSchema,
  AnnouncementCancelledSchema,
  // Server System
  AckSchema,
  NackSchema,
  PongSchema,
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/**
 * All WebSocket messages
 */
export const WebSocketMessageSchema = z.union([ClientMessageSchema, ServerMessageSchema]);

export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>;

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Safely parse a WebSocket message from raw JSON string
 */
export function parseWebSocketMessage(data: string): WebSocketMessage | null {
  try {
    const parsed = JSON.parse(data);
    const result = WebSocketMessageSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * Safely parse an analysis result from raw JSON
 */
export function parseAnalysisResult(data: unknown): AnalysisResult | null {
  const result = AnalysisResultSchema.safeParse(data);
  return result.success ? result.data : null;
}
