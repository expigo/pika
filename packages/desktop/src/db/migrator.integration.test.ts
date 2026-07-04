/**
 * Migrator integration test (real better-sqlite3).
 *
 * The centerpiece for the drizzle-migrator adoption: proves a FRESH install and an
 * UPGRADE from the prior hand-rolled schema both land on a functionally identical schema,
 * that the upgrade preserves existing data (baseline-adopt, no re-create), and that
 * re-running is idempotent. The generated baseline SQL (src/db/migrations/0000_*.sql) is
 * loaded via the real import.meta.glob in migrator.ts.
 */
import BetterSqlite3 from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyMigrations, idempotent, type Migration, runMigrations } from "./migrator";

type Bdb = BetterSqlite3.Database;

// Minimal shim matching @tauri-apps/plugin-sql's runtime surface (execute/select), backed
// by a real in-memory SQLite — the same approach as offlineQueue.integration.test.ts.
function asSqlite(bdb: Bdb): Parameters<typeof runMigrations>[0] {
  return {
    execute: async (sql: string, params: unknown[] = []) => {
      if (!params || params.length === 0) {
        bdb.exec(sql);
        return { rowsAffected: 0, lastInsertId: 0 };
      }
      const r = bdb.prepare(sql).run(...(params as never[]));
      return { rowsAffected: r.changes, lastInsertId: Number(r.lastInsertRowid) };
    },
    select: async (sql: string, params: unknown[] = []) =>
      params?.length ? bdb.prepare(sql).all(...(params as never[])) : bdb.prepare(sql).all(),
  } as unknown as Parameters<typeof runMigrations>[0];
}

// A faithful "old hand-rolled" DB: same columns as schema.ts, but old-style — inline UNIQUE
// (auto-indexes), DESC index ordering, ALTER-appended columns. The migrator must adopt this
// at the baseline WITHOUT recreating anything or touching data.
const LEGACY_DDL = `
CREATE TABLE tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, file_path TEXT NOT NULL UNIQUE, artist TEXT, title TEXT,
  bpm REAL, energy REAL, key TEXT, danceability REAL, brightness REAL, acousticness REAL,
  groove REAL, duration INTEGER, analyzed INTEGER DEFAULT 0,
  raw_artist TEXT, raw_title TEXT, track_key TEXT, analysis_version INTEGER DEFAULT 0,
  tags TEXT DEFAULT '[]', notes TEXT
);
CREATE UNIQUE INDEX idx_track_key ON tracks(track_key);
CREATE INDEX idx_tracks_analyzed ON tracks(analyzed);
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, uuid TEXT NOT NULL UNIQUE, cloud_session_id TEXT,
  dj_identity TEXT DEFAULT 'Default', name TEXT, started_at INTEGER NOT NULL, ended_at INTEGER
);
CREATE INDEX idx_sessions_active ON sessions(started_at DESC) WHERE ended_at IS NULL;
CREATE TABLE plays (
  id INTEGER PRIMARY KEY AUTOINCREMENT, session_id INTEGER NOT NULL, track_id INTEGER NOT NULL,
  played_at INTEGER NOT NULL, duration INTEGER, reaction TEXT DEFAULT 'neutral', notes TEXT,
  dancer_likes INTEGER DEFAULT 0,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);
CREATE INDEX idx_plays_track_played ON plays(track_id, played_at DESC);
CREATE TABLE saved_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE saved_set_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, set_id INTEGER NOT NULL, track_id INTEGER NOT NULL,
  position INTEGER NOT NULL,
  FOREIGN KEY (set_id) REFERENCES saved_sets(id) ON DELETE CASCADE,
  FOREIGN KEY (track_id) REFERENCES tracks(id)
);
CREATE TABLE offline_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT, payload TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE set_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT, slots TEXT NOT NULL,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
`;

const userTables = (bdb: Bdb): string[] =>
  (
    bdb
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__drizzle_migrations' ORDER BY name",
      )
      .all() as { name: string }[]
  ).map((r) => r.name);

const columnSet = (bdb: Bdb, table: string): string[] =>
  (bdb.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[])
    .map((r) => r.name)
    .sort();

