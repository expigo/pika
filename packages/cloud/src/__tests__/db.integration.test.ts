/**
 * DB integration test — runs against a REAL Postgres (not the mocked unit suite).
 *
 * Gated behind RUN_DB_TESTS so the normal `bun test` (unit, mocked) does NOT
 * require a database. Two halves:
 *   1. schema correctness — the migration baseline + constraints the audit found broken;
 *   2. the real persistence functions (persistTrack/persistLike/… and the C3
 *      buffer-and-flush) — whose DB-write paths the unit suite can't reach because they
 *      short-circuit on NODE_ENV==="test". We flip NODE_ENV here (inside the gated suite
 *      only) so the actual inserts run and are asserted against real rows.
 *
 * Locally:  bun run db:migrate && RUN_DB_TESTS=1 bun test src/__tests__/db.integration.test.ts
 * CI:       a Postgres service + db:migrate, then RUN_DB_TESTS=1.
 *
 * ⚠️ Run this file IN ISOLATION (which `bun run test:integration` does). Do NOT enable the
 * gate across the whole suite (`RUN_DB_TESTS=1 bun test`): other unit files mock the DB
 * module process-globally (test/auth_security.test.ts → mock.module("../src/db")), and bun
 * does not scope or restore mock.module between files — so these real-DB queries would hit
 * that leaked mock and fail. The unit suite and this integration file are separate CI jobs.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, desc, eq } from "drizzle-orm";
import { client, db, schema } from "../db";
import { hashToken } from "../lib/auth";
import { closePollInDb, createPollInDb, recordPollVoteInDb } from "../lib/persistence/polls";
import {
  getAllActivePushTargets,
  getEventPushTargets,
  getStagePushTargets,
} from "../lib/persistence/push-targets";
import {
  endSessionInDb,
  ensureSessionPersisted,
  persistedSessions,
  persistSession,
} from "../lib/persistence/sessions";
import {
  clearLastPersistedTrackKey,
  deletePersistedLike,
  flushPendingTracks,
  getPendingTrackCount,
  persistLike,
  persistTempoVotes,
  persistTrack,
  persistTracksBulk,
} from "../lib/persistence/tracks";
import { auth as authRoute } from "../routes/auth";
import { dj as djRoute } from "../routes/dj";
import { push as pushRoute } from "../routes/push";
import { sessions as sessionsRoute } from "../routes/sessions";
import { stageRoutes } from "../routes/stages";
import { stats as statsRoute } from "../routes/stats";

const RUN = !!process.env.RUN_DB_TESTS;
const suite = RUN ? describe : describe.skip;

suite("DB integration (real Postgres)", () => {
  const sessionId = `itest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const clientId = "itest-client";
  let originalNodeEnv: string | undefined;

  beforeAll(async () => {
    // Exercise the real persist* DB paths instead of their NODE_ENV==="test" mocks.
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    await db.insert(schema.sessions).values({ id: sessionId, djName: "ITest DJ" });
  });

  afterAll(async () => {
    // CASCADE clears any remaining played_tracks/likes for this session.
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
    await client.end({ timeout: 5 });
    process.env.NODE_ENV = originalNodeEnv;
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
      await persistTrack(sid, { artist: "Dedup", title: "Song", bpm: 96, energy: 50 });
      await persistTrack(sid, { artist: "Dedup", title: "Song", bpm: 96 }); // same → skipped
      const rows = await db
        .select()
        .from(schema.playedTracks)
        .where(and(eq(schema.playedTracks.sessionId, sid), eq(schema.playedTracks.title, "Song")));
      expect(rows.length).toBe(1);
      expect(rows[0]?.bpm).toBe(96);
      expect(rows[0]?.energy).toBe(50);
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

  // ==========================================================================
  // 3. REST routes against real Postgres (covers the shipped route code that the
  //    unit suite can only test via mocks/in-memory paths).
  // ==========================================================================

  describe("REST routes (real Postgres)", () => {
    const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    let xff = 0;
    const authHeaders = (extra: Record<string, string> = {}) => ({
      "Content-Type": "application/json",
      "X-Forwarded-For": `itest-ip-${xff++}`, // unique → own authLimiter bucket
      ...extra,
    });
    const register = (email: string, displayName: string, password = "validpassword123") =>
      authRoute.request("/register", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email, password, displayName }),
      });

    // --- auth -----------------------------------------------------------------

    test("auth: register issues a pk_dj_ token; duplicate email → 409", async () => {
      const email = `reg_${uniq()}@itest.dev`;
      const res = await register(email, `Reg ${uniq()}`);
      expect(res.status).toBe(201);
      const body = (await res.json()) as { token?: string };
      expect(typeof body.token).toBe("string");
      expect(body.token?.startsWith("pk_dj_")).toBe(true);

      const dup = await register(email, `Reg ${uniq()}`);
      expect(dup.status).toBe(409);

      await db.delete(schema.djUsers).where(eq(schema.djUsers.email, email.toLowerCase()));
    });

    test("auth: login succeeds for valid creds; unknown email → 401 (timing path, no throw)", async () => {
      const email = `login_${uniq()}@itest.dev`;
      await register(email, `Login ${uniq()}`);

      const ok = await authRoute.request("/login", {
        method: "POST",
        headers: authHeaders({ "X-Requested-With": "Pika" }),
        body: JSON.stringify({ email, password: "validpassword123" }),
      });
      expect(ok.status).toBe(200);
      expect(typeof ((await ok.json()) as { token?: string }).token).toBe("string");

      const bad = await authRoute.request("/login", {
        method: "POST",
        headers: authHeaders({ "X-Requested-With": "Pika" }),
        body: JSON.stringify({ email: `nobody_${uniq()}@itest.dev`, password: "validpassword123" }),
      });
      expect(bad.status).toBe(401);

      await db.delete(schema.djUsers).where(eq(schema.djUsers.email, email.toLowerCase()));
    });

    test("auth: login caps stored tokens at the 10 newest per user", async () => {
      const email = `cap_${uniq()}@itest.dev`;
      expect((await register(email, `Cap ${uniq()}`)).status).toBe(201);
      const [user] = await db
        .select({ id: schema.djUsers.id })
        .from(schema.djUsers)
        .where(eq(schema.djUsers.email, email.toLowerCase()));
      const userId = user?.id;
      if (userId === undefined) throw new Error("user not created");

      // Insert 11 extra tokens (→ 12 with the register token), oldest-first by createdAt.
      const base = Date.now();
      const inserted: string[] = [];
      for (let i = 0; i < 11; i++) {
        const tok = `cap_tok_${i}_${uniq()}`;
        inserted.push(tok);
        await db.insert(schema.djTokens).values({
          djUserId: userId,
          token: tok,
          name: "x",
          createdAt: new Date(base - (20 - i) * 1000),
        });
      }
      const before = await db
        .select()
        .from(schema.djTokens)
        .where(eq(schema.djTokens.djUserId, userId));
      expect(before.length).toBe(12);

      // One login mints a 13th token then prunes to the 10 newest.
      const res = await authRoute.request("/login", {
        method: "POST",
        headers: authHeaders({ "X-Requested-With": "Pika" }),
        body: JSON.stringify({ email, password: "validpassword123" }),
      });
      expect(res.status).toBe(200);

      const after = await db
        .select()
        .from(schema.djTokens)
        .where(eq(schema.djTokens.djUserId, userId))
        .orderBy(desc(schema.djTokens.createdAt));
      const tokens = after.map((t) => t.token);
      expect(after.length).toBe(10);
      expect(tokens).not.toContain(inserted[0]); // 3 oldest evicted
      expect(tokens).not.toContain(inserted[1]);
      expect(tokens).toContain(inserted[10]); // newest extra kept

      await db.delete(schema.djUsers).where(eq(schema.djUsers.id, userId));
    });

    // --- push (fix #4: hashed-token auth) -------------------------------------

    test("push: /send authenticates a hashed token and 401s a bogus one", async () => {
      const [u] = await db
        .insert(schema.djUsers)
        .values({
          email: `push_${uniq()}@itest.dev`,
          passwordHash: "x",
          displayName: "Push DJ",
          slug: `push-${uniq()}`,
        })
        .returning({ id: schema.djUsers.id });
      const userId = u?.id;
      if (userId === undefined) throw new Error("push user not created");
      const rawToken = `pk_dj_${uniq()}`;
      await db
        .insert(schema.djTokens)
        .values({ djUserId: userId, token: await hashToken(rawToken), name: "x" });

      const ok = await pushRoute.request("/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${rawToken}` },
        body: JSON.stringify({ payload: "hi", filter: "debug" }),
      });
      expect(ok.status).toBe(200);
      expect(((await ok.json()) as { success?: boolean }).success).toBe(true);

      const bad = await pushRoute.request("/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer not-a-real-token" },
        body: JSON.stringify({ payload: "hi", filter: "debug" }),
      });
      expect(bad.status).toBe(401);

      await db.delete(schema.djUsers).where(eq(schema.djUsers.id, userId));
    });

    // --- sessions: recap + history (validates the Promise.all buildRecap) ------

    test("sessions: recap parallel-aggregates tracks, likes and tempo; history returns rows", async () => {
      const sid = `recap_${uniq()}`;
      await db.insert(schema.sessions).values({ id: sid, djName: "Recap DJ", endedAt: new Date() });
      const [t1] = await db
        .insert(schema.playedTracks)
        .values({ sessionId: sid, artist: "A", title: "One" })
        .returning({ id: schema.playedTracks.id });
      await db.insert(schema.playedTracks).values({ sessionId: sid, artist: "A", title: "Two" });
      const trackId = t1?.id;
      if (trackId === undefined) throw new Error("track not created");
      await db
        .insert(schema.likes)
        .values({ sessionId: sid, clientId: "c1", playedTrackId: trackId });
      await db
        .insert(schema.likes)
        .values({ sessionId: sid, clientId: "c2", playedTrackId: trackId });
      await db.insert(schema.tempoVotes).values({
        sessionId: sid,
        trackArtist: "A",
        trackTitle: "One",
        slowerCount: 1,
        perfectCount: 2,
        fasterCount: 0,
      });

      const res = await sessionsRoute.request(`/${sid}/recap`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        trackCount: number;
        totalLikes: number;
        tracks: Array<{ title: string; likes: number; tempo: unknown }>;
      };
      expect(body.trackCount).toBe(2);
      expect(body.totalLikes).toBe(2);
      const one = body.tracks.find((t) => t.title === "One");
      expect(one?.likes).toBe(2);
      expect(one?.tempo).toEqual({ slower: 1, perfect: 2, faster: 0 });

      const hist = await sessionsRoute.request(`/${sid}/history`);
      expect(hist.status).toBe(200);
      expect(((await hist.json()) as unknown[]).length).toBe(2);

      await db.delete(schema.sessions).where(eq(schema.sessions.id, sid));
    });

    // --- stats: corrected /global contract (no fictional topDJs) --------------

    test("stats: /global returns numeric totals and no topDJs field", async () => {
      const res = await statsRoute.request("/global");
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        totalSessions: number;
        totalTracks: number;
        totalLikes: number;
        topDJs?: unknown;
      };
      expect(typeof body.totalSessions).toBe("number");
      expect(typeof body.totalTracks).toBe("number");
      expect(typeof body.totalLikes).toBe("number");
      expect(body.topDJs).toBeUndefined();
    });

    // --- dj: bounded + cached profile -----------------------------------------

    test("dj: profile returns the DJ's sessions with track counts", async () => {
      const slug = `dj-${uniq()}`;
      const [u] = await db
        .insert(schema.djUsers)
        .values({
          email: `dj_${uniq()}@itest.dev`,
          passwordHash: "x",
          displayName: "Prof DJ",
          slug,
        })
        .returning({ id: schema.djUsers.id });
      const userId = u?.id;
      if (userId === undefined) throw new Error("dj user not created");
      const sid = `djprof_${uniq()}`;
      await db
        .insert(schema.sessions)
        .values({ id: sid, djName: "Prof DJ", djUserId: userId, endedAt: new Date() });
      await db.insert(schema.playedTracks).values([
        { sessionId: sid, artist: "A", title: "x1" },
        { sessionId: sid, artist: "A", title: "x2" },
      ]);

      const res = await djRoute.request(`/${slug}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        djName: string;
        totalTracks: number;
        sessions: Array<{ trackCount: number }>;
      };
      expect(body.djName).toBe("Prof DJ");
      expect(body.totalTracks).toBe(2);
      expect(body.sessions[0]?.trackCount).toBe(2);

      await db.delete(schema.sessions).where(eq(schema.sessions.id, sid));
      await db.delete(schema.djUsers).where(eq(schema.djUsers.id, userId));
    });
  });

  // ==========================================================================
  // 4. Stages / Events + SCOPED push (the "Global Megaphone" fix)
  // ==========================================================================

  describe("stages / events + scoped push (real Postgres)", () => {
    const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    let xff = 1000;
    const createdEventIds: string[] = [];
    const createdEndpoints: string[] = [];
    const djEmails: string[] = [];

    afterAll(async () => {
      for (const id of createdEventIds) {
        // CASCADE clears the event's stages + stage_subscriptions.
        await db.delete(schema.events).where(eq(schema.events.id, id));
      }
      for (const ep of createdEndpoints) {
        await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, ep));
      }
      for (const email of djEmails) {
        await db.delete(schema.djUsers).where(eq(schema.djUsers.email, email.toLowerCase()));
      }
    });

    async function newDjToken(): Promise<string> {
      const email = `stage_${uniq()}@itest.dev`;
      djEmails.push(email);
      const res = await authRoute.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-For": `itest-stage-${xff++}` },
        body: JSON.stringify({ email, password: "validpassword123", displayName: `SDJ ${uniq()}` }),
      });
      return ((await res.json()) as { token: string }).token;
    }

    test("route: create event + stage (auth'd), then public reads resolve them", async () => {
      const token = await newDjToken();
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

      const evRes = await stageRoutes.request("/events", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "WCS Test 2026" }),
      });
      expect(evRes.status).toBe(201);
      const ev = (await evRes.json()) as { id: string; ownerUserId: number };
      createdEventIds.push(ev.id);
      expect(ev.ownerUserId).toBeGreaterThan(0); // owner derived from token, not the body

      const stRes = await stageRoutes.request("/stages", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Main Floor", eventId: ev.id }),
      });
      expect(stRes.status).toBe(201);
      const st = (await stRes.json()) as { id: string };

      const getRes = await stageRoutes.request(`/stages/${st.id}`);
      expect(getRes.status).toBe(200);

      const listRes = await stageRoutes.request(`/events/${ev.id}/stages`);
      const list = (await listRes.json()) as { stages: Array<{ id: string }> };
      expect(list.stages.some((s) => s.id === st.id)).toBe(true);
    });

    test("route: stage under an unknown parent event → 400", async () => {
      const token = await newDjToken();
      const bad = await stageRoutes.request("/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: "Orphan", eventId: `nope_${uniq()}` }),
      });
      expect(bad.status).toBe(400);
    });

    test("FK set null: deleting a stage nulls sessions.stage_id but keeps the session", async () => {
      const evId = `ev_${uniq()}`;
      const stId = `st_${uniq()}`;
      const sid = `sess_${uniq()}`;
      await db.insert(schema.events).values({ id: evId, name: "E" });
      createdEventIds.push(evId);
      await db.insert(schema.stages).values({ id: stId, name: "S", eventId: evId });
      await db.insert(schema.sessions).values({ id: sid, djName: "D", stageId: stId });

      await db.delete(schema.stages).where(eq(schema.stages.id, stId));

      const [sess] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sid));
      expect(sess).toBeDefined();
      expect(sess?.stageId).toBeNull();
      await db.delete(schema.sessions).where(eq(schema.sessions.id, sid));
    });

    test("FK cascade: deleting an event removes its stages and stage_subscriptions", async () => {
      const evId = `evc_${uniq()}`;
      const stId = `stc_${uniq()}`;
      await db.insert(schema.events).values({ id: evId, name: "E" });
      await db.insert(schema.stages).values({ id: stId, name: "S", eventId: evId });
      await db.insert(schema.stageSubscriptions).values({ stageId: stId, clientId: "casc-client" });

      await db.delete(schema.events).where(eq(schema.events.id, evId));

      const remStages = await db.select().from(schema.stages).where(eq(schema.stages.id, stId));
      const remSubs = await db
        .select()
        .from(schema.stageSubscriptions)
        .where(eq(schema.stageSubscriptions.stageId, stId));
      expect(remStages.length).toBe(0);
      expect(remSubs.length).toBe(0);
    });

    test("SCOPED push isolates by stage/event; global still reaches everyone", async () => {
      const evId = `evp_${uniq()}`;
      const s1 = `s1_${uniq()}`;
      const s2 = `s2_${uniq()}`;
      const cA = `cA_${uniq()}`;
      const cB = `cB_${uniq()}`;
      const cC = `cC_${uniq()}`;
      const epA = `https://push.test/${cA}`;
      const epB = `https://push.test/${cB}`;
      const epC = `https://push.test/${cC}`;

      await db.insert(schema.events).values({ id: evId, name: "Push Event" });
      createdEventIds.push(evId);
      await db.insert(schema.stages).values([
        { id: s1, name: "S1", eventId: evId },
        { id: s2, name: "S2", eventId: evId },
      ]);
      // A is at stage 1, B at stage 2, C is subscribed to NO stage.
      await db.insert(schema.stageSubscriptions).values([
        { stageId: s1, clientId: cA },
        { stageId: s2, clientId: cB },
      ]);
      await db.insert(schema.pushSubscriptions).values([
        { endpoint: epA, p256dh: "p", auth: "a", clientId: cA },
        { endpoint: epB, p256dh: "p", auth: "a", clientId: cB },
        { endpoint: epC, p256dh: "p", auth: "a", clientId: cC },
      ]);
      createdEndpoints.push(epA, epB, epC);

      // Stage scope → only that stage's client.
      const stage1 = await getStagePushTargets(s1);
      expect(stage1.map((t) => t.endpoint)).toEqual([epA]);

      // Event scope → every stage under the event (A + B), but not the stage-less C.
      const eventTargets = await getEventPushTargets(evId);
      expect(eventTargets.map((t) => t.endpoint).sort()).toEqual([epA, epB].sort());

      // Global → reaches everyone incl. the stage-less C (the legacy fallback).
      const allEps = new Set((await getAllActivePushTargets()).map((t) => t.endpoint));
      expect(allEps.has(epA) && allEps.has(epB) && allEps.has(epC)).toBe(true);
    });
  });
});
