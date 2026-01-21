/**
 * WebSocket Handlers Barrel Export with Safe Handler Wrapper
 *
 * All handlers are wrapped with `safeHandler()` to catch unhandled exceptions,
 * log them, and send NACK responses to clients - preventing connection crashes.
 */

import { sendNack } from "../lib/protocol";
import type { WSContext, MessageHandler } from "./ws-context";

// Raw handler imports (private, unwrapped)
import {
  handleRegisterSession as _handleRegisterSession,
  handleBroadcastTrack as _handleBroadcastTrack,
  handleTrackStopped as _handleTrackStopped,
  handleEndSession as _handleEndSession,
  handleSendAnnouncement as _handleSendAnnouncement,
  handleCancelAnnouncement as _handleCancelAnnouncement,
} from "./dj";

import {
  handleSendLike as _handleSendLike,
  handleSendReaction as _handleSendReaction,
  handleSendTempoRequest as _handleSendTempoRequest,
} from "./dancer";

import { handleSubscribe as _handleSubscribe } from "./subscriber";

import {
  handleStartPoll as _handleStartPoll,
  handleEndPoll as _handleEndPoll,
  handleCancelPoll as _handleCancelPoll,
  handleVoteOnPoll as _handleVoteOnPoll,
} from "./poll";

import { handlePing as _handlePing, handleGetSessions as _handleGetSessions } from "./utility";

// ============================================================================
// Safe Handler Wrapper
// ============================================================================

/**
 * Wraps a message handler to catch unhandled exceptions.
 * On error: logs the exception and sends a NACK to the client.
 * This prevents a single malformed message from crashing the WebSocket connection.
 *
 * @param handler - The raw message handler function
 * @returns A wrapped handler that catches and handles errors gracefully
 */
export function safeHandler(handler: MessageHandler): MessageHandler {
  return async (ctx: WSContext) => {
    try {
      await handler(ctx);
    } catch (error) {
      const handlerName = handler.name || "unknown";
      console.error(`❌ Unhandled exception in ${handlerName}:`, error);

      // Send NACK to client if messageId is available
      if (ctx.messageId) {
        try {
          sendNack(ctx.ws, ctx.messageId, "Internal server error");
        } catch (sendError) {
          console.error(`❌ Failed to send NACK after handler error:`, sendError);
        }
      }
    }
  };
}

// ============================================================================
// Wrapped Handler Exports (Public API)
// ============================================================================

// DJ Handlers
export const handleRegisterSession = safeHandler(_handleRegisterSession);
export const handleBroadcastTrack = safeHandler(_handleBroadcastTrack);
export const handleTrackStopped = safeHandler(_handleTrackStopped);
export const handleEndSession = safeHandler(_handleEndSession);
export const handleSendAnnouncement = safeHandler(_handleSendAnnouncement);
export const handleCancelAnnouncement = safeHandler(_handleCancelAnnouncement);

// Dancer Handlers
export const handleSendLike = safeHandler(_handleSendLike);
export const handleSendReaction = safeHandler(_handleSendReaction);
export const handleSendTempoRequest = safeHandler(_handleSendTempoRequest);

// Subscriber Handler
export const handleSubscribe = safeHandler(_handleSubscribe);

// Poll Handlers
export const handleStartPoll = safeHandler(_handleStartPoll);
export const handleEndPoll = safeHandler(_handleEndPoll);
export const handleCancelPoll = safeHandler(_handleCancelPoll);
export const handleVoteOnPoll = safeHandler(_handleVoteOnPoll);

// Utility Handlers
export const handlePing = safeHandler(_handlePing);
export const handleGetSessions = safeHandler(_handleGetSessions);

// Re-export types and lifecycle handlers (no wrapping needed for lifecycle)
export * from "./ws-context";
export * from "./lifecycle";
