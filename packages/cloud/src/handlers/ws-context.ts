/**
 * WebSocket Context Types
 *
 * Defines the context object passed to WebSocket handlers.
 * This enables extracting handler logic into separate modules
 * while maintaining access to connection-scoped state.
 *
 * @file packages/cloud/src/handlers/ws-context.ts
 * @created 2026-01-21
 */

import type { ServerWebSocket } from "bun";
import type { WebSocketMessage } from "@pika/shared";

/**
 * Represents the mutable connection state for a WebSocket client.
 * Updated as the connection evolves (e.g., SUBSCRIBE sets clientId).
 */
export interface WSConnectionState {
  /** Client ID set when dancer sends SUBSCRIBE */
  clientId: string | null;
  /** True if this connection is a listening dancer */
  isListener: boolean;
  /** Session ID the listener is subscribed to */
  subscribedSessionId: string | null;
  /** Session ID if this connection is a DJ */
  djSessionId: string | null;
}

/**
 * The context object passed to each message handler.
 * Contains everything needed to process a message and respond.
 */
export interface WSContext {
  /** The validated message */
  message: WebSocketMessage & { messageId?: string; clientId?: string };
  /** High-level WebSocket interface from Hono */
  ws: { send: (data: string) => void; close: (code?: number, reason?: string) => void };
  /** Raw Bun ServerWebSocket for pub/sub */
  rawWs: ServerWebSocket;
  /** Mutable connection state */
  state: WSConnectionState;
  /** Message ID for ACK/NACK */
  messageId: string | undefined;
}

/**
 * Message handler function signature.
 * All extracted handlers follow this pattern.
 */
export type MessageHandler = (ctx: WSContext) => void | Promise<void>;
