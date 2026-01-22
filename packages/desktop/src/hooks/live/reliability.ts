/**
 * ACK/NACK Protocol for Reliable Message Delivery
 *
 * Tracks outgoing messages awaiting server acknowledgement.
 * Handles retries with exponential backoff.
 *
 * @package @pika/desktop
 */

import { toast } from "sonner";
import { offlineQueueRepository } from "../../db/repositories/offlineQueueRepository";
import { DEFAULT_RELIABILITY_CONFIG, type PendingMessage, type ReliabilityConfig } from "./types";

// ============================================================================
// Module State
// ============================================================================

const pendingMessages = new Map<string, PendingMessage>();
let config: ReliabilityConfig = DEFAULT_RELIABILITY_CONFIG;

// Socket reference - will be set by the main hook
let socketInstance: WebSocket | null = null;

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configure reliability settings
 */
export function configureReliability(newConfig: Partial<ReliabilityConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Set the socket instance for retries
 * Called by the main hook when socket is created
 */
export function setSocketInstance(socket: WebSocket | null): void {
  socketInstance = socket;
}

// ============================================================================
// Public API
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
  if (!pending) return;

  clearTimeout(pending.timeout);
  console.error(`[ACK] ❌ Received NACK for ${messageId}: ${error}`);

  // Retry if under limit
  if (pending.retryCount < config.maxRetries) {
    const delay =
      config.retryDelays[pending.retryCount] || config.retryDelays[config.retryDelays.length - 1];
    console.log(
      `[ACK] Retrying ${messageId} in ${delay}ms (attempt ${pending.retryCount + 1}/${config.maxRetries})`,
    );

    setTimeout(() => {
      if (socketInstance?.readyState === WebSocket.OPEN) {
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

/**
 * Handle ACK timeout
 */
export function handleTimeout(messageId: string): void {
  const pending = pendingMessages.get(messageId);
  if (!pending) return;

  console.warn(`[ACK] ⏱️ Timeout for ${messageId}`);

  if (pending.retryCount < config.maxRetries) {
    // Retry
    if (socketInstance?.readyState === WebSocket.OPEN) {
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
    console.error(`[ACK] ❌ Message ${messageId} failed after ${config.maxRetries} retries`);
  }
}

/**
 * Retry sending a message
 */
export function retrySend(pending: PendingMessage): void {
  pending.retryCount++;

  // Set new timeout
  pending.timeout = setTimeout(() => {
    handleTimeout(pending.messageId);
  }, config.ackTimeoutMs);

  socketInstance?.send(JSON.stringify(pending.payload));
  console.log(
    `[ACK] 🔄 Retrying ${pending.messageId} (attempt ${pending.retryCount}/${config.maxRetries})`,
  );
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
 * Track a message for ACK
 * Returns a promise that resolves when ACK received or fails
 */
export function trackMessage(messageId: string, payload: object): Promise<boolean> {
  return new Promise((resolve) => {
    const pending: PendingMessage = {
      messageId,
      payload,
      resolve,
      retryCount: 0,
      timeout: setTimeout(() => handleTimeout(messageId), config.ackTimeoutMs),
    };
    pendingMessages.set(messageId, pending);
  });
}

/**
 * Get pending message count (for testing/debugging)
 */
export function getPendingMessageCount(): number {
  return pendingMessages.size;
}

/**
 * Check if a message is pending (for testing)
 */
export function isMessagePending(messageId: string): boolean {
  return pendingMessages.has(messageId);
}
