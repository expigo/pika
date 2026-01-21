/**
 * Message Reliability (ACK/NACK Protocol)
 *
 * @file reliability.ts
 * @package @pika/desktop
 * @created 2026-01-21
 *
 * PURPOSE:
 * Reliable message delivery with ACK/NACK and exponential backoff.
 */

import type ReconnectingWebSocket from "reconnecting-websocket";
import { toast } from "sonner";
import { offlineQueueRepository } from "../db/repositories/offlineQueueRepository";

// ============================================================================
// Types
// ============================================================================

interface PendingMessage {
  messageId: string;
  payload: object;
  resolve: (ack: boolean) => void;
  retryCount: number;
  timeout: ReturnType<typeof setTimeout>;
}

// ============================================================================
// Constants
// ============================================================================

export const ACK_TIMEOUT_MS = 5000; // Wait 5s for ACK
export const MAX_RETRIES = 3;
export const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

// ============================================================================
// State
// ============================================================================

// Track messages awaiting ACK from server
const pendingMessages = new Map<string, PendingMessage>();

// Reference to socket (set by useLiveSession)
let socketRef: ReconnectingWebSocket | null = null;

/**
 * Set the socket reference for reliability module
 */
export function setSocket(socket: ReconnectingWebSocket | null): void {
  socketRef = socket;
}

// ============================================================================
// Operations
// ============================================================================

/**
 * Generate a unique message ID for ACK tracking
 */
export function generateMessageId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Handle incoming ACK from server
 */
export function handleAck(messageId: string): void {
  const pending = pendingMessages.get(messageId);
  if (pending) {
    clearTimeout(pending.timeout);
    pendingMessages.delete(messageId);
    pending.resolve(true);
    console.log(`[ACK] ✅ Received ACK for ${messageId}`);
  }
}

/**
 * Handle incoming NACK from server
 */
export function handleNack(messageId: string, error: string): void {
  const pending = pendingMessages.get(messageId);
  if (pending) {
    clearTimeout(pending.timeout);
    console.error(`[ACK] ❌ Received NACK for ${messageId}: ${error}`);

    // Retry if under limit
    if (pending.retryCount < MAX_RETRIES) {
      const delay = RETRY_DELAYS[pending.retryCount] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
      console.log(
        `[ACK] Retrying ${messageId} in ${delay}ms (attempt ${pending.retryCount + 1}/${MAX_RETRIES})`,
      );

      setTimeout(() => {
        if (socketRef?.readyState === WebSocket.OPEN) {
          retrySend(pending);
        } else {
          // Socket not open, move to offline queue
          pendingMessages.delete(messageId);
          offlineQueueRepository.enqueue(pending.payload).catch(console.error);
          pending.resolve(false);
        }
      }, delay);
    } else {
      // Max retries exceeded
      pendingMessages.delete(messageId);
      pending.resolve(false);
      toast(`Failed to sync: ${error}`, { icon: "⚠️" });
    }
  }
}

/**
 * Retry sending a message
 */
function retrySend(pending: PendingMessage): void {
  pending.retryCount++;

  // Set new timeout
  pending.timeout = setTimeout(() => {
    handleTimeout(pending.messageId);
  }, ACK_TIMEOUT_MS);

  socketRef?.send(JSON.stringify(pending.payload));
  console.log(
    `[ACK] 🔄 Retrying ${pending.messageId} (attempt ${pending.retryCount}/${MAX_RETRIES})`,
  );
}

/**
 * Handle ACK timeout
 */
export function handleTimeout(messageId: string): void {
  const pending = pendingMessages.get(messageId);
  if (!pending) return;

  console.warn(`[ACK] ⏱️ Timeout for ${messageId}`);

  if (pending.retryCount < MAX_RETRIES) {
    // Retry
    if (socketRef?.readyState === WebSocket.OPEN) {
      retrySend(pending);
    } else {
      // Socket closed, move to offline queue
      pendingMessages.delete(messageId);
      offlineQueueRepository.enqueue(pending.payload).catch(console.error);
      pending.resolve(false);
    }
  } else {
    // Max retries, give up
    pendingMessages.delete(messageId);
    pending.resolve(false);
    console.error(`[ACK] ❌ Message ${messageId} failed after ${MAX_RETRIES} retries`);
  }
}

/**
 * Clear all pending messages (on session end)
 */
export function clearPendingMessages(): void {
  for (const [, pending] of pendingMessages) {
    clearTimeout(pending.timeout);
    pending.resolve(false);
  }
  pendingMessages.clear();
}

/**
 * Track a message for reliable delivery
 */
export function trackMessage(
  messageId: string,
  payload: object,
): Promise<boolean> {
  return new Promise((resolve) => {
    const pending: PendingMessage = {
      messageId,
      payload,
      resolve,
      retryCount: 0,
      timeout: setTimeout(() => handleTimeout(messageId), ACK_TIMEOUT_MS),
    };
    pendingMessages.set(messageId, pending);
  });
}

/**
 * Get count of pending messages (for monitoring)
 */
export function getPendingCount(): number {
  return pendingMessages.size;
}
