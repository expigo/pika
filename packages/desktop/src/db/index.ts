import Database from "@tauri-apps/plugin-sql";
import { drizzle, type SqliteRemoteDatabase } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

// Lazy database initialization to avoid issues with module loading
let sqliteInstance: Awaited<ReturnType<typeof Database.load>> | null = null;
let dbInstance: SqliteRemoteDatabase<typeof schema> | null = null;
let initPromise: Promise<void> | null = null;

async function initializeDb(): Promise<void> {
  if (sqliteInstance) return;

  try {
    sqliteInstance = await Database.load("sqlite:pika.db");

    // S0.3.1 Fix: Enable WAL mode and busy_timeout for concurrency
    await sqliteInstance.execute("PRAGMA journal_mode = WAL;");
    await sqliteInstance.execute("PRAGMA busy_timeout = 5000;");
    await sqliteInstance.execute("PRAGMA foreign_keys = ON;");

    // Create tracks table
    await sqliteInstance.execute(`
            CREATE TABLE IF NOT EXISTS tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path TEXT NOT NULL UNIQUE,
                artist TEXT,
                title TEXT,
                bpm REAL,
                energy REAL,
                key TEXT,
                danceability REAL,
                brightness REAL,
                acousticness REAL,
                groove REAL,
                duration INTEGER,
                analyzed INTEGER DEFAULT 0,
                raw_artist TEXT,
                raw_title TEXT
            );
        `);

    // Migration: Add duration column if it doesn't exist (for existing databases)
    try {
      await sqliteInstance.execute(`ALTER TABLE tracks ADD COLUMN duration INTEGER;`);
      console.log("Migration: Added duration column to tracks table");
    } catch (e) {
      if (!String(e).toLowerCase().includes("duplicate column")) {
        console.error("❌ Migration Failed (duration):", e);
        throw e;
      }
    }

    // Migration: Add raw_artist and raw_title columns (Ghost Data fix)
    try {
      await sqliteInstance.execute(`ALTER TABLE tracks ADD COLUMN raw_artist TEXT;`);
      console.log("Migration: Added raw_artist column to tracks table");
    } catch (e) {
      if (!String(e).toLowerCase().includes("duplicate column")) {
        console.error("❌ Migration Failed (raw_artist):", e);
        throw e;
      }
    }
    try {
      await sqliteInstance.execute(`ALTER TABLE tracks ADD COLUMN raw_title TEXT;`);
      console.log("Migration: Added raw_title column to tracks table");
    } catch (e) {
      if (!String(e).toLowerCase().includes("duplicate column")) {
        console.error("❌ Migration Failed (raw_title):", e);
        throw e;
      }
    }

    // Migration: Add track_key column for Two-Tier Track Key System
    try {
      await sqliteInstance.execute(`ALTER TABLE tracks ADD COLUMN track_key TEXT;`);
      console.log("Migration: Added track_key column to tracks table");
    } catch (e) {
      if (!String(e).toLowerCase().includes("duplicate column")) {
        console.error("❌ Migration Failed (track_key):", e);
        throw e;
      }
    }

    // Migration: Add analysis_version column for re-analysis support
    try {
      await sqliteInstance.execute(
        `ALTER TABLE tracks ADD COLUMN analysis_version INTEGER DEFAULT 0;`,
      );
      console.log("Migration: Added analysis_version column to tracks table");
    } catch (e) {
      if (!String(e).toLowerCase().includes("duplicate column")) {
        console.error("❌ Migration Failed (analysis_version):", e);
        throw e;
      }
    }

    // Backfill track_key for existing tracks
    try {
      const tracksWithoutKey = await sqliteInstance.select<
        { id: number; artist: string; title: string }[]
      >(`SELECT id, artist, title FROM tracks WHERE track_key IS NULL`);

      if (tracksWithoutKey.length > 0) {
        console.log(`Migration: Backfilling track_key for ${tracksWithoutKey.length} tracks...`);
        const { getTrackKey } = await import("@pika/shared");

        const chunkSize = 50;
        await sqliteInstance.execute("BEGIN TRANSACTION;");
        try {
          for (let i = 0; i < tracksWithoutKey.length; i += chunkSize) {
            const chunk = tracksWithoutKey.slice(i, i + chunkSize);
            const whenClauses: string[] = [];
            const ids: number[] = [];
            const values: string[] = [];

            for (const track of chunk) {
              const key = getTrackKey(track.artist ?? "", track.title ?? "");
              whenClauses.push(`WHEN id = ? THEN ?`);
              ids.push(track.id);
              values.push(key);
            }

            // Build query: UPDATE tracks SET track_key = CASE WHEN id = ? THEN ? ... END WHERE id IN (?, ?, ...)
            // Parameters are interleaved [id1, key1, id2, key2, ...] followed by [id1, id2, ...]
            const params: (string | number)[] = [];
            for (let j = 0; j < chunk.length; j++) {
              params.push(ids[j], values[j]);
            }
            params.push(...ids);

            const placeholders = chunk.map(() => "?").join(",");
            const sql = `UPDATE tracks SET track_key = CASE ${whenClauses.join(" ")} END WHERE id IN (${placeholders})`;

            await sqliteInstance.execute(sql, params);
          }
          await sqliteInstance.execute("COMMIT;");
          console.log("Migration: track_key backfill complete");
        } catch (e) {
          await sqliteInstance.execute("ROLLBACK;");
          throw e;
        }
      }
    } catch (e) {
      console.warn("Migration: track_key backfill skipped:", e);
    }

    // Create index on track_key for fast lookups
    try {
      await sqliteInstance.execute(`CREATE UNIQUE INDEX idx_track_key ON tracks(track_key);`);
      console.log("Migration: Created unique index on track_key");
    } catch {
      // Index already exists
    }

    // 🛡️ Issue 18 Fix: Composite index for high-performance track history lookups
    try {
      await sqliteInstance.execute(
        `CREATE INDEX IF NOT EXISTS idx_plays_track_played ON plays(track_id, played_at DESC);`,
      );
      console.log("Migration: Created composite index idx_plays_track_played");
    } catch (e) {
      console.error("❌ Migration Failed (idx_plays_track_played):", e);
    }

    // Migration: Add tags column for custom tagging feature (Phase 2)
    try {
      await sqliteInstance.execute(`ALTER TABLE tracks ADD COLUMN tags TEXT DEFAULT '[]';`);
      console.log("Migration: Added tags column to tracks table");
    } catch {
      // Column already exists, ignore error
    }

    // Migration: Add notes column for DJ personal notes (Phase 2)
    try {
      await sqliteInstance.execute(`ALTER TABLE tracks ADD COLUMN notes TEXT;`);
      console.log("Migration: Added notes column to tracks table");
    } catch {
      // Column already exists, ignore error
    }

    // Create sessions table (Logbook)
    await sqliteInstance.execute(`
            CREATE TABLE IF NOT EXISTS sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                uuid TEXT NOT NULL UNIQUE,
                cloud_session_id TEXT,
                dj_identity TEXT DEFAULT 'Default',
                name TEXT,
                started_at INTEGER NOT NULL,
                ended_at INTEGER
            );
        `);

    // Migration: Add cloud_session_id column if it doesn't exist (for existing databases)
    try {
      await sqliteInstance.execute(`ALTER TABLE sessions ADD COLUMN cloud_session_id TEXT;`);
      console.log("Migration: Added cloud_session_id column to sessions table");
    } catch {
      // Column already exists, ignore error
    }

    // Create plays table (Track history within sessions)
    await sqliteInstance.execute(`
            CREATE TABLE IF NOT EXISTS plays (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id INTEGER NOT NULL,
                track_id INTEGER NOT NULL,
                played_at INTEGER NOT NULL,
                duration INTEGER,
                reaction TEXT DEFAULT 'neutral',
                notes TEXT,
                dancer_likes INTEGER DEFAULT 0,
                FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                FOREIGN KEY (track_id) REFERENCES tracks(id)
            );
        `);

    // Migration: Update existing plays table to support ON DELETE CASCADE
    try {
      const playsSchema = await sqliteInstance.select<{ sql: string }[]>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='plays'",
      );
      if (playsSchema[0] && !playsSchema[0].sql.includes("CASCADE")) {
        console.log("Migration: Adding CASCADE to plays table...");
        await sqliteInstance.execute("BEGIN TRANSACTION;");
        await sqliteInstance.execute("CREATE TABLE plays_backup AS SELECT * FROM plays;");
        await sqliteInstance.execute("DROP TABLE plays;");
        await sqliteInstance.execute(`
                    CREATE TABLE plays (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        session_id INTEGER NOT NULL,
                        track_id INTEGER NOT NULL,
                        played_at INTEGER NOT NULL,
                        duration INTEGER,
                        reaction TEXT DEFAULT 'neutral',
                        notes TEXT,
                        dancer_likes INTEGER DEFAULT 0,
                        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
                        FOREIGN KEY (track_id) REFERENCES tracks(id)
                    );
                `);
        await sqliteInstance.execute("INSERT INTO plays SELECT * FROM plays_backup;");
        await sqliteInstance.execute("DROP TABLE plays_backup;");
        await sqliteInstance.execute("COMMIT;");
        console.log("Migration: plays table CASCADE added successfully");
      }
    } catch (e) {
      console.error("Migration: plays table CASCADE failed:", e);
      try {
        await sqliteInstance.execute("ROLLBACK;");
      } catch {}
    }

    // Create saved_sets table
    await sqliteInstance.execute(`
            CREATE TABLE IF NOT EXISTS saved_sets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
        `);

    // Create saved_set_tracks table
    await sqliteInstance.execute(`
            CREATE TABLE IF NOT EXISTS saved_set_tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                set_id INTEGER NOT NULL,
                track_id INTEGER NOT NULL,
                position INTEGER NOT NULL,
                FOREIGN KEY (set_id) REFERENCES saved_sets(id) ON DELETE CASCADE,
                FOREIGN KEY (track_id) REFERENCES tracks(id)
            );
        `);

    // Create offline_queue table
    await sqliteInstance.execute(`
            CREATE TABLE IF NOT EXISTS offline_queue (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                payload TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
        `);

    // Create settings table (Phase 2 BPM Pipeline)
    await sqliteInstance.execute(`
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY NOT NULL,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            );
        `);

    // Create set_templates table (Phase 2.3: Set Templates)
    await sqliteInstance.execute(`
            CREATE TABLE IF NOT EXISTS set_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                description TEXT,
                slots TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
        `);

    // Sprint 2: Performance Indexes
    try {
      const indexQueries = [
        // Plays optimization
        "CREATE INDEX IF NOT EXISTS idx_plays_session_id ON plays(session_id);",
        "CREATE INDEX IF NOT EXISTS idx_plays_track_id ON plays(track_id);",
        "CREATE INDEX IF NOT EXISTS idx_plays_reaction ON plays(reaction);",
        "CREATE INDEX IF NOT EXISTS idx_plays_played_at ON plays(played_at);",

        // Session sorting/filtering
        "CREATE INDEX IF NOT EXISTS idx_sessions_ended_at ON sessions(ended_at);",
        "CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);",
        "CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions(started_at DESC) WHERE ended_at IS NULL;",

        // Track analysis queue
        "CREATE INDEX IF NOT EXISTS idx_tracks_analyzed ON tracks(analyzed);",

        // Saved sets joins
        "CREATE INDEX IF NOT EXISTS idx_saved_set_tracks_set_id ON saved_set_tracks(set_id);",
        "CREATE INDEX IF NOT EXISTS idx_saved_set_tracks_track_id ON saved_set_tracks(track_id);",
      ];

      for (const query of indexQueries) {
        await sqliteInstance.execute(query);
      }
      console.log("Performance indexes verified");
    } catch (e) {
      console.warn("Index creation warning (non-fatal):", e);
    }

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

// Helper function to convert snake_case to camelCase
function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// Map row column names from snake_case to camelCase
function mapRowColumns(row: Record<string, unknown>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    mapped[snakeToCamel(key)] = value;
  }
  return mapped;
}

// Create drizzle instance - lazy initialization
function createDrizzle(): SqliteRemoteDatabase<typeof schema> {
  return drizzle(
    async (sql, params, method) => {
      const sqlite = await getSqlite();
      try {
        // For write operations (INSERT, UPDATE, DELETE), use execute()
        // For read operations (SELECT), use select()
        if (method === "run") {
          await sqlite.execute(sql, params);
          return { rows: [] };
        }

        const rows: Record<string, unknown>[] = await sqlite.select(sql, params);
        // Map column names from snake_case to camelCase for Drizzle
        const mappedRows = rows.map(mapRowColumns);
        return { rows: mappedRows };
      } catch (e: unknown) {
        console.error("Error from sqlite proxy server: ", e);
        throw e;
      }
    },
    { schema },
  );
}

// Export db getter - creates instance on first use
export function getDb(): SqliteRemoteDatabase<typeof schema> {
  if (!dbInstance) {
    dbInstance = createDrizzle();
  }
  return dbInstance;
}

// For backward compatibility - export db as a getter
export const db = createDrizzle();
