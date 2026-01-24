/**
 * Type Guards for WebSocket Messages
 *
 * Provides runtime type safety for parsed WebSocket messages.
 * Eliminates unsafe `as` type assertions throughout the codebase.
 *
 * @package @pika/desktop
 */

import { MESSAGE_TYPES } from "@pika/shared";

// =============================================================================
// Base Message Types
// =============================================================================

interface BaseMessage {
  type: string;
}

// =============================================================================
// ACK/NACK Messages
// =============================================================================

export interface AckMessage extends BaseMessage {
  type: typeof MESSAGE_TYPES.ACK;
  messageId: string;
}

export interface NackMessage extends BaseMessage {
  type: typeof MESSAGE_TYPES.NACK;
  messageId: string;
  error: string;
}

export function isAckMessage(msg: unknown): msg is AckMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === MESSAGE_TYPES.ACK &&
    "messageId" in msg &&
    typeof (msg as AckMessage).messageId === "string"
  );
}

export function isNackMessage(msg: unknown): msg is NackMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === MESSAGE_TYPES.NACK &&
    "messageId" in msg &&
    typeof (msg as NackMessage).messageId === "string" &&
    "error" in msg &&
    typeof (msg as NackMessage).error === "string"
  );
}

// =============================================================================
// Session Messages
// =============================================================================

export interface SessionRegisteredMessage extends BaseMessage {
  type: typeof MESSAGE_TYPES.SESSION_REGISTERED;
  sessionId: string;
}

export function isSessionRegisteredMessage(msg: unknown): msg is SessionRegisteredMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === MESSAGE_TYPES.SESSION_REGISTERED &&
    "sessionId" in msg &&
    typeof (msg as SessionRegisteredMessage).sessionId === "string"
  );
}

export interface SessionExpiredMessage extends BaseMessage {
  type: typeof MESSAGE_TYPES.SESSION_EXPIRED;
  sessionId: string;
  reason: string;
}

export function isSessionExpiredMessage(msg: unknown): msg is SessionExpiredMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === MESSAGE_TYPES.SESSION_EXPIRED &&
    "sessionId" in msg &&
    "reason" in msg
  );
}

export interface SessionValidMessage extends BaseMessage {
  type: typeof MESSAGE_TYPES.SESSION_VALID;
  sessionId: string;
  isValid: boolean;
}

export function isSessionValidMessage(msg: unknown): msg is SessionValidMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === MESSAGE_TYPES.SESSION_VALID &&
    "sessionId" in msg &&
    "isValid" in msg
  );
}

// =============================================================================
// Like Messages
// =============================================================================

export interface LikeReceivedMessage extends BaseMessage {
  type: typeof MESSAGE_TYPES.LIKE_RECEIVED;
  payload?: {
    track?: {
      title: string;
    };
  };
}

export function isLikeReceivedMessage(msg: unknown): msg is LikeReceivedMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === MESSAGE_TYPES.LIKE_RECEIVED
  );
}

// =============================================================================
// Listener Count Messages
// =============================================================================

export interface ListenerCountMessage extends BaseMessage {
  type: typeof MESSAGE_TYPES.LISTENER_COUNT;
  count: number;
  sessionId?: string;
}

export function isListenerCountMessage(msg: unknown): msg is ListenerCountMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === MESSAGE_TYPES.LISTENER_COUNT &&
    "count" in msg &&
    typeof (msg as ListenerCountMessage).count === "number"
  );
}

// =============================================================================
// Tempo Feedback Messages
// =============================================================================

export interface TempoFeedbackMessage extends BaseMessage {
  type: typeof MESSAGE_TYPES.TEMPO_FEEDBACK;
  faster: number;
  slower: number;
  perfect: number;
  total: number;
}

export function isTempoFeedbackMessage(msg: unknown): msg is TempoFeedbackMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === MESSAGE_TYPES.TEMPO_FEEDBACK &&
    "faster" in msg &&
    "slower" in msg &&
    "perfect" in msg &&
    "total" in msg
  );
}

// =============================================================================
// Poll Messages
// =============================================================================

export interface PollStartedMessage extends BaseMessage {
  type: typeof MESSAGE_TYPES.POLL_STARTED;
  pollId: number;
  question: string;
  endsAt?: string;
}

export interface PollUpdateMessage extends BaseMessage {
  type: typeof MESSAGE_TYPES.POLL_UPDATE;
  pollId: number;
  votes: number[];
  totalVotes: number;
}

export interface PollEndedMessage extends BaseMessage {
  type: typeof MESSAGE_TYPES.POLL_ENDED;
  pollId: number;
}

export function isPollStartedMessage(msg: unknown): msg is PollStartedMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === MESSAGE_TYPES.POLL_STARTED &&
    "pollId" in msg &&
    "question" in msg
  );
}

export function isPollUpdateMessage(msg: unknown): msg is PollUpdateMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === MESSAGE_TYPES.POLL_UPDATE &&
    "pollId" in msg &&
    "votes" in msg &&
    "totalVotes" in msg
  );
}

export function isPollEndedMessage(msg: unknown): msg is PollEndedMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === MESSAGE_TYPES.POLL_ENDED
  );
}

// =============================================================================
// Reaction Messages
// =============================================================================

export interface ReactionReceivedMessage extends BaseMessage {
  type: typeof MESSAGE_TYPES.REACTION_RECEIVED;
  reaction: "thank_you";
}

export function isReactionReceivedMessage(msg: unknown): msg is ReactionReceivedMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    msg.type === MESSAGE_TYPES.REACTION_RECEIVED &&
    "reaction" in msg
  );
}

// =============================================================================
// Generic Message Type
// =============================================================================

export type WebSocketMessage =
  | AckMessage
  | NackMessage
  | SessionRegisteredMessage
  | LikeReceivedMessage
  | ListenerCountMessage
  | TempoFeedbackMessage
  | PollStartedMessage
  | PollUpdateMessage
  | PollEndedMessage
  | ReactionReceivedMessage
  | SessionExpiredMessage
  | SessionValidMessage;

/**
 * Check if a message has a valid type field
 */
export function hasMessageType(msg: unknown): msg is BaseMessage {
  return (
    typeof msg === "object" &&
    msg !== null &&
    "type" in msg &&
    typeof (msg as BaseMessage).type === "string"
  );
}
