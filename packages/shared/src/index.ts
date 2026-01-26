/**
 * Pika! Shared Library
 * Common types, schemas, and utilities shared between desktop, cloud, and web packages.
 */

export const PIKA_VERSION = "0.2.7";

// Re-export all schemas and types from schemas.ts
export {
  type AnalysisResult,
  // Analysis schemas
  AnalysisResultSchema,
  BroadcastTrackSchema,
  type ClientMessage,
  // Combined schemas
  ClientMessageSchema,
  EndSessionSchema,
  LikeReceivedSchema,
  NowPlayingSchema,
  parseAnalysisResult,
  MESSAGE_TYPES,
  parseWebSocketMessage,
  // WebSocket message schemas
  RegisterSessionSchema,
  SendLikeSchema,
  SendBulkLikeSchema,
  SendRemoveLikeSchema,
  type ServerMessage,
  ServerMessageSchema,
  BroadcastMetadataSchema,
  MetadataUpdatedSchema,
  SessionEndedSchema,
  SessionRegisteredSchema,
  SessionStartedSchema,
  SessionsListSchema,
  SubscribeSchema,
  type TrackInfo,
  // Track schemas
  TrackInfoSchema,
  type TrackMetadata,
  TrackMetadataSchema,
  TrackStoppedSchema,
  type WebSocketMessage,
  WebSocketMessageSchema,
  // Poll schemas
  StartPollSchema,
  EndPollSchema,
  CancelPollSchema,
  VoteOnPollSchema,
  PollStartedSchema,
  PollUpdateSchema,
  PollEndedSchema,
  // Tempo schemas
  SendTempoRequestSchema,
  TempoFeedbackSchema,
  TempoResetSchema,
  type TempoPreference,
  // Reaction schemas
  SendReactionSchema,
  ReactionReceivedSchema,
  // Announcement schemas
  SendAnnouncementSchema,
  CancelAnnouncementSchema,
  AnnouncementReceivedSchema,
  AnnouncementCancelledSchema,
  // Listener count
  ListenerCountSchema,
  // ACK/NACK
  AckSchema,
  NackSchema,
  GetSessionsSchema,
  PingSchema,
  PongSchema,
  ValidateSessionSchema,
  SessionExpiredSchema,
  SessionValidSchema,
  SettingsSchema,
  type Settings,
} from "./schemas";

// Re-export slug utilities
export {
  isReservedSlug,
  RESERVED_SLUGS,
  slugify,
  validateDjSlug,
} from "./slugify";

export {
  getFuzzyKey,
  getTrackKey,
  normalizeExact,
  normalizeFuzzy,
  normalizeTrack,
  getCamelotKey,
  getHarmonicCompatibility,
  calculateVibeFriction,
  type HarmonicLevel,
  type HarmonicRelation,
} from "./utils";

export {
  getBaseApiUrl,
  getBaseWsUrl,
  DEFAULT_WEB_PORT,
  DEFAULT_CLOUD_PORT,
  type PikaEnvironment,
  type UrlOptions,
} from "./protocol";

export { TIMEOUTS, LIMITS, URLS } from "./config";
export { logger, type LogLevel, type LogContext } from "./logger";
