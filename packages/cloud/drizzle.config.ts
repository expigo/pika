import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    // biome-ignore lint/complexity/useLiteralKeys: process.env requires brackets in strict TS
    url: process.env["DATABASE_URL"] || "postgres://pika:pika@localhost:5433/pika_cloud",
  },
});
