/**
 * ACK registry — reliable, ACK-gated message delivery for the web client.
 *
 * Pure (no React) so the async-coordination logic is unit-testable. Used by the
 * offline-like flush: a queued batch is only cleared from IndexedDB once the server
 * ACKs the `messageId` it was sent with. Server-side idempotency
 * (`unique_like_idempotency` + `onConflictDoNothing`) makes re-flushing an un-ACKed
 * batch safe — no duplicate rows and no duplicate heart animations.
 */

import { getTrackKey, MESSAGE_TYPES } from "@pika/shared";
import { safeRandomUUID } from "@/lib/uuid";
import type { MessageHandlers } from "./types";

interface AckWaiter {
  resolve: (ok: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
}

// messageId -> waiter. One tab = one registry; module-level is intentional.
const pendingAcks = new Map<string, AckWaiter>();

/** Unique id for correlating a sent message with its server ACK/NACK. */
export function generateMessageId(): string {
  return safeRandomUUID();
}

/**
 * Wait for the server to ACK `messageId`. Resolves `true` on ACK, `false` on NACK or
 * after `timeoutMs` with no response. Always cleans up its own map entry + timer.
 */
export function waitForAck(messageId: string, timeoutMs: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      pendingAcks.delete(messageId);
      resolve(false);
    }, timeoutMs);

    pendingAcks.set(messageId, { resolve, timer });
  });
}

/**
 * Resolve a pending waiter for `messageId` (`true` = ACK, `false` = NACK).
 * No-op for unknown ids — covers a late ACK after timeout, or unrelated messages.
 */
export function resolveAck(messageId: string | undefined, ok: boolean): void {
  if (!messageId) return;
  const waiter = pendingAcks.get(messageId);
  if (!waiter) return;
  clearTimeout(waiter.timer);
  pendingAcks.delete(messageId);
  waiter.resolve(ok);
}

// Minimal structural shape of a queued offline like (avoids a TrackInfo import cycle).
type QueuedLike = { track: { artist: string; title: string }; timestamp: number };

/** Stable identity for a queued offline like (track + when it was queued). */
export function pendingLikeId(p: QueuedLike): string {
  return `${getTrackKey(p.track)}|${p.timestamp}`;
}

/**
 * Remove exactly the flushed batch from the pending queue, preserving any likes
 * enqueued during the in-flight await (e.g. a socket re-drop mid-flush).
 */
export function filterOutFlushed<T extends QueuedLike>(pending: T[], flushedIds: Set<string>): T[] {
  return pending.filter((p) => !flushedIds.has(pendingLikeId(p)));
}

/** Router handlers — map incoming ACK/NACK to their waiters. */
export const ackHandlers: MessageHandlers = {
  [MESSAGE_TYPES.ACK]: (message) => {
    resolveAck((message as unknown as { messageId?: string }).messageId, true);
  },
  [MESSAGE_TYPES.NACK]: (message) => {
    resolveAck((message as unknown as { messageId?: string }).messageId, false);
  },
};

/** Test isolation — resolve (false) and clear all pending waiters. */
export function clearAllAcks(): void {
  for (const waiter of pendingAcks.values()) {
    clearTimeout(waiter.timer);
    waiter.resolve(false);
  }
  pendingAcks.clear();
}
