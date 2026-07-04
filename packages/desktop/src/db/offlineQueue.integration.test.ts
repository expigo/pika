/**
 * Desktop persistence integration test.
 *
 * Exercises the REAL stack — drizzle 0.45 sqlite-proxy adapter -> SQL -> a real
 * in-memory SQLite (better-sqlite3) — instead of mocking the DB layer. This locks
 * the D1 fix end-to-end: the offline queue must actually round-trip real rows
 * (before the adapter fix it silently returned undefined ids / count 0).
 *
 * Only the lowest layer (@tauri-apps/plugin-sql's Database.load) is mocked, with a
 * thin wrapper that matches the plugin's interface; everything above (createDrizzle,
 * initializeDb, offlineQueueRepository) is the real code.
 */
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Db = Database.Database;
const state = vi.hoisted(() => ({ bdb: null as unknown as Db }));

vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(async () => ({
      // Tauri's plugin-sql shape: execute() for writes/DDL, select() returns row objects.
      execute: async (sql: string, params: unknown[] = []) => {
        if (!params || params.length === 0) {
          state.bdb.exec(sql);
          return { rowsAffected: 0, lastInsertId: 0 };
        }
        const r = state.bdb.prepare(sql).run(...(params as never[]));
        return { rowsAffected: r.changes, lastInsertId: Number(r.lastInsertRowid) };
      },
      select: async (sql: string, params: unknown[] = []) =>
        params?.length
          ? state.bdb.prepare(sql).all(...(params as never[]))
          : state.bdb.prepare(sql).all(),
    })),
  },
}));

import { offlineQueueRepository } from "./repositories/offlineQueueRepository";

describe("offlineQueueRepository — real SQLite round-trip (D1 integration)", () => {
  beforeEach(() => {
    state.bdb = new Database(":memory:");
  });
  afterEach(() => {
    state.bdb?.close();
  });

  it("enqueue -> count -> getAll -> deleteMany round-trips real rows", async () => {
    await offlineQueueRepository.enqueue({ type: "BROADCAST_TRACK", artist: "A", title: "T" });
    await offlineQueueRepository.enqueue({ type: "SEND_LIKE", trackId: 7 });

    // count() went through the broken drizzle read path before the fix → always 0.
    expect(await offlineQueueRepository.count()).toBe(2);

    const all = await offlineQueueRepository.getAll();
    expect(all).toHaveLength(2);
    expect(all[0]?.id).toBeGreaterThan(0);
    expect(all[0]?.payload).toEqual({ type: "BROADCAST_TRACK", artist: "A", title: "T" });

    // Deleting by the real ids must actually drain the queue.
    await offlineQueueRepository.deleteMany(all.map((m) => m.id));
    expect(await offlineQueueRepository.count()).toBe(0);
  });
});
