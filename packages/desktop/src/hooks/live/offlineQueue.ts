/**
 * Offline Queue Management
 *
 * Handles flushing of messages queued in SQLite while offline.
 * Uses exponential backoff to prevent server overload.
 *
 * @package @pika/desktop
 */

import { toast } from "sonner";
import { TIMEOUTS } from "@pika/shared";
import { offlineQueueRepository } from "../../db/repositories/offlineQueueRepository";
import { DEFAULT_QUEUE_FLUSH_CONFIG, type QueueFlushConfig } from "./types";

// ============================================================================
// Module State
// ============================================================================

let isFlushingQueue = false;
let config: QueueFlushConfig = DEFAULT_QUEUE_FLUSH_CONFIG;

// Socket reference - will be set by the main hook
let socketInstance: WebSocket | null = null;

// ============================================================================
// Configuration
// ============================================================================

/**
 * Configure queue flush settings
 */
export function configureQueueFlush(newConfig: Partial<QueueFlushConfig>): void {
  config = { ...config, ...newConfig };
}

/**
 * Set the socket instance for sending
 * Called by the main hook when socket is created
 */
export function setQueueSocketInstance(socket: WebSocket | null): void {
  socketInstance = socket;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Check if a flush is currently in progress
 */
export function isQueueFlushing(): boolean {
  return isFlushingQueue;
}

/**
 * Flush all queued messages to the server
 * Uses exponential backoff between messages
 */
export async function flushQueue(): Promise<void> {
  // Prevent concurrent flushes (thundering herd prevention)
  if (isFlushingQueue) {
    console.log("[Queue] Flush already in progress, skipping");
    return;
  }

  isFlushingQueue = true;

  try {
    const queue = await offlineQueueRepository.getAll();
    if (queue.length === 0) {
      isFlushingQueue = false;
      return;
    }

    console.log(`[Queue] Flushing ${queue.length} queued messages with backoff...`);
    if (queue.length > 5) {
      toast(`Syncing ${queue.length} updates...`, { icon: "🔄" });
    }

    const idsToDelete: number[] = [];
    let consecutiveFailures = 0;

    // Process queue sequentially with exponential backoff
    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];

      // Check socket is still open
      if (socketInstance?.readyState !== WebSocket.OPEN) {
        console.log("[Queue] Socket closed during flush, stopping");
        break;
      }

      if (!item.payload) {
        idsToDelete.push(item.id);
        continue;
      }

      try {
        socketInstance.send(JSON.stringify(item.payload));
        idsToDelete.push(item.id);
        consecutiveFailures = 0; // Reset on success

        // Add delay between messages (exponential backoff based on queue position)
        if (i < queue.length - 1) {
          const delay = Math.min(
            config.baseDelayMs * Math.pow(1.2, Math.floor(i / 5)),
            config.maxDelayMs,
          );
          await new Promise((r) => setTimeout(r, delay));
        }
      } catch (e) {
        consecutiveFailures++;
        console.error(`[Queue] Failed to send message (failure #${consecutiveFailures}):`, e);

        // If we have too many consecutive failures, stop and retry later
        if (consecutiveFailures >= config.maxConsecutiveFailures) {
          console.warn("[Queue] Too many consecutive failures, stopping flush");
          break;
        }

        // Add longer delay after failure
        await new Promise((r) => setTimeout(r, TIMEOUTS.OFFLINE_RETRY_BASE * consecutiveFailures));
      }
    }

    // Clean up successfully sent messages
    if (idsToDelete.length > 0) {
      await offlineQueueRepository.deleteMany(idsToDelete);
      console.log(`[Queue] Removed ${idsToDelete.length} flushed messages from DB`);
    }
  } catch (e) {
    console.error("[Queue] Failed to flush queue:", e);
    toast.error("Offline sync failed - will retry");
  } finally {
    isFlushingQueue = false;
  }
}

/**
 * Get queue size (for testing/UI)
 */
export async function getQueueSize(): Promise<number> {
  const queue = await offlineQueueRepository.getAll();
  return queue.length;
}
