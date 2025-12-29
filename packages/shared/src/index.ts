/**
 * Pika! Shared Library
 * Common types, schemas, and utilities shared between desktop, cloud, and web packages.
 */

export const PIKA_VERSION = "0.0.1";

// ============================================================================
// Track Types
// ============================================================================

/**
 * Basic track information for WebSocket messages
 */
export interface TrackInfo {
    artist: string;
    title: string;
}

/**
 * Extended track information with analysis data
 */
export interface FullTrackInfo extends TrackInfo {
    filePath: string;
    bpm?: number | null;
    key?: string | null;
    energy?: number | null;
}

// ============================================================================
// WebSocket Message Types (Discriminated Union)
// ============================================================================

/**
 * Session registration message - DJ going live
 */
export interface RegisterSessionMessage {
    type: "REGISTER_SESSION";
    sessionId: string;
    djName: string;
}

/**
 * Session registered confirmation from server
 */
export interface SessionRegisteredMessage {
    type: "SESSION_REGISTERED";
    sessionId: string;
}

/**
 * Session started broadcast to listeners
 */
export interface SessionStartedMessage {
    type: "SESSION_STARTED";
    sessionId: string;
    djName: string;
}

/**
 * Broadcast track - DJ playing a new track
 */
export interface BroadcastTrackMessage {
    type: "BROADCAST_TRACK";
    sessionId: string;
    track: TrackInfo;
}

/**
 * Now playing broadcast to listeners
 */
export interface NowPlayingMessage {
    type: "NOW_PLAYING";
    sessionId: string;
    djName: string;
    track: TrackInfo;
}

/**
 * Track stopped message
 */
export interface TrackStoppedMessage {
    type: "TRACK_STOPPED";
    sessionId: string;
}

/**
 * End session message - DJ ending set
 */
export interface EndSessionMessage {
    type: "END_SESSION";
    sessionId: string;
}

/**
 * Session ended broadcast to listeners
 */
export interface SessionEndedMessage {
    type: "SESSION_ENDED";
    sessionId: string;
}

/**
 * Subscribe message - listener joining
 */
export interface SubscribeMessage {
    type: "SUBSCRIBE";
}

/**
 * Sessions list - sent to new subscribers
 */
export interface SessionsListMessage {
    type: "SESSIONS_LIST";
    sessions: Array<{
        sessionId: string;
        djName: string;
        currentTrack?: TrackInfo;
    }>;
}

/**
 * Send like - listener liking a track
 */
export interface SendLikeMessage {
    type: "SEND_LIKE";
    payload: {
        track: TrackInfo;
    };
}

/**
 * Like received broadcast
 */
export interface LikeReceivedMessage {
    type: "LIKE_RECEIVED";
    payload: {
        track: TrackInfo;
    };
}

/**
 * All possible outgoing messages (client -> server)
 */
export type ClientMessage =
    | RegisterSessionMessage
    | BroadcastTrackMessage
    | TrackStoppedMessage
    | EndSessionMessage
    | SubscribeMessage
    | SendLikeMessage;

/**
 * All possible incoming messages (server -> client)
 */
export type ServerMessage =
    | SessionRegisteredMessage
    | SessionStartedMessage
    | NowPlayingMessage
    | TrackStoppedMessage
    | SessionEndedMessage
    | SessionsListMessage
    | LikeReceivedMessage;

/**
 * All WebSocket messages
 */
export type WebSocketMessage = ClientMessage | ServerMessage;

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Check if a message is a specific type
 */
export function isMessageType<T extends WebSocketMessage>(
    message: WebSocketMessage,
    type: T["type"]
): message is T {
    return message.type === type;
}

/**
 * Safely parse a WebSocket message
 */
export function parseWebSocketMessage(data: string): WebSocketMessage | null {
    try {
        const parsed = JSON.parse(data);
        if (typeof parsed === "object" && parsed !== null && "type" in parsed) {
            return parsed as WebSocketMessage;
        }
        return null;
    } catch {
        return null;
    }
}
