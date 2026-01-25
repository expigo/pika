/**
 * Protocol Helpers (ACK/NACK) and Session Telemetry
 *
 * WebSocket acknowledgment utilities for the Pika! protocol
 */

import { db, schema } from "../db";
import { logger } from "@pika/shared";

// ============================================================================
// Types
// ============================================================================

export type SessionEventType = "connect" | "disconnect" | "reconnect" | "end";

export interface SessionEventMetadata {
  reason?: string;
  reconnectMs?: number;
  clientVersion?: string;
}

// ============================================================================
// ACK/NACK Protocol
// ============================================================================

/**
 * Send an acknowledgment for a received message.
 */
export function sendAck(ws: { send: (data: string) => void }, messageId: string): void {
  if (!messageId) return; // Only ACK if messageId was provided

  try {
    ws.send(
      JSON.stringify({
        type: "ACK",
        messageId,
        status: "ok",
        timestamp: new Date().toISOString(),
      }),
    );
  } catch {
    logger.debug("⚠️ Protocol: Failed to send ACK (client likely disconnected)");
  }
}

/**
 * Send a negative acknowledgment with an error message.
 */
export function sendNack(
  ws: { send: (data: string) => void },
  messageId: string,
  error: string,
): void {
  if (!messageId) return; // Only NACK if messageId was provided

  try {
    ws.send(
      JSON.stringify({
        type: "NACK",
        messageId,
        error,
        timestamp: new Date().toISOString(),
      }),
    );
  } catch {
    logger.debug("⚠️ Protocol: Failed to send NACK");
  }
}

// ============================================================================
// Session Telemetry
// ============================================================================

/**
 * Log session lifecycle events for operational telemetry.
 * Fire-and-forget - does not block main flow.
 */
export async function logSessionEvent(
  sessionId: string,
  eventType: SessionEventType,
  metadata?: SessionEventMetadata,
): Promise<void> {
  try {
    await db.insert(schema.sessionEvents).values({
      sessionId,
      eventType,
      metadata: metadata || null,
    });
    logger.debug(`📊 Telemetry: ${eventType} logged`, { sessionId });
  } catch (e) {
    // Don't let telemetry errors affect main flow
    logger.error("⚠️ Telemetry log failed (non-blocking)", e);
  }
}

// ============================================================================
// Type-Safe Message Parsing
// ============================================================================

import type { z } from "zod";

/**
 * WebSocket interface for message parsing
 */
interface WSLike {
  send: (data: string) => void;
}

/**
 * Parse and validate an incoming WebSocket message using a Zod schema.
 * Sends NACK on validation failure if messageId is provided.
 *
 * @returns Validated message data, or null if validation failed
 */
export function parseMessage<T extends z.ZodType>(
  schema: T,
  message: unknown,
  ws: WSLike,
  messageId?: string,
): z.infer<T> | null {
  const result = schema.safeParse(message);
  if (!result.success) {
    const issue = result.error.issues[0];
    logger.warn("⚠️ Invalid message received", {
      path: issue?.path?.join("."),
      message: issue?.message,
    });
    if (messageId)
      sendNack(ws, messageId, `Invalid message: ${issue?.message || "validation failed"}`);
    return null;
  }
  return result.data;
}
