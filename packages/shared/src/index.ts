/**
 * Pika! Shared Library
 * Common types, schemas, and utilities shared between desktop, cloud, and web packages.
 */

export const PIKA_VERSION = "0.5.0";

// Exportify CSV parser (B3 catalog seed) — shared by the web importer + cloud seed tooling
export { parseChosicCsv } from "./chosicCsv";
export { LIMITS, TIMEOUTS, URLS } from "./config";
export {
  type ExportifyParseResult,
  type ExportifySeedTrack,
  parseCsvRows,
  parseExportifyCsv,
} from "./exportifyCsv";
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
  // Stage / Event schemas
  type CreateEventInput,
  CreateEventSchema,
  type CreateStageInput,
  CreateStageSchema,
  EndPollSchema,
  EndSessionSchema,
  type EventInfo,
  EventSchema,
  GetSessionsSchema,
  HistorySyncedSchema,
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
  // Spotify audio features (canonical, per-URI) — B3 CSV seed
  type SpotifyAudioFeatures,
  SpotifyAudioFeaturesSchema,
  type Stage,
  StageSchema,
  // Poll schemas
  StartPollSchema,
  SubscribeSchema,
  SubscribeStageSchema,
  SyncSessionHistorySchema,
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
