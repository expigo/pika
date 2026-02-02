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
let currentFlushId = 0;

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
  const flushId = Date.now();
  currentFlushId = flushId;

  // 🛡️ Issue 20 Fix: Add 30s watchdog timer to prevent stall
  const watchdog = setTimeout(() => {
    if (isFlushingQueue && currentFlushId === flushId) {
      console.warn("[Queue] ⏱️ Flush watchdog triggered! Forcing reset.");
      isFlushingQueue = false;
    }
  }, 30000);

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
      // 🛡️ Optimization Audit: Concurrency ID check
      // If a new flush was started (via watchdog/manual), abort this loop
      if (currentFlushId !== flushId) {
        console.warn("[Queue] 🛑 Concurrent flush detected, aborting stale loop");
        return;
      }

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

        // 🛡️ P2 Fix: Linear backoff after first 10 messages (replaces steep exponential)
        // Exponential: Math.pow(1.2, i/5) grows too aggressively
        // Linear: predictable delay that doesn't explode for large queues
        if (i < queue.length - 1) {
          const delay =
            i < 10
              ? config.baseDelayMs // First 10 messages: use base delay
              : Math.min(config.baseDelayMs + (i - 10) * 50, config.maxDelayMs); // After 10: linear +50ms per message
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
    clearTimeout(watchdog);
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
