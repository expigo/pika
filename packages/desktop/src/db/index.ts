import Database from "@tauri-apps/plugin-sql";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

// Initialize the database connection
// We load the sqlite database file. 'sqlite:' prefix is required by tauri-plugin-sql
const sqlitePromise = Database.load("sqlite:pika.db").then(async (db) => {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT NOT NULL UNIQUE,
            artist TEXT,
            title TEXT,
            bpm REAL,
            energy REAL,
            key TEXT,
            analyzed INTEGER DEFAULT 0
        );
    `);
    return db;
});

// Export raw SQLite connection for operations that need it
export const getSqlite = () => sqlitePromise;

export const db = drizzle(
    async (sql, params, method) => {
        const sqlite = await sqlitePromise;
        try {
            // For write operations (INSERT, UPDATE, DELETE), use execute()
            // For read operations (SELECT), use select()
            if (method === "run") {
                await sqlite.execute(sql, params);
                return { rows: [] };
            }

            const rows: any[] = await sqlite.select(sql, params);
            return { rows: rows };
        } catch (e: any) {
            console.error("Error from sqlite proxy server: ", e);
            throw e; // Re-throw to surface errors properly
        }
    },
    { schema },
);
