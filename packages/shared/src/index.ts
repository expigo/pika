/**
 * Pika! Shared Library
 * Common types, schemas, and utilities shared between desktop, cloud, and web packages.
 */

export const PIKA_VERSION = "0.2.0";

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
  // Validation helpers
  parseWebSocketMessage,
  // WebSocket message schemas
  RegisterSessionSchema,
  SendLikeSchema,
  type ServerMessage,
  ServerMessageSchema,
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
