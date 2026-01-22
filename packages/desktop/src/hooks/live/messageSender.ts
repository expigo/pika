/**
 * Message Sender with Reliability Options
 *
 * Provides a unified interface for sending WebSocket messages
 * with optional ACK tracking for critical messages.
 *
 * @package @pika/desktop
 */

import { toast } from "sonner";
import { offlineQueueRepository } from "../../db/repositories/offlineQueueRepository";
import { generateMessageId, trackMessage } from "./reliability";
import { isInLiveMode } from "./stateHelpers";

// ============================================================================
// Module State (Non-Serializable Only)
// ============================================================================

// Socket reference - will be set by the main hook
// NOTE: This is the ONLY module-level state - WebSocket cannot be serialized
let socketInstance: WebSocket | null = null;

// ============================================================================
// Configuration
// ============================================================================

/**
 * Set the socket instance for sending
 * Called by the main hook when socket is created
 */
export function setMessageSenderSocket(socket: WebSocket | null): void {
  socketInstance = socket;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Send a message to the cloud server
 *
 * @param message - The message payload (must have a `type` field)
 * @param reliable - If true, track for ACK and retry on failure (default: false)
 * @returns Promise that resolves when ACK received (if reliable) or immediately (if not)
 *
 * Behavior:
 * - If socket is open and reliable=false: send immediately, resolve true
 * - If socket is open and reliable=true: track for ACK, resolve when ACK/timeout
 * - If socket is closed and isInLiveMode()=true: queue to offline store
 * - If socket is closed and isInLiveMode()=false: resolve false
 */
export function sendMessage(
  message: { type: string; [key: string]: unknown },
  reliable = false,
): Promise<boolean> {
  // For critical messages, add messageId for ACK tracking
  const messageId = reliable ? generateMessageId() : undefined;
  const payload = messageId ? { ...message, messageId } : message;

  if (socketInstance?.readyState === WebSocket.OPEN) {
    if (reliable && messageId) {
      // Track for ACK - trackMessage handles timeout and retries
      socketInstance.send(JSON.stringify(payload));
      console.log(`[Send] Sent (reliable): ${message.type} [${messageId}]`);
      return trackMessage(messageId, payload);
    } else {
      // Fire and forget
      socketInstance.send(JSON.stringify(payload));
      console.log("[Send] Sent:", message.type);
      return Promise.resolve(true);
    }
  } else {
    // Queue the message if we are in live mode
    if (isInLiveMode()) {
      console.log("[Send] Socket offline - Queuing persistent message:", message.type);

      // Fire and forget enqueue to avoid blocking UI
      offlineQueueRepository.enqueue(payload).catch((e) => {
        console.error("[Send] Failed to persist offline message:", e);
      });

      // Only toast for "important" updates to avoid spam
      if (message.type === "BROADCAST_TRACK") {
        toast("Offline: Track queued for sync", { icon: "📡" });
      }
    }
    return Promise.resolve(false);
  }
}

/**
 * Check if socket is currently connected
 */
export function isSocketConnected(): boolean {
  return socketInstance?.readyState === WebSocket.OPEN;
}
