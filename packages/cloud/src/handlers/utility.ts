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

import { PingSchema, GetSessionsSchema, ValidateSessionSchema } from "@pika/shared";
import { getAllSessions, hasSession } from "../lib/sessions";
import { sendAck, parseMessage } from "../lib/protocol";
import type { WSContext } from "./ws-context";

/**
 * Check if the WebSocket buffer is full (Backpressure)
 * Returns true if safe to send, false if backed up.
 */
export function checkBackpressure(
  rawWs: { getBufferedAmount: () => number },
  clientId?: string | null,
): boolean {
  if (rawWs.getBufferedAmount() > 1024 * 64) {
    console.warn(`⏳ Backpressure: Skipping message for ${clientId || "unknown"} (buffer full)`);
    return false;
  }
  return true;
}

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

  console.log(
    `🔍 [GET_SESSIONS] Returning ${sessions.length} sessions to client ${state.clientId || "unknown"}`,
    {
      sessionIds: sessions.map((s) => s.sessionId),
      djNames: sessions.map((s) => s.djName),
    },
  );

  // Backpressure awareness
  if (checkBackpressure(rawWs, state.clientId)) {
    ws.send(
      JSON.stringify({
        type: "SESSIONS_LIST",
        sessions,
      }),
    );
  }
}

/**
 * VALIDATE_SESSION: Client checks if its session is still active
 */
export function handleValidateSession(ctx: WSContext) {
  const { message, ws, messageId } = ctx;
  const msg = parseMessage(ValidateSessionSchema, message, ws, messageId);
  if (!msg) return;

  const isValid = hasSession(msg.sessionId);

  ws.send(
    JSON.stringify({
      type: "SESSION_VALID",
      sessionId: msg.sessionId,
      isValid,
    }),
  );

  if (messageId) sendAck(ws, messageId);
}
