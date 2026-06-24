/**
 * Persistence Operation Queue
 *
 * @file persistence/queue.ts
 * @package @pika/cloud
 * @created 2026-01-24
 *
 * PURPOSE:
 * Serializes persistence operations (tracks, likes) per session to prevent race conditions.
 * Ensures strict ordering: Track persistence -> Like persistence.
 */
import { logger } from "@pika/shared";

export type PersistenceTask = () => Promise<void>;

// Internal task wrapper that handles promise resolution
interface QueuedTask {
  execute: () => Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
}

// Max pending tasks per session before new ones are dropped (loudly). Bounds memory if
// the DB stalls while broadcasts keep enqueuing (e.g. a bulk-like burst). Env-tunable.
const MAX_QUEUE_DEPTH = Number(process.env["PERSISTENCE_QUEUE_MAX"] ?? 1000);

export class SessionQueue {
  private readonly queue: QueuedTask[] = [];
  private processing = false;
  private closed = false;

  constructor(
    private readonly sessionId: string,
    private readonly maxDepth: number = MAX_QUEUE_DEPTH,
    /** Called once the queue finishes draining *after* close() — used for self-removal. */
    private readonly onCloseDrained?: () => void,
  ) {}

  enqueue(task: PersistenceTask): Promise<void> {
    return new Promise((resolve, reject) => {
      // Both drop paths RESOLVE (never reject): several callers (e.g. persistTempoVotes)
      // don't .catch the returned promise, so a rejection would become an unhandled
      // rejection. Dropping the task is the intended behaviour at these boundaries.

      // Late persist racing session teardown — drop quietly.
      if (this.closed) {
        logger.debug("🚮 Persistence enqueue on a closed session; dropping", {
          sessionId: this.sessionId,
        });
        resolve();
        return;
      }

      // Overload (DB stalled). Drop loudly.
      if (this.queue.length >= this.maxDepth) {
        logger.error("❌ Persistence queue full; dropping task", {
          sessionId: this.sessionId,
          depth: this.queue.length,
        });
        resolve();
        return;
      }

      this.queue.push({ execute: task, resolve, reject });
      this.process();
    });
  }

  private async process(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try {
          await task.execute();
          task.resolve();
        } catch (e) {
          logger.error("❌ Persistence task failed", e);
          task.reject(e);
        }
      }
    }

    this.processing = false;

    // Cleanup was requested while we were draining: now idle, self-remove.
    if (this.closed) this.onCloseDrained?.();
  }

  /** No task running and nothing queued. */
  get idle(): boolean {
    return !this.processing && this.queue.length === 0;
  }

  /** Pending task count (for tests / monitoring). */
  get depth(): number {
    return this.queue.length;
  }

  /** Stop accepting tasks; queued ones still drain, then onCloseDrained fires. */
  close(): void {
    this.closed = true;
  }
}

// Global map of session queues
const sessionQueues = new Map<string, SessionQueue>();

/**
 * Enqueue a persistence operation for a specific session.
 * Operations for the same session are guaranteed to run sequentially.
 */
export function enqueuePersistence(sessionId: string, task: PersistenceTask): Promise<void> {
  let queue = sessionQueues.get(sessionId);
  if (!queue) {
    queue = new SessionQueue(sessionId, MAX_QUEUE_DEPTH, () => sessionQueues.delete(sessionId));
    sessionQueues.set(sessionId, queue);
  }
  return queue.enqueue(task);
}

/**
 * Cleanup queue for a session when it ends (Memory Leak Fix).
 *
 * If the queue is idle, drop it immediately. If it's still draining, mark it closed instead
 * of deleting: a deleted-but-busy queue would let a late enqueue spawn a SECOND queue for the
 * same session that runs concurrently, breaking the ordering guarantee. A closed queue keeps
 * absorbing (and dropping) new tasks and self-removes from the map once drained.
 */
export function cleanupSessionQueue(sessionId: string): void {
  const queue = sessionQueues.get(sessionId);
  if (!queue) return;
  if (queue.idle) {
    sessionQueues.delete(sessionId);
  } else {
    queue.close();
  }
}

/** Number of live per-session queues (for tests / monitoring). */
export function getSessionQueueCount(): number {
  return sessionQueues.size;
}
