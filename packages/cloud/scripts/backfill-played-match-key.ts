/**
 * Backfill `played_tracks.match_key` for rows that predate the column. The key is `getTrackKey`
 * (normalized exact key) — pure JS, so it can't be computed in SQL; we read, compute, and UPDATE.
 * Idempotent: only touches rows where match_key IS NULL. New plays get the key at persist time.
 *
 * Usage: bun run scripts/backfill-played-match-key.ts
 *
 * @file packages/cloud/scripts/backfill-played-match-key.ts
 */

import { getTrackKey } from "@pika/shared";
import { eq, isNull } from "drizzle-orm";
import { db } from "../src/db";
import { playedTracks } from "../src/db/schema";

async function main() {
  const rows = await db
    .select({ id: playedTracks.id, artist: playedTracks.artist, title: playedTracks.title })
    .from(playedTracks)
    .where(isNull(playedTracks.matchKey));

  console.log(`Backfilling match_key for ${rows.length} plays…`);
  let n = 0;
  for (const r of rows) {
    await db
      .update(playedTracks)
      .set({ matchKey: getTrackKey(r.artist, r.title) })
      .where(eq(playedTracks.id, r.id));
    n++;
  }
  console.log(`✅ Updated ${n} rows.`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Backfill failed", e);
    process.exit(1);
  });
