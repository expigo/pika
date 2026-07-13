/**
 * Schema constraints (raw drizzle) + the real persist* module (tracks/likes/sessions/polls/tempo, C3 buffer-flush).
 * Moved verbatim from src/__tests__/db.integration.test.ts L217-426 @ 2d3f846
 * (2026-07 split; only the shared uniq() helper was deduped into ./harness).
 *
 * Gated by RUN_DB_TESTS via ./harness (plain `bun test` skips). Run ISOLATED:
 * `bun run test:integration` — never bare `RUN_DB_TESTS=1 bun test` (unit files
 * mock modules process-globally). Pool teardown lives in the bunfig preload.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getTrackKey } from "@pika/shared";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { closePollInDb, createPollInDb, recordPollVoteInDb } from "../../lib/persistence/polls";
import {
  endSessionInDb,
  ensureSessionPersisted,
  persistedSessions,
  persistSession,
} from "../../lib/persistence/sessions";
import {
  clearLastPersistedTrackKey,
  deletePersistedLike,
  flushPendingTracks,
  getPendingTrackCount,
  persistLike,
  persistTempoVotes,
  persistTrack,
  persistTracksBulk,
} from "../../lib/persistence/tracks";
import {
  baseClientId as clientId,
  ensureBaseSession,
  baseSessionId as sessionId,
  setupIntegrationEnv,
  suite,
} from "./harness";

suite("DB integration (real Postgres)", () => {
  beforeAll(async () => {
    setupIntegrationEnv();
    await ensureBaseSession();
  });

  // ==========================================================================
  // 1. Schema correctness (raw drizzle)
  // ==========================================================================

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

  // ==========================================================================
  // 2. Real persistence functions write real rows
  // ==========================================================================

  describe("persist* functions (real module)", () => {
    const extraSids: string[] = [];
    const freshSid = (): string => {
      const id = `pf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      extraSids.push(id);
      return id;
    };

    afterAll(async () => {
      for (const id of extraSids) {
        clearLastPersistedTrackKey(id);
        persistedSessions.delete(id);
        await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
      }
    });

    test("persistSession writes a session row", async () => {
      const sid = freshSid();
      const ok = await persistSession(sid, "PF DJ");
      expect(ok).toBe(true);
      const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sid));
      expect(rows.length).toBe(1);
      expect(rows[0]?.djName).toBe("PF DJ");
    });

    test("persistTrack writes a played_track and dedups an immediate repeat", async () => {
      const sid = freshSid();
      await persistSession(sid, "PF DJ");
      await persistTrack(sid, {
        artist: "Dedup",
        title: "Song",
        bpm: 96,
        energy: 50,
        albumArtUrl: "https://i.scdn.co/image/art",
        spotifyUrl: "https://open.spotify.com/track/abc",
      });
      await persistTrack(sid, { artist: "Dedup", title: "Song", bpm: 96 }); // same → skipped
      const rows = await db
        .select()
        .from(schema.playedTracks)
        .where(and(eq(schema.playedTracks.sessionId, sid), eq(schema.playedTracks.title, "Song")));
      expect(rows.length).toBe(1);
      expect(rows[0]?.bpm).toBe(96);
      expect(rows[0]?.energy).toBe(50);
      // Slice 4: the Spotify identity snapshot is persisted (not dropped) → recap + my-likes surfaces.
      expect(rows[0]?.albumArtUrl).toBe("https://i.scdn.co/image/art");
      expect(rows[0]?.spotifyUrl).toBe("https://open.spotify.com/track/abc");
      // The play carries the normalized match_key → joins to track_links for the catalog Pika consensus.
      expect(rows[0]?.matchKey).toBe(getTrackKey("Dedup", "Song"));
    });

    test("persistTracksBulk writes every row", async () => {
      const sid = freshSid();
      await persistSession(sid, "PF DJ");
      await persistTracksBulk(sid, [
        { artist: "A", title: "B1" },
        { artist: "A", title: "B2" },
        { artist: "A", title: "B3" },
      ]);
      const rows = await db
        .select()
        .from(schema.playedTracks)
        .where(eq(schema.playedTracks.sessionId, sid));
      expect(rows.length).toBe(3);
    });

    test("persistLike writes one like and is idempotent; deletePersistedLike removes it", async () => {
      const sid = freshSid();
      await persistSession(sid, "PF DJ");
      const track = { artist: "Like", title: "Me" };
      await persistTrack(sid, track);

      await persistLike(track, sid, "client-1");
      await persistLike(track, sid, "client-1"); // duplicate — onConflictDoNothing
      let rows = await db.select().from(schema.likes).where(eq(schema.likes.sessionId, sid));
      expect(rows.length).toBe(1);

      await deletePersistedLike(track, sid, "client-1");
      rows = await db.select().from(schema.likes).where(eq(schema.likes.sessionId, sid));
      expect(rows.length).toBe(0);
    });

    test("persistTempoVotes writes a tempo_votes snapshot", async () => {
      const sid = freshSid();
      await persistSession(sid, "PF DJ");
      await persistTempoVotes(
        sid,
        { artist: "Tempo", title: "Track" },
        { slower: 1, perfect: 2, faster: 0 },
      );
      const rows = await db
        .select()
        .from(schema.tempoVotes)
        .where(eq(schema.tempoVotes.sessionId, sid));
      expect(rows.length).toBe(1);
      expect(rows[0]?.perfectCount).toBe(2);
    });

    test("poll lifecycle: create, vote (one-per-client), close", async () => {
      const sid = freshSid();
      await persistSession(sid, "PF DJ");
      const pollId = await createPollInDb(sid, "Genre?", ["Blues", "Pop"]);
      expect(pollId).toBeGreaterThan(0);
      if (pollId === null) throw new Error("createPollInDb returned null");

      await recordPollVoteInDb(pollId, "voter-1", 0);
      await recordPollVoteInDb(pollId, "voter-1", 1); // same client — unique() ignores
      const votes = await db
        .select()
        .from(schema.pollVotes)
        .where(eq(schema.pollVotes.pollId, pollId));
      expect(votes.length).toBe(1);

      await closePollInDb(pollId);
      const [poll] = await db.select().from(schema.polls).where(eq(schema.polls.id, pollId));
      expect(poll?.status).toBe("closed");
    });

    test("ensureSessionPersisted re-finds via DB; endSessionInDb sets endedAt", async () => {
      const sid = freshSid();
      await persistSession(sid, "PF DJ");
      persistedSessions.delete(sid); // force the DB-existence check path
      expect(await ensureSessionPersisted(sid)).toBe(true);

      await endSessionInDb(sid);
      const [s] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sid));
      expect(s?.endedAt).not.toBeNull();
    });

    test("C3: a play buffered before the session row exists flushes to exactly one row", async () => {
      const sid = freshSid();
      const track = { artist: "Race", title: "Condition" };

      // Session not persisted yet → persistTrack waits, times out, then buffers (no DB row).
      await persistTrack(sid, track);
      expect(getPendingTrackCount(sid)).toBe(1);
      let rows = await db
        .select()
        .from(schema.playedTracks)
        .where(eq(schema.playedTracks.sessionId, sid));
      expect(rows.length).toBe(0);

      // Session lands → flush drains the buffer to exactly one row.
      await persistSession(sid, "PF DJ");
      await flushPendingTracks(sid);
      rows = await db
        .select()
        .from(schema.playedTracks)
        .where(eq(schema.playedTracks.sessionId, sid));
      expect(rows.length).toBe(1);
    }, 15000); // allow for the waitForSession buffer timeout
  });
});
