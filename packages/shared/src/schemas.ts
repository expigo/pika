/**
 * Pika! Shared Schemas
 * Zod schemas for runtime validation - Single Source of Truth
 */

import { z } from "zod";

// ============================================================================
// Track Schemas
// ============================================================================

/**
 * Basic track info for WebSocket messages
 * Includes optional fingerprint data for analytics
 */
export const TrackInfoSchema = z.object({
  title: z.string(),
  artist: z.string(),
  // Core metrics
  bpm: z.number().optional(),
  key: z.string().optional(),
  // Fingerprint metrics (all 0-100 scale)
  energy: z.number().optional(),
  danceability: z.number().optional(),
  brightness: z.number().optional(),
  acousticness: z.number().optional(),
  groove: z.number().optional(),
});

export type TrackInfo = z.infer<typeof TrackInfoSchema>;

/**
 * Full track metadata (for library/database)
 */
export const TrackMetadataSchema = z.object({
  title: z.string(),
  artist: z.string(),
  filePath: z.string().optional(),
  bpm: z.number().min(0).max(300).optional(),
  energy: z.number().min(0).max(100).optional(),
  key: z.string().optional(),
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
  type: z.literal("REGISTER_SESSION"),
  sessionId: z.string().optional(),
  djName: z.string().optional(),
});

export const BroadcastTrackSchema = z.object({
  type: z.literal("BROADCAST_TRACK"),
  sessionId: z.string(),
  track: TrackInfoSchema,
});

export const TrackStoppedSchema = z.object({
  type: z.literal("TRACK_STOPPED"),
  sessionId: z.string(),
});

export const EndSessionSchema = z.object({
  type: z.literal("END_SESSION"),
  sessionId: z.string(),
});

export const SubscribeSchema = z.object({
  type: z.literal("SUBSCRIBE"),
  sessionId: z.string().optional(), // Session to subscribe to (for listener tracking)
  clientId: z.string().optional(), // Client identifier (for unique listener count)
});

export const SendLikeSchema = z.object({
  type: z.literal("SEND_LIKE"),
  sessionId: z.string().optional(), // Explicit session targeting
  clientId: z.string().optional(), // For server-side tracking
  payload: z.object({
    track: TrackInfoSchema,
  }),
});

// --- Server -> Client Messages ---

export const SessionRegisteredSchema = z.object({
  type: z.literal("SESSION_REGISTERED"),
  sessionId: z.string(),
});

export const SessionStartedSchema = z.object({
  type: z.literal("SESSION_STARTED"),
  sessionId: z.string(),
  djName: z.string(),
});

export const NowPlayingSchema = z.object({
  type: z.literal("NOW_PLAYING"),
  sessionId: z.string(),
  djName: z.string(),
  track: TrackInfoSchema,
});

export const SessionEndedSchema = z.object({
  type: z.literal("SESSION_ENDED"),
  sessionId: z.string(),
});

export const SessionsListSchema = z.object({
  type: z.literal("SESSIONS_LIST"),
  sessions: z.array(
    z.object({
      sessionId: z.string(),
      djName: z.string(),
      currentTrack: TrackInfoSchema.optional(),
    }),
  ),
});

export const LikeReceivedSchema = z.object({
  type: z.literal("LIKE_RECEIVED"),
  payload: z.object({
    track: TrackInfoSchema,
  }),
});

export const ListenerCountSchema = z.object({
  type: z.literal("LISTENER_COUNT"),
  sessionId: z.string().optional(), // Per-session listener count
  count: z.number(),
});

// Tempo preference type (includes "clear" for toggle-off)
export const TempoPreferenceSchema = z.enum(["faster", "slower", "perfect", "clear"]);
export type TempoPreference = z.infer<typeof TempoPreferenceSchema>;

// Client -> Server: Dancer sends tempo preference
export const SendTempoRequestSchema = z.object({
  type: z.literal("SEND_TEMPO_REQUEST"),
  sessionId: z.string(),
  preference: TempoPreferenceSchema,
});

// Server -> DJ: Aggregated tempo feedback
export const TempoFeedbackSchema = z.object({
  type: z.literal("TEMPO_FEEDBACK"),
  faster: z.number(), // count of "faster" votes
  slower: z.number(), // count of "slower" votes
  perfect: z.number(), // count of "perfect" votes
  total: z.number(), // total votes
});

// Server -> Clients: Reset tempo votes (track changed)
export const TempoResetSchema = z.object({
  type: z.literal("TEMPO_RESET"),
  sessionId: z.string(),
});

// ============================================================================
// Poll Schemas (Live DJ Polls)
// ============================================================================

// DJ -> Server: Start a new poll
export const StartPollSchema = z.object({
  type: z.literal("START_POLL"),
  sessionId: z.string(),
  question: z.string(),
  options: z.array(z.string()).min(2).max(5), // 2-5 options
  durationSeconds: z.number().min(30).max(300).optional(), // 30s to 5min, optional
});

// DJ -> Server: End poll early
export const EndPollSchema = z.object({
  type: z.literal("END_POLL"),
  pollId: z.number(),
});

