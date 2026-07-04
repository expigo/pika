import { defineConfig } from "drizzle-kit";

const DATABASE_URL = process.env["DATABASE_URL"];
// Fail fast in production rather than migrating a local dev DB by accident.
if (!DATABASE_URL && process.env["NODE_ENV"] === "production") {
  throw new Error("DATABASE_URL must be set in production");
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: DATABASE_URL || "postgres://pika:pika@localhost:5433/pika_cloud",
  },
});