const fkTargets = (bdb: Bdb, table: string): string[] =>
  (bdb.prepare(`PRAGMA foreign_key_list(${table})`).all() as { table: string }[])
    .map((r) => r.table)
    .sort();

const appliedTags = (bdb: Bdb): string[] =>
  (bdb.prepare("SELECT tag FROM __drizzle_migrations ORDER BY tag").all() as { tag: string }[]).map(
    (r) => r.tag,
  );

const indexExists = (bdb: Bdb, name: string): boolean =>
  bdb.prepare("SELECT 1 FROM sqlite_master WHERE type='index' AND name = ?").get(name) !==
  undefined;

describe("desktop migrator", () => {
  let bdb: Bdb;

  beforeEach(() => {
    bdb = new BetterSqlite3(":memory:");
  });
  afterEach(() => {
    bdb.close();
  });

  it("fresh install builds the full schema from the baseline", async () => {
    await runMigrations(asSqlite(bdb));

    expect(userTables(bdb)).toEqual([
      "offline_queue",
      "plays",
      "saved_set_tracks",
      "saved_sets",
      "sessions",
      "set_templates",
      "settings",
      "spotify_track_features",
      "tracks",
    ]);
    // Constraints + indexes the app relies on.
    expect(indexExists(bdb, "idx_track_key")).toBe(true);
    expect(indexExists(bdb, "idx_plays_track_played")).toBe(true);
    expect(fkTargets(bdb, "plays")).toEqual(["sessions", "tracks"]);
    expect(fkTargets(bdb, "saved_set_tracks")).toEqual(["saved_sets", "tracks"]);
    // Baseline + forward migrations recorded.
    expect(appliedTags(bdb)).toEqual([
      "0000_black_unicorn",
      "0001_mature_cobalt_man",
      "0002_slim_mordo",
      "0003_quiet_vindicator",
      "0004_parallel_steve_rogers",
      "0005_shocking_nico_minoru",
    ]);
  });

  it("baseline-adopts a pre-existing hand-rolled DB without recreating it or losing data", async () => {
    bdb.exec(LEGACY_DDL);
    bdb
      .prepare("INSERT INTO tracks (file_path, artist, title) VALUES (?, ?, ?)")
      .run("/music/x.mp3", "Legacy", "Track");

    await runMigrations(asSqlite(bdb));

    // 0000 is adopted (stamped, not re-run); the forward 0001 then applies its ALTERs.
    expect(appliedTags(bdb)).toEqual([
      "0000_black_unicorn",
      "0001_mature_cobalt_man",
      "0002_slim_mordo",
      "0003_quiet_vindicator",
      "0004_parallel_steve_rogers",
      "0005_shocking_nico_minoru",
    ]);
    const row = bdb.prepare("SELECT artist FROM tracks WHERE file_path = ?").get("/music/x.mp3") as
      | { artist: string }
      | undefined;
    expect(row?.artist).toBe("Legacy"); // data preserved
  });

  it("fresh and adopted DBs are functionally equivalent (same tables + columns + FKs)", async () => {
    const fresh = new BetterSqlite3(":memory:");
    await runMigrations(asSqlite(fresh));

    const legacy = new BetterSqlite3(":memory:");
    legacy.exec(LEGACY_DDL);
    await runMigrations(asSqlite(legacy));

    try {
      expect(userTables(legacy)).toEqual(userTables(fresh));
      for (const table of userTables(fresh)) {
        expect(columnSet(legacy, table)).toEqual(columnSet(fresh, table));
      }
      expect(fkTargets(legacy, "plays")).toEqual(fkTargets(fresh, "plays"));
      expect(fkTargets(legacy, "saved_set_tracks")).toEqual(fkTargets(fresh, "saved_set_tracks"));
    } finally {
      fresh.close();
      legacy.close();
    }
  });

  it("is idempotent — re-running applies nothing and keeps a single baseline row", async () => {
    await runMigrations(asSqlite(bdb));
    await runMigrations(asSqlite(bdb));
    expect(appliedTags(bdb)).toEqual([
      "0000_black_unicorn",
      "0001_mature_cobalt_man",
      "0002_slim_mordo",
      "0003_quiet_vindicator",
      "0004_parallel_steve_rogers",
      "0005_shocking_nico_minoru",
    ]);
  });
});

