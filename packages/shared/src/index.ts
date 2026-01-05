/**
 * Pika! Shared Library
 * Common types, schemas, and utilities shared between desktop, cloud, and web packages.
 */

export const PIKA_VERSION = "0.0.1";

// Re-export all schemas and types from schemas.ts
export {
    // Track schemas
    TrackInfoSchema,
    type TrackInfo,
    TrackMetadataSchema,
    type TrackMetadata,

    // Analysis schemas
    AnalysisResultSchema,
    type AnalysisResult,

    // WebSocket message schemas
    RegisterSessionSchema,
    BroadcastTrackSchema,
    TrackStoppedSchema,
    EndSessionSchema,
    SubscribeSchema,
    SendLikeSchema,
    SessionRegisteredSchema,
    SessionStartedSchema,
    NowPlayingSchema,
    SessionEndedSchema,
    SessionsListSchema,
    LikeReceivedSchema,

    // Combined schemas
    ClientMessageSchema,
    type ClientMessage,
    ServerMessageSchema,
    type ServerMessage,
    WebSocketMessageSchema,
    type WebSocketMessage,

    // Validation helpers
    parseWebSocketMessage,
    parseAnalysisResult,
} from "./schemas";

// Re-export slug utilities
export {
    slugify,
    isReservedSlug,
    validateDjSlug,
    RESERVED_SLUGS,
} from "./slugify";
