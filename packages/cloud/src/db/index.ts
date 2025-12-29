/**
 * Pika! Cloud Database Client
 * PostgreSQL connection using drizzle-orm.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Database URL from environment (default for local development)
// Using port 5433 to avoid conflict with local PostgreSQL
const DATABASE_URL = process.env["DATABASE_URL"] || "postgres://postgres:postgres@localhost:5433/pika";

// Create the postgres.js connection
const client = postgres(DATABASE_URL, {
    max: 10, // Connection pool size
    idle_timeout: 20,
    connect_timeout: 10,
});

// Create drizzle instance with schema
export const db = drizzle(client, { schema });

// Export schema for convenience
export { schema };

// Export client for cleanup if needed
export { client };