// DJ -> Server: Cancel poll (by session, used when poll ID not yet assigned)
export const CancelPollSchema = z.object({
  type: z.literal("CANCEL_POLL"),
  sessionId: z.string(),
});

// Dancer -> Server: Vote on a poll
export const VoteOnPollSchema = z.object({
  type: z.literal("VOTE_ON_POLL"),
  pollId: z.number(),
  optionIndex: z.number(),
  clientId: z.string(),
});

// Server -> Dancers: New poll started
export const PollStartedSchema = z.object({
  type: z.literal("POLL_STARTED"),
  pollId: z.number(),
  question: z.string(),
  options: z.array(z.string()),
  endsAt: z.string().optional(), // ISO timestamp when poll auto-closes
});

// Server -> DJ: Live poll results update
export const PollUpdateSchema = z.object({
  type: z.literal("POLL_UPDATE"),
  pollId: z.number(),
  votes: z.array(z.number()), // Vote count per option [12, 8, 5]
  totalVotes: z.number(),
});

// Server -> All: Poll has ended
export const PollEndedSchema = z.object({
  type: z.literal("POLL_ENDED"),
  pollId: z.number(),
  results: z.array(z.number()), // Final vote count per option
  totalVotes: z.number(),
  winnerIndex: z.number(), // Index of option with most votes
});

// Server -> All: Poll ID updated (temp ID -> DB ID)
export const PollIdUpdatedSchema = z.object({
  type: z.literal("POLL_ID_UPDATED"),
  oldPollId: z.number(),
  newPollId: z.number(),
});

// Server -> Client: Vote rejected
export const VoteRejectedSchema = z.object({
  type: z.literal("VOTE_REJECTED"),
  pollId: z.number(),
  reason: z.string(),
  votes: z.array(z.number()).optional(),
  totalVotes: z.number().optional(),
});

// Server -> Client: Vote confirmed
export const VoteConfirmedSchema = z.object({
  type: z.literal("VOTE_CONFIRMED"),
  pollId: z.number(),
  optionIndex: z.number(),
  votes: z.array(z.number()),
  totalVotes: z.number(),
});

// ============================================================================
// Reaction Schemas
// ============================================================================

export const SendReactionSchema = z.object({
  type: z.literal("SEND_REACTION"),
  sessionId: z.string(),
  reaction: z.literal("thank_you"),
});

export const ReactionReceivedSchema = z.object({
  type: z.literal("REACTION_RECEIVED"),
  sessionId: z.string(),
  reaction: z.literal("thank_you"),
});

// ============================================================================
// Announcement Schemas (DJ -> Dancers)
// ============================================================================

// DJ -> Server: Send announcement to dancers
export const SendAnnouncementSchema = z.object({
  type: z.literal("SEND_ANNOUNCEMENT"),
  sessionId: z.string(),
  message: z.string().max(200),
  durationSeconds: z.number().min(60).max(3600).optional(), // 1 min to 1 hour
});

// Server -> Dancers: Announcement received
export const AnnouncementReceivedSchema = z.object({
  type: z.literal("ANNOUNCEMENT_RECEIVED"),
  sessionId: z.string(),
  message: z.string(),
  djName: z.string().optional(),
  timestamp: z.string(), // ISO timestamp
  endsAt: z.string().optional(), // ISO timestamp for countdown timer
});

// DJ -> Server: Cancel active announcement
export const CancelAnnouncementSchema = z.object({
  type: z.literal("CANCEL_ANNOUNCEMENT"),
  sessionId: z.string(),
});

// Server -> Dancers: Announcement cancelled
export const AnnouncementCancelledSchema = z.object({
  type: z.literal("ANNOUNCEMENT_CANCELLED"),
  sessionId: z.string(),
});

// ============================================================================
// Application-Level ACK Schemas (Reliable Delivery)
// ============================================================================

/**
 * Server -> Client: Acknowledge successful message processing
 */
export const AckSchema = z.object({
  type: z.literal("ACK"),
  messageId: z.string(),
  status: z.literal("ok"),
  timestamp: z.string().optional(), // ISO timestamp
});

export type Ack = z.infer<typeof AckSchema>;

/**
 * Server -> Client: Negative acknowledgment (error occurred)
 */
export const NackSchema = z.object({
  type: z.literal("NACK"),
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
  // Polls
  StartPollSchema,
  EndPollSchema,
  CancelPollSchema,
  VoteOnPollSchema,
  // Reactions
  SendReactionSchema,
  // Announcements
  SendAnnouncementSchema,
  CancelAnnouncementSchema,
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
  TrackStoppedSchema, // Can also come from server
  // Polls
  PollStartedSchema,
  PollUpdateSchema,
  PollEndedSchema,
  PollIdUpdatedSchema,
  VoteRejectedSchema,
  VoteConfirmedSchema,
  // Reactions
  ReactionReceivedSchema,
  // Announcements
  AnnouncementReceivedSchema,
  AnnouncementCancelledSchema,
  // ACK/NACK (Reliable Delivery)
  AckSchema,
  NackSchema,
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
