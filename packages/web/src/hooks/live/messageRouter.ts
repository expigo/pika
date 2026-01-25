/**
 * Message routing factory for WebSocket message dispatch
 */

import { parseWebSocketMessage, logger } from "@pika/shared";
import type { MessageHandler, MessageHandlers } from "./types";

/**
 * Creates a message router that dispatches WebSocket messages to handlers
 *
 * @param handlers - Map of message type to handler function
 * @returns Event handler for socket.onmessage
 */
export function createMessageRouter(handlers: MessageHandlers) {
  return (event: MessageEvent) => {
    const message = parseWebSocketMessage(event.data);
    if (!message) {
      logger.error("[Router] Failed to parse message", { data: event.data });
      return;
    }

    logger.debug("[Router] Received", { type: message.type });

    const handler = handlers[message.type] as MessageHandler | undefined;
    if (handler) {
      handler(message);
    }
  };
}

/**
 * Combines multiple handler maps into one
 * Useful for composing handlers from multiple hooks
 */
export function combineHandlers(...handlerMaps: MessageHandlers[]): MessageHandlers {
  return Object.assign({}, ...handlerMaps);
}
