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

export type PersistenceTask = () => Promise<void>;

// Internal task wrapper that handles promise resolution
interface QueuedTask {
  execute: () => Promise<void>;
  resolve: () => void;
  reject: (err: unknown) => void;
}

class SessionQueue {
  private queue: QueuedTask[] = [];
  private processing = false;

  enqueue(task: PersistenceTask): Promise<void> {
    return new Promise((resolve, reject) => {
      this.queue.push({ execute: task, resolve, reject });
      this.process();
    });
  }

  private async process() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      if (task) {
        try {
          await task.execute();
          task.resolve();
        } catch (e) {
          console.error("❌ Persistence task failed:", e);
          task.reject(e);
        }
      }
    }

    this.processing = false;
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
    queue = new SessionQueue();
    sessionQueues.set(sessionId, queue);
  }

  return queue.enqueue(task);
}

/**
 * Cleanup queue for a session when it ends (Memory Leak Fix)
 */
export function cleanupSessionQueue(sessionId: string) {
  if (sessionQueues.has(sessionId)) {
    sessionQueues.delete(sessionId);
    // console.log(`🧹 Cleaned up persistence queue for ${sessionId}`);
  }
}
