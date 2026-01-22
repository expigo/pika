/**
 * WebSocket Message Router
 *
 * Provides O(1) message type dispatch using a Map-based registry.
 * Each handler is isolated, testable, and replaceable.
 *
 * Pattern: Registry + Strategy
 * - Handlers are registered by message type
 * - Dispatch is O(1) via Map lookup
 * - Unknown message types are logged, not crashed
 *
 * @package @pika/desktop
 */

import { MESSAGE_TYPES } from "@pika/shared";
import { logger } from "../../utils/logger";
import {
  hasMessageType,
  isAckMessage,
  isLikeReceivedMessage,
  isListenerCountMessage,
  isNackMessage,
  isPollEndedMessage,
  isPollStartedMessage,
  isPollUpdateMessage,
  isReactionReceivedMessage,
  isTempoFeedbackMessage,
} from "./typeGuards";

// =============================================================================
// Types
// =============================================================================

export type MessageHandler<T = unknown> = (message: T) => void;

export interface MessageRouterContext {
  sessionId: string;
  onAck: (messageId: string) => void;
  onNack: (messageId: string, error: string) => void;
  onLikeReceived: (trackTitle: string) => void;
  onListenerCount: (count: number) => void;
  onTempoFeedback: (feedback: {
    faster: number;
    slower: number;
    perfect: number;
    total: number;
  }) => void;
  onPollStarted: (pollId: number, question: string, endsAt?: string) => void;
  onPollUpdate: (pollId: number, votes: number[], totalVotes: number) => void;
  onPollEnded: (pollId: number) => void;
  onReactionReceived: (reaction: "thank_you") => void;
  onSessionRegistered: (sessionId: string) => void;
}

// =============================================================================
// Message Router Class
// =============================================================================

class MessageRouter {
  private handlers = new Map<string, MessageHandler>();
  private context: MessageRouterContext | null = null;

  /**
   * Set the context with callbacks for handling messages
   */
  setContext(context: MessageRouterContext): void {
    this.context = context;
    this.registerDefaultHandlers();
  }

  /**
   * Clear context (on session end)
   */
  clearContext(): void {
    this.context = null;
    this.handlers.clear();
  }

  /**
   * Register a handler for a message type
   */
  register<T>(type: string, handler: MessageHandler<T>): void {
    this.handlers.set(type, handler as MessageHandler);
  }

  /**
   * Dispatch a message to its handler
   * Returns true if handled, false if no handler found
   */
  dispatch(message: unknown): boolean {
    if (!hasMessageType(message)) {
      logger.warn("MessageRouter", "Message has no type field", message);
      return false;
    }

    const handler = this.handlers.get(message.type);
    if (handler) {
      try {
        handler(message);
        return true;
      } catch (error) {
        logger.error("MessageRouter", `Handler error for ${message.type}`, error);
        return false;
      }
    }

    logger.debug("MessageRouter", `No handler for message type: ${message.type}`);
    return false;
  }

  /**
   * Register all default handlers based on context
   */
  private registerDefaultHandlers(): void {
    if (!this.context) return;

    const ctx = this.context;

    // ACK handler
    this.register(MESSAGE_TYPES.ACK, (msg: unknown) => {
      if (isAckMessage(msg)) {
        ctx.onAck(msg.messageId);
      }
    });

    // NACK handler
    this.register(MESSAGE_TYPES.NACK, (msg: unknown) => {
      if (isNackMessage(msg)) {
        ctx.onNack(msg.messageId, msg.error);
      }
    });

    // Like received handler
    this.register(MESSAGE_TYPES.LIKE_RECEIVED, (msg: unknown) => {
      if (isLikeReceivedMessage(msg)) {
        const trackTitle = msg.payload?.track?.title;
        if (trackTitle) {
          ctx.onLikeReceived(trackTitle);
        }
      }
    });

    // Listener count handler
    this.register(MESSAGE_TYPES.LISTENER_COUNT, (msg: unknown) => {
      if (isListenerCountMessage(msg)) {
        // Only update if it's for our session or no session specified
        if (!msg.sessionId || msg.sessionId === ctx.sessionId) {
          ctx.onListenerCount(msg.count);
        }
      }
    });

    // Tempo feedback handler
    this.register(MESSAGE_TYPES.TEMPO_FEEDBACK, (msg: unknown) => {
      if (isTempoFeedbackMessage(msg)) {
        ctx.onTempoFeedback({
          faster: msg.faster,
          slower: msg.slower,
          perfect: msg.perfect,
          total: msg.total,
        });
      }
    });

    // Poll started handler
    this.register(MESSAGE_TYPES.POLL_STARTED, (msg: unknown) => {
      if (isPollStartedMessage(msg)) {
        ctx.onPollStarted(msg.pollId, msg.question, msg.endsAt);
      }
    });

    // Poll update handler
    this.register(MESSAGE_TYPES.POLL_UPDATE, (msg: unknown) => {
      if (isPollUpdateMessage(msg)) {
        ctx.onPollUpdate(msg.pollId, msg.votes, msg.totalVotes);
      }
    });

    // Poll ended handler
    this.register(MESSAGE_TYPES.POLL_ENDED, (msg: unknown) => {
      if (isPollEndedMessage(msg)) {
        ctx.onPollEnded(msg.pollId);
      }
    });

    // Reaction received handler
    this.register(MESSAGE_TYPES.REACTION_RECEIVED, (msg: unknown) => {
      if (isReactionReceivedMessage(msg)) {
        ctx.onReactionReceived(msg.reaction);
      }
    });

    // Session registered handler
    this.register(MESSAGE_TYPES.SESSION_REGISTERED, (msg: unknown) => {
      if (
        typeof msg === "object" &&
        msg !== null &&
        "sessionId" in msg &&
        typeof (msg as { sessionId: string }).sessionId === "string"
      ) {
        ctx.onSessionRegistered((msg as { sessionId: string }).sessionId);
      }
    });
  }

  /**
   * Get count of registered handlers (for testing)
   */
  getHandlerCount(): number {
    return this.handlers.size;
  }

  /**
   * Check if a handler is registered (for testing)
   */
  hasHandler(type: string): boolean {
    return this.handlers.has(type);
  }
}

/**
 * Singleton message router instance
 */
export const messageRouter = new MessageRouter();