// The engine, driven with synthetic migrations — covers the forward-migration path (0001+)
// that the real (single-baseline) suite above can't reach yet but which runs the first time
// the schema changes.
describe("migrator engine (synthetic migrations)", () => {
  let bdb: Bdb;
  beforeEach(() => {
    bdb = new BetterSqlite3(":memory:");
  });
  afterEach(() => {
    bdb.close();
  });

  const baseline: Migration = {
    tag: "0000_base",
    sql: "CREATE TABLE `foo` (`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL, `a` text);--> statement-breakpoint\nCREATE INDEX `idx_foo_a` ON `foo` (`a`);",
  };
  const forward: Migration = { tag: "0001_add_b", sql: "ALTER TABLE `foo` ADD COLUMN `b` text;" };

  it("applies a forward migration (0001) in order on a fresh DB", async () => {
    await applyMigrations(asSqlite(bdb), [baseline, forward]);
    expect(columnSet(bdb, "foo")).toEqual(["a", "b", "id"]);
    expect(indexExists(bdb, "idx_foo_a")).toBe(true);
    expect(appliedTags(bdb)).toEqual(["0000_base", "0001_add_b"]);
  });

  it("applies only the pending migration when the DB is already at 0000", async () => {
    await applyMigrations(asSqlite(bdb), [baseline]);
    await applyMigrations(asSqlite(bdb), [baseline, forward]); // 0000 skipped, 0001 applied
    expect(columnSet(bdb, "foo")).toEqual(["a", "b", "id"]);
    expect(appliedTags(bdb)).toEqual(["0000_base", "0001_add_b"]);
  });

  it("re-applies safely after a crash-before-record (idempotent CREATE)", async () => {
    await applyMigrations(asSqlite(bdb), [baseline]);
    // Simulate a crash after the statements ran but before the tag was recorded.
    bdb.prepare("DELETE FROM __drizzle_migrations WHERE tag = ?").run("0000_base");
    // Must not throw — CREATE TABLE/INDEX re-run as IF NOT EXISTS.
    await applyMigrations(asSqlite(bdb), [baseline]);
    expect(appliedTags(bdb)).toEqual(["0000_base"]);
    expect(columnSet(bdb, "foo")).toEqual(["a", "id"]);
  });

  it("baseline-adopts a legacy DB AND then applies a forward migration to it", async () => {
    bdb.exec(LEGACY_DDL);
    const adoptBaseline: Migration = { tag: "0000_base", sql: "CREATE TABLE tracks (id integer);" };
    const alterTracks: Migration = {
      tag: "0001_extra",
      sql: "ALTER TABLE tracks ADD COLUMN extra text;",
    };

    await applyMigrations(asSqlite(bdb), [adoptBaseline, alterTracks]);

    expect(appliedTags(bdb)).toEqual(["0000_base", "0001_extra"]);
    expect(columnSet(bdb, "tracks")).toContain("extra"); // forward migration hit the adopted table
  });

  it("idempotent() makes CREATEs safe and leaves other statements untouched", () => {
    expect(idempotent("CREATE TABLE `x` (`id` integer)")).toBe(
      "CREATE TABLE IF NOT EXISTS `x` (`id` integer)",
    );
    expect(idempotent("CREATE UNIQUE INDEX `i` ON `x` (`a`)")).toBe(
      "CREATE UNIQUE INDEX IF NOT EXISTS `i` ON `x` (`a`)",
    );
    expect(idempotent("CREATE INDEX `i` ON `x` (`a`)")).toBe(
      "CREATE INDEX IF NOT EXISTS `i` ON `x` (`a`)",
    );
    expect(idempotent("ALTER TABLE `x` ADD COLUMN `b` text")).toBe(
      "ALTER TABLE `x` ADD COLUMN `b` text",
    );
  });
});
