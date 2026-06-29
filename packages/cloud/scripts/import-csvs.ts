/**
 * Bulk-import Exportify CSVs into the catalog (B3 seed) — the scripted equivalent of the admin
 * /admin/seed "Import CSV" flow, for seeding many playlists at once during local validation.
 * Runs the REAL `seedFromPlaylist` (curated_tracks + track_links + spotify_track_features) against
 * the configured DATABASE_URL. Idempotent (upserts), safe to re-run.
 *
 * Usage:
 *   bun run scripts/import-csvs.ts [dir]      # default dir below
 *
 * Attribution: contest packs (`DJ_K+ *`) → one curator, event/set lists → another, so the seeded
 * data has cross-DJ overlap to inspect. Edit the two emails for your local users.
 *
 * @file packages/cloud/scripts/import-csvs.ts
 */

import { readdirSync, readFileSync } from "node:fs";
import { parseExportifyCsv } from "@pika/shared";
import { eq } from "drizzle-orm";
import { db } from "../src/db";
import { user } from "../src/db/schema";
import { seedFromPlaylist } from "../src/lib/services/spotifyMatch";

const DIR = process.argv[2] ?? "/Users/kryspin/Downloads/playlists";
const CONTEST_DJ_EMAIL = "pika@pika.com"; // DJ Pikachu — owns the "DJ K+" contest packs
const EVENT_DJ_EMAIL = "d2_1782458941673@test.com"; // DJ Two — owns the event/set lists

async function djId(email: string): Promise<string> {
  const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, email));
  if (!u) throw new Error(`No user for "${email}" — register that DJ first.`);
  return u.id;
}

async function main() {
  const contestDj = await djId(CONTEST_DJ_EMAIL);
  const eventDj = await djId(EVENT_DJ_EMAIL);

  const files = readdirSync(DIR)
    .filter((f) => f.endsWith(".csv"))
    .sort();

  let grand = 0;
  let totalLocal = 0;
  for (const f of files) {
    const isContest = f.startsWith("DJ_K+");
    const dj = isContest ? contestDj : eventDj;
    const { tracks, skippedLocal } = parseExportifyCsv(readFileSync(`${DIR}/${f}`, "utf8"));
    const name = f.replace(/\.csv$/i, "");
    const seeded = await seedFromPlaylist(dj, name, tracks);
    grand += seeded;
    totalLocal += skippedLocal;
    console.log(
      `${isContest ? "🏆" : "🎶"} ${name.padEnd(42)} → ${String(seeded).padStart(4)} seeded  ` +
        `(${skippedLocal} local skipped)  [${isContest ? "DJ K+" : "DJ Two"}]`,
    );
  }
  console.log(
    `\n✅ Seeded ${grand} curated rows across ${files.length} playlists (${totalLocal} local skipped).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Import failed", e);
    process.exit(1);
  });
