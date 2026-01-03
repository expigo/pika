/**
 * Pika! Shared Schemas
 * Zod schemas for runtime validation - Single Source of Truth
 */

import { z } from "zod";

// ============================================================================
// Track Schemas
// ============================================================================

/**
 * Basic track info for WebSocket messages (minimal)
 */
export const TrackInfoSchema = z.object({
    title: z.string(),
    artist: z.string(),
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
});

export const SendLikeSchema = z.object({
    type: z.literal("SEND_LIKE"),
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
        })
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
    count: z.number(),
});

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
    TrackStoppedSchema, // Can also come from server
]);

export type ServerMessage = z.infer<typeof ServerMessageSchema>;

/**
 * All WebSocket messages
 */
export const WebSocketMessageSchema = z.union([
    ClientMessageSchema,
    ServerMessageSchema,
]);

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
