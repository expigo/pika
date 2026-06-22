/**
 * D1 regression guard.
 *
 * The Tauri SQL plugin returns rows as name-keyed objects, but drizzle's
 * sqlite-proxy contract requires POSITIONAL value arrays (drizzle maps columns
 * itself via mapResultRow → row[columnIndex]). If the adapter returns objects,
 * every field silently resolves to `undefined`, breaking settingsRepository and
 * offlineQueueRepository. This test asserts the adapter round-trips real values.
 */
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { fakeSelect, fakeExecute } = vi.hoisted(() => ({
  fakeSelect: vi.fn(),
  fakeExecute: vi.fn(),
}));

// Mock the low-level Tauri SQL plugin so .select() returns OBJECT rows,
// exactly like the real plugin does.
vi.mock("@tauri-apps/plugin-sql", () => ({
  default: {
    load: vi.fn(async () => ({ execute: fakeExecute, select: fakeSelect })),
  },
}));

import { getDb } from "./index";
import { settings } from "./schema";

describe("sqlite-proxy adapter (D1 regression guard)", () => {
  beforeEach(() => {
    fakeExecute.mockResolvedValue({ rowsAffected: 0, lastInsertId: 0 });
    // Schema-init queries (inside initializeDb) get []; the table/count queries
    // under test return name-keyed objects like the real plugin.
    fakeSelect.mockImplementation(async (q: string) => {
      if (/count\(\*\)/i.test(q)) return [{ count: 7 }];
      if (/from\s+"?settings"?/i.test(q)) {
        return [{ key: "analysis.onTheFly", value: "true", updated_at: 123 }];
      }
      return [];
    });
  });

  it("round-trips real column values through db.select().from() (not undefined)", async () => {
    const rows = await getDb().select().from(settings);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.key).toBe("analysis.onTheFly");
    expect(rows[0]?.value).toBe("true");
    expect(rows[0]?.updatedAt).toBe(123);
  });

  it("maps aggregate (count) selects to a real number", async () => {
    const result = await getDb().select({ count: sql<number>`count(*)` }).from(settings);
    expect(result[0]?.count).toBe(7);
  });
});
