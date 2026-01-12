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
                analyzed INTEGER DEFAULT 0
            );
        `);

    // Migration: Add duration column if it doesn't exist (for existing databases)
    try {
      await sqliteInstance.execute(`ALTER TABLE tracks ADD COLUMN duration INTEGER;`);
      console.log("Migration: Added duration column to tracks table");
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
                FOREIGN KEY (session_id) REFERENCES sessions(id),
                FOREIGN KEY (track_id) REFERENCES tracks(id)
            );
        `);

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
