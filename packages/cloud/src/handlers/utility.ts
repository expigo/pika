/**
 * Utility Message Handlers
 *
 * Handles general WebSocket messages:
 * - PING
 * - GET_SESSIONS
 *
 * @file packages/cloud/src/handlers/utility.ts
 * @package @pika/cloud
 * @created 2026-01-21
 */

import { PingSchema, GetSessionsSchema } from "@pika/shared";
import { getAllSessions } from "../lib/sessions";
import { sendAck, parseMessage } from "../lib/protocol";
import type { WSContext } from "./ws-context";

/**
 * PING: Client heart-beat
 */
export function handlePing(ctx: WSContext) {
  const { message, ws, messageId } = ctx;
  // Optional: validate ping message format (lightweight check)
  const msg = parseMessage(PingSchema, message, ws, messageId);
  if (!msg) return;

  ws.send(JSON.stringify({ type: "PONG" }));
  if (messageId) sendAck(ws, messageId);
}

/**
 * GET_SESSIONS: Client requests the list of active sessions
 */
export function handleGetSessions(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(GetSessionsSchema, message, ws, messageId);
  if (!msg) return;

  const sessions = getAllSessions();

  // Backpressure awareness
  if (rawWs.getBufferedAmount() < 1024 * 64) {
    ws.send(
      JSON.stringify({
        type: "SESSIONS_LIST",
        sessions,
      }),
    );
  } else {
    console.warn(`⏳ Backpressure: Skipping SESSIONS_LIST for ${state.clientId} (buffer full)`);
  }
}
