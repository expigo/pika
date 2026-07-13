/**
 * bun test preload (bunfig.toml [test].preload) — runs once per `bun test` process, before
 * any test file. Its ONLY job is the integration suite's process-level teardown: hooks
 * registered here are RUN-GLOBAL (fire once after ALL files), which is the sole safe home
 * for `client.end()` — the shared pg pool may be closed at most once, and a hook inside any
 * single integration file would bind to that file and kill every later file's queries.
 *
 * Under plain `bun test` (RUN_DB_TESTS unset) this registers nothing and the lazy pg client
 * never connects — a pure no-op for the unit suites.
 */

import { afterAll } from "bun:test";
import { eq } from "drizzle-orm";
import { baseSessionId } from "./src/__tests__/integration/harness";
import { client, db, schema } from "./src/db";

if (process.env["RUN_DB_TESTS"]) {
  afterAll(async () => {
    // Mirrors the pre-split suite afterAll: drop the harness's base session row (CASCADE
    // clears its tracks/likes), then release the pool so the process exits promptly.
    await db.delete(schema.sessions).where(eq(schema.sessions.id, baseSessionId));
    await client.end({ timeout: 5 });
  });
}
