/**
 * Pika! Shared Library
 * Common types, schemas, and utilities shared between desktop, cloud, and web packages.
 */

export const PIKA_VERSION = "0.3.0";

export { LIMITS, TIMEOUTS, URLS } from "./config";
export { type LogContext, type LogLevel, logger } from "./logger";
export {
  DEFAULT_CLOUD_PORT,
  DEFAULT_WEB_PORT,
  getBaseApiUrl,
  getBaseWsUrl,
  type PikaEnvironment,
  type UrlOptions,
} from "./protocol";
// Re-export all schemas and types from schemas.ts
export {
  // ACK/NACK
  AckSchema,
  type AnalysisResult,
  // Analysis schemas
  AnalysisResultSchema,
  AnnouncementCancelledSchema,
  AnnouncementReceivedSchema,
  BroadcastMetadataSchema,
  BroadcastTrackSchema,
  CancelAnnouncementSchema,
  CancelPollSchema,
  type ClientMessage,
  // Combined schemas
  ClientMessageSchema,
  EndPollSchema,
  EndSessionSchema,
  GetSessionsSchema,
  LikeReceivedSchema,
  // Listener count
  ListenerCountSchema,
  MESSAGE_TYPES,
  MetadataUpdatedSchema,
  NackSchema,
  NowPlayingSchema,
  PingSchema,
  PollEndedSchema,
  PollStartedSchema,
  PollUpdateSchema,
  PongSchema,
  parseAnalysisResult,
  parseWebSocketMessage,
  ReactionReceivedSchema,
  // WebSocket message schemas
  RegisterSessionSchema,
  // Announcement schemas
  SendAnnouncementSchema,
  SendBulkLikeSchema,
  SendLikeSchema,
  // Reaction schemas
  SendReactionSchema,
  SendRemoveLikeSchema,
  // Tempo schemas
  SendTempoRequestSchema,
  type ServerMessage,
  ServerMessageSchema,
  SessionEndedSchema,
  SessionExpiredSchema,
  SessionRegisteredSchema,
  SessionStartedSchema,
  SessionsListSchema,
  SessionValidSchema,
  type Settings,
  SettingsSchema,
  // Poll schemas
  StartPollSchema,
  SubscribeSchema,
  TempoFeedbackSchema,
  type TempoPreference,
  TempoResetSchema,
  type TrackInfo,
  // Track schemas
  TrackInfoSchema,
  type TrackMetadata,
  TrackMetadataSchema,
  TrackStoppedSchema,
  ValidateSessionSchema,
  VoteOnPollSchema,
  type WebSocketMessage,
  WebSocketMessageSchema,
} from "./schemas";
// Re-export slug utilities
export {
  isReservedSlug,
  RESERVED_SLUGS,
  slugify,
  validateDjSlug,
} from "./slugify";
export {
  calculateVibeFriction,
  getCamelotKey,
  getFuzzyKey,
  getHarmonicCompatibility,
  getTrackKey,
  type HarmonicLevel,
  type HarmonicRelation,
  normalizeExact,
  normalizeFuzzy,
  normalizeTrack,
} from "./utils";
