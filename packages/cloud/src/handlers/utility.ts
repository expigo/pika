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

import { GetSessionsSchema, logger, PingSchema, ValidateSessionSchema } from "@pika/shared";
import { parseMessage, sendAck } from "../lib/protocol";
import { getAllSessions, hasSession } from "../lib/sessions";
import type { WSContext } from "./ws-context";

/**
 * Backpressure check result with context for callers
 */
export interface BackpressureResult {
  /** Whether it's safe to send the message */
  canSend: boolean;
  /** Current buffer size in bytes */
  bufferSize: number;
  /** Whether the message was dropped due to backpressure */
  dropped: boolean;
}

/**
 * Check if the WebSocket buffer is full (Backpressure)
 * 🛡️ P1 Fix: Returns detailed status instead of just boolean
 *
 * @returns Object with `canSend`, `bufferSize`, and `dropped` fields
 */
export function checkBackpressure(
  rawWs: { getBufferedAmount: () => number },
  clientId?: string | null,
): BackpressureResult {
  const bufferSize = rawWs.getBufferedAmount();
  const threshold = 1024 * 64; // 64KB

  if (bufferSize > threshold) {
    logger.warn(`⏳ Backpressure: Message dropped`, {
      clientId: clientId || "unknown",
      bufferSize,
      threshold,
    });
    return { canSend: false, bufferSize, dropped: true };
  }
  return { canSend: true, bufferSize, dropped: false };
}

/**
 * Legacy boolean check for backwards compatibility
 * @deprecated Use checkBackpressure() and check .canSend property
 */
export function canSendWithBackpressure(
  rawWs: { getBufferedAmount: () => number },
  clientId?: string | null,
): boolean {
  return checkBackpressure(rawWs, clientId).canSend;
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

  logger.debug("🔍 [GET_SESSIONS] Returning sessions", {
    client: state.clientId || "unknown",
    count: sessions.length,
    sessionIds: sessions.map((s) => s.sessionId),
  });

  // Backpressure awareness
  if (checkBackpressure(rawWs, state.clientId).canSend) {
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
