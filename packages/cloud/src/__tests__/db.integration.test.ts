/**
 * DB integration test — runs against a REAL Postgres (not the mocked unit suite).
 *
 * Gated behind RUN_DB_TESTS so the normal `bun test` (unit, mocked) does NOT
 * require a database. It exercises the actual migration baseline + constraints,
 * i.e. exactly the schema correctness that the audit found broken in prod.
 *
 * Locally:  bun run db:migrate && RUN_DB_TESTS=1 bun test src/__tests__/db.integration.test.ts
 * CI:       a Postgres service + db:migrate, then RUN_DB_TESTS=1.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { client, db, schema } from "../db";

const RUN = !!process.env.RUN_DB_TESTS;
const suite = RUN ? describe : describe.skip;

suite("DB integration (real Postgres)", () => {
  const sessionId = `itest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const clientId = "itest-client";

  beforeAll(async () => {
    await db.insert(schema.sessions).values({ id: sessionId, djName: "ITest DJ" });
  });

  afterAll(async () => {
    // CASCADE clears any remaining played_tracks/likes for this session.
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
    await client.end({ timeout: 5 });
  });

  test("C1: unique_like_idempotency makes a duplicate (session,client,track) like a no-op", async () => {
    const [track] = await db
      .insert(schema.playedTracks)
      .values({ sessionId, artist: "A", title: "T", bpm: 96 })
      .returning({ id: schema.playedTracks.id });
    expect(track?.id).toBeGreaterThan(0);

    const likeVals = { sessionId, clientId, playedTrackId: track!.id };
    await db.insert(schema.likes).values(likeVals).onConflictDoNothing();
    await db.insert(schema.likes).values(likeVals).onConflictDoNothing(); // duplicate — must be swallowed

    const rows = await db
      .select()
      .from(schema.likes)
      .where(and(eq(schema.likes.sessionId, sessionId), eq(schema.likes.playedTrackId, track!.id)));
    expect(rows.length).toBe(1);
  });

  test("chk_bpm_range: the DB rejects an out-of-range bpm", async () => {
    let threw = false;
    try {
      await db
        .insert(schema.playedTracks)
        .values({ sessionId, artist: "A", title: "Bad BPM", bpm: 500 });
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
  });

  test("FK cascade: deleting a session removes its played_tracks + likes", async () => {
    const sid = `itest_casc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(schema.sessions).values({ id: sid, djName: "Casc" });
    const [t] = await db
      .insert(schema.playedTracks)
      .values({ sessionId: sid, artist: "X", title: "Y" })
      .returning({ id: schema.playedTracks.id });
    await db.insert(schema.likes).values({ sessionId: sid, clientId: "c", playedTrackId: t!.id });

    await db.delete(schema.sessions).where(eq(schema.sessions.id, sid));

    const tracks = await db
      .select()
      .from(schema.playedTracks)
      .where(eq(schema.playedTracks.sessionId, sid));
    const likes = await db.select().from(schema.likes).where(eq(schema.likes.sessionId, sid));
    expect(tracks.length).toBe(0);
    expect(likes.length).toBe(0);
  });
});
