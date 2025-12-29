import Database from "@tauri-apps/plugin-sql";
import { drizzle } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";

// Initialize the database connection
// We load the sqlite database file. 'sqlite:' prefix is required by tauri-plugin-sql
const sqlitePromise = Database.load("sqlite:pika.db");

export const db = drizzle(
    async (sql, params, _method) => {
        const sqlite = await sqlitePromise;
        try {
            const rows: any[] = await sqlite.select(sql, params);
            // The proxy expects an object with a 'rows' property.
            // tauri-plugin-sql returns an array of objects.
            return { rows: rows };
        } catch (e: any) {
            console.error("Error from sqlite proxy server: ", e);
            return { rows: [] };
        }
    },
    { schema },
);
