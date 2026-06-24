import { defineConfig } from "drizzle-kit";

// Desktop SQLite schema. We only `generate` migrations here (schema.ts is the source of
// truth); they're applied at runtime through the sqlite-proxy by src/db/migrator.ts, since
// drizzle's built-in migrator needs Node fs (unavailable in the Tauri WebView). No
// dbCredentials are needed for `generate`.
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "sqlite",
});
