import { asc, inArray, sql } from "drizzle-orm";
import { db } from "../index";
import { offlineQueue } from "../schema";

export interface QueuedMessage {
  id: number;
  payload: object;
  createdAt: number;
}

export const offlineQueueRepository = {
  /**
   * Add a message to the persistent offline queue
   */
  async enqueue(payload: object): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000);

    await db.insert(offlineQueue).values({
      payload: JSON.stringify(payload),
      createdAt: timestamp,
    });
  },

  /**
   * Get all queued messages ordered by creation time
   */
  async getAll(): Promise<QueuedMessage[]> {
    const rows = await db.select().from(offlineQueue).orderBy(asc(offlineQueue.createdAt));

    return rows.map((row) => {
      try {
        return {
          id: row.id,
          payload: row.payload ? JSON.parse(row.payload as string) : null,
          createdAt: row.createdAt,
        };
      } catch (err) {
        console.error(`[Queue] Failed to parse message ${row.id}:`, row.payload, err);
        return {
          id: row.id,
          payload: null as unknown as object,
          createdAt: row.createdAt,
        };
      }
    });
  },

  /**
   * Remove specific messages from the queue
   */
  async deleteMany(ids: number[]): Promise<void> {
    if (ids.length === 0) return;

    await db.delete(offlineQueue).where(inArray(offlineQueue.id, ids));
  },

  /**
   * Get queue size
   */
  async count(): Promise<number> {
    const result = await db.select({ count: sql<number>`count(*)` }).from(offlineQueue);
    return result[0]?.count ?? 0;
  },
};
