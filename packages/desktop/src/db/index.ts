import Database from "@tauri-apps/plugin-sql";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import { runMigrations } from "./migrator";
import * as schema from "./schema";

// Lazy database initialization to avoid issues with module loading
let sqliteInstance: Awaited<ReturnType<typeof Database.load>> | null = null;
let dbInstance: SqliteRemoteDatabase<typeof schema> | null = null;
let initPromise: Promise<void> | null = null;

async function initializeDb(): Promise<void> {
  if (sqliteInstance) return;

  try {
    sqliteInstance = await Database.load("sqlite:pika.db");

    // WAL persists at the DB-file level. sqlx also enables foreign_keys + a busy_timeout per
    // pooled connection by default, but we set them explicitly to preserve prior behaviour.
    await sqliteInstance.execute("PRAGMA journal_mode = WAL;");
    await sqliteInstance.execute("PRAGMA busy_timeout = 5000;");
    await sqliteInstance.execute("PRAGMA foreign_keys = ON;");

    // Schema is owned by schema.ts → drizzle-kit migrations (src/db/migrations), applied here
    // through the sqlite-proxy. Baseline-adopts pre-existing hand-rolled DBs; fail-fast on error.
    await runMigrations(sqliteInstance);

    console.log("Database initialized successfully");
  } catch (e) {
    console.error("Failed to initialize database:", e);
    throw e;
  }
}

// Export function to get SQLite connection
export async function getSqlite() {
  if (!initPromise) {
    initPromise = initializeDb();
  }
  await initPromise;
  if (!sqliteInstance) {
    throw new Error("Database not initialized");
  }
  return sqliteInstance;
}

// Create drizzle instance backed by the Tauri SQL plugin.
function createDrizzle(): SqliteRemoteDatabase<typeof schema> {
  return drizzle(
    async (sql, params, method) => {
      const sqlite = await getSqlite();
      try {
        // Writes (INSERT/UPDATE/DELETE): execute(); no result rows to map.
        if (method === "run") {
          await sqlite.execute(sql, params);
          return { rows: [] };
        }

        // Reads: @tauri-apps/plugin-sql returns name-keyed objects, but drizzle's
        // sqlite-proxy contract requires POSITIONAL value arrays — drizzle maps
        // columns itself by index (mapResultRow uses row[columnIndex]). Returning
        // objects makes every field resolve to `undefined`. Object.values preserves
        // SELECT-column order, which is the order drizzle expects.
        const rows: Record<string, unknown>[] = await sqlite.select(sql, params);
        const valueRows = rows.map((row) => Object.values(row));

        // `get` expects a single row's value array; `all`/`values` expect array-of-arrays.
        if (method === "get") {
          return { rows: valueRows[0] ?? [] };
        }
        return { rows: valueRows };
      } catch (e: unknown) {
        console.error("Error from sqlite proxy server: ", e);
        throw e;
      }
    },
    { schema },
  );
}

// Single shared drizzle instance (lazy). `db` and `getDb()` return the same one.
export function getDb(): SqliteRemoteDatabase<typeof schema> {
  if (!dbInstance) {
    dbInstance = createDrizzle();
  }
  return dbInstance;
}

// Convenience export — identical instance to getDb().
export const db = getDb();
