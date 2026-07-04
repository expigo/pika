import type Database from "@tauri-apps/plugin-sql";

type Sqlite = Awaited<ReturnType<typeof Database.load>>;

// Vite inlines each committed migration's raw SQL at build time — the Tauri WebView has no
// `fs`, so drizzle's own migrator (which reads files at runtime) can't run here.
const migrationModules = import.meta.glob<string>("./migrations/*.sql", {
  eager: true,
  query: "?raw",
  import: "default",
});

export interface Migration {
  tag: string;
  sql: string;
}

// Ordered by filename: 0000, 0001, …
const MIGRATIONS: Migration[] = Object.entries(migrationModules)
  .map(([path, sql]) => ({
    tag:
      path
        .split("/")
        .pop()
        ?.replace(/\.sql$/, "") ?? path,
    sql,
  }))
  .sort((a, b) => a.tag.localeCompare(b.tag));

/**
 * SQLite has no atomic multi-statement guarantee through tauri-plugin-sql's connection pool
 * (a BEGIN/COMMIT pair can land on different pooled connections), so we make each CREATE
 * idempotent rather than wrapping a transaction — a partially-applied migration is then safe
 * to re-run, mirroring the prior hand-rolled DDL. (drizzle-kit emits plain CREATE.)
 */
export function idempotent(statement: string): string {
  return statement
    .replace(/^CREATE TABLE /i, "CREATE TABLE IF NOT EXISTS ")
    .replace(
      /^CREATE (UNIQUE )?INDEX /i,
      (_m, unique) => `CREATE ${unique ?? ""}INDEX IF NOT EXISTS `,
    );
}

/**
 * Apply pending migrations through the sqlite-proxy, tracking state in `__drizzle_migrations`.
 *
 * Pre-existing hand-rolled DBs (a `tracks` table but no migration table) are *baseline-
 * adopted*: the 0000 baseline is recorded as applied **without re-running it**, since their
 * schema already matches it — so we never touch their data or recreate their objects.
 *
 * Fail-fast: any error throws, so a broken DB surfaces loudly instead of the app running on
 * a half-built schema (unlike the prior swallow-and-continue init).
 */
export async function runMigrations(sqlite: Sqlite): Promise<void> {
  await applyMigrations(sqlite, MIGRATIONS);
}

/**
 * Core apply loop, parameterised over the migration list (the production entry,
 * `runMigrations`, passes the Vite-globbed baseline). Exposed so the engine — baseline-
 * adopt, forward migrations, idempotent retry — can be tested with synthetic migrations.
 */
export async function applyMigrations(sqlite: Sqlite, migrations: Migration[]): Promise<void> {
  await sqlite.execute(
    "CREATE TABLE IF NOT EXISTS __drizzle_migrations (tag TEXT PRIMARY KEY, applied_at INTEGER NOT NULL)",
  );

  const rows = await sqlite.select<{ tag: string }[]>("SELECT tag FROM __drizzle_migrations");
  const applied = new Set(rows.map((r) => r.tag));

  // Baseline-adopt an existing hand-rolled schema so we never re-create its tables.
  if (applied.size === 0 && migrations.length > 0) {
    const legacy = await sqlite.select<{ name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='tracks'",
    );
    if (legacy.length > 0) {
      const baseline = migrations[0].tag;
      await sqlite.execute("INSERT INTO __drizzle_migrations (tag, applied_at) VALUES (?, ?)", [
        baseline,
        Date.now(),
      ]);
      applied.add(baseline);
      console.log(`[migrate] Adopted existing schema at baseline ${baseline}`);
    }
  }

  for (const migration of migrations) {
    if (applied.has(migration.tag)) continue;

    const statements = migration.sql
      .split("--> statement-breakpoint")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    try {
      for (const statement of statements) {
        await sqlite.execute(idempotent(statement));
      }
      await sqlite.execute("INSERT INTO __drizzle_migrations (tag, applied_at) VALUES (?, ?)", [
        migration.tag,
        Date.now(),
      ]);
      console.log(`[migrate] Applied ${migration.tag}`);
    } catch (e) {
      throw new Error(`Migration ${migration.tag} failed: ${String(e)}`);
    }
  }
}
