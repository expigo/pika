/**
 * Pika! Cloud Database Client
 * PostgreSQL connection using drizzle-orm.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Database URL from environment (default for local development).
const DATABASE_URL = process.env["DATABASE_URL"];

// Fail fast in production rather than silently connecting to a local dev DB.
if (!DATABASE_URL && process.env["NODE_ENV"] === "production") {
  throw new Error("DATABASE_URL must be set in production");
}

const RESOLVED_DATABASE_URL = DATABASE_URL || "postgres://pika:pika@localhost:5433/pika_cloud";

// Create the postgres.js connection
const client = postgres(RESOLVED_DATABASE_URL, {
  // Connection pool size. This is a scaling ceiling: it must stay <= Postgres `max_connections`
  // (shared across all app instances). Tune via DB_POOL_MAX when scaling out.
  max: Number(process.env["DB_POOL_MAX"] ?? 10),
  idle_timeout: 60,
  connect_timeout: 30,
  // Runaway-query protection — sent as Postgres connection parameters on connect.
  connection: {
    statement_timeout: 30000, // abort any single statement running > 30s
    idle_in_transaction_session_timeout: 60000, // kill sessions idle-in-transaction > 60s
  },
});

// Create drizzle instance with schema
export const db = drizzle(client, { schema });

// Export schema for convenience
export { schema };

// Export client for cleanup if needed
export { client };
