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
import { getTrackKey } from "@pika/shared";
import type { ServerWebSocket } from "bun";
import { and, desc, eq, inArray } from "drizzle-orm";
import { client, db, schema } from "../db";
import { handleSubscribeStage } from "../handlers/subscriber";
import type { WSContext } from "../handlers/ws-context";
import { auth } from "../lib/auth/server";
import { decryptSecret, encryptSecret } from "../lib/crypto";
import { createLiveSession } from "../lib/live-session";
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
import { signUnsubToken } from "../lib/services/email-prefs";
import {
  adoptOrUpsertAccountPlaylistRow,
  defaultJournalExportDeps,
  exportJournalPlaylist,
  getAccountPlaylistRow,
  JournalExportCooldownError,
  loadAccountLikedRows,
  resetJournalExportGuardsForTests,
} from "../lib/services/journal";
import { closeZombieSessions, type RecapSweepDeps, sweepRecaps } from "../lib/services/recap";
import {
  fetchNowPlaying,
  getConnectionStatus,
  SpotifyAuthError,
  SpotifyPlaylistNotFoundError,
} from "../lib/services/spotify";
import { getSpotifyFeatures, seedFromPlaylist } from "../lib/services/spotifyMatch";
import { getStageTopic } from "../lib/topics";
import { adminRoutes as adminRoute } from "../routes/admin";
import { client as clientRoutes } from "../routes/client";
import { dj as djRoute } from "../routes/dj";
import { djLiveRoutes } from "../routes/dj-live";
import { emailRoutes } from "../routes/email";
import { meRoutes } from "../routes/me";
import { playlistRoutes } from "../routes/playlist";
import { push as pushRoute } from "../routes/push";
import { sessions as sessionsRoute } from "../routes/sessions";
import { stageRoutes } from "../routes/stages";
import { stats as statsRoute } from "../routes/stats";
import { telemetryRoutes } from "../routes/telemetry";

const RUN = !!process.env.RUN_DB_TESTS;
const suite = RUN ? describe : describe.skip;

/**
 * Create a DJ via Better Auth (real signup → `user` row + a `session`) and return a
 * bearer token usable as `Authorization: Bearer <token>` (the desktop/WS flow). Optionally
 * flips `status`/`role` directly in the DB to mimic admin approval / role assignment.
 */
async function signUpDj(
  opts: { approved?: boolean; admin?: boolean; email?: string; name?: string } = {},
): Promise<{ userId: string; token: string; email: string }> {
  const rnd = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const email = opts.email ?? `dj_${rnd}@itest.dev`;
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, password: "validpassword123", name: opts.name ?? `ITest DJ ${rnd}` },
    returnHeaders: true,
  });
  const token = headers.get("set-auth-token") ?? "";
  const userId = response.user.id;
  const patch: { status?: string; role?: string } = {};
  if (opts.approved) patch.status = "approved";
  if (opts.admin) patch.role = "admin";
  if (Object.keys(patch).length > 0) {
    await db.update(schema.user).set(patch).where(eq(schema.user.id, userId));
  }
  return { userId, token, email };
}

/**
 * Sign a magic-link token for `email` through the REAL flow (Slice B): request the link (the
 * keyless mail fallback logs it; the token also lands in the `verification` table), read the
 * newest token for that email from `verification`, then verify — which mints the user (on first
 * sign-in), fires the dancer-role hook, and returns a bearer token via the `bearer` plugin.
 */
async function magicLinkSignIn(
  email: string,
): Promise<{ userId: string; token: string; email: string }> {
  await auth.api.signInMagicLink({ body: { email }, headers: new Headers() });
  const rows = await db
    .select({ identifier: schema.verification.identifier, value: schema.verification.value })
    .from(schema.verification)
    .orderBy(desc(schema.verification.createdAt))
    .limit(10);
  const row = rows.find((r) => r.value.includes(email));
  if (!row) throw new Error(`no magic-link verification row found for ${email}`);
  const { headers, response } = await auth.api.magicLinkVerify({
    query: { token: row.identifier },
    headers: new Headers(),
    returnHeaders: true,
  });
  const token = headers.get("set-auth-token") ?? "";
  const userId = (response as { user?: { id: string } }).user?.id ?? "";
  if (userId) return { userId, token, email };
  const [u] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);
  if (!u) throw new Error(`magic-link verify did not create a user for ${email}`);
  return { userId: u.id, token, email };
}

async function signUpDancer(): Promise<{ userId: string; token: string; email: string }> {
  const rnd = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  return magicLinkSignIn(`dancer_${rnd}@itest.dev`);
}

/**
 * Sign in via the email-OTP path (Slice B.5 — the PWA-jar mechanism): request the code (keyless
 * fallback logs it; it also lands in `verification` as `sign-in-otp-<email>` → `<otp>:<attempts>`),
 * read it from the table, then verify — same dancer-role hook as magic link.
 */
async function otpSignIn(email: string): Promise<{ userId: string; token: string }> {
  await auth.api.sendVerificationOTP({ body: { email, type: "sign-in" }, headers: new Headers() });
  const [row] = await db
    .select({ value: schema.verification.value })
    .from(schema.verification)
    .where(eq(schema.verification.identifier, `sign-in-otp-${email}`))
    .orderBy(desc(schema.verification.createdAt))
    .limit(1);
  const otp = row?.value.split(":")[0] ?? "";
  if (!otp) throw new Error(`no sign-in OTP row found for ${email}`);
  const { headers, response } = await auth.api.signInEmailOTP({
    body: { email, otp },
    headers: new Headers(),
    returnHeaders: true,
  });
  const token = headers.get("set-auth-token") ?? "";
  const userId = (response as { user?: { id: string } }).user?.id ?? "";
  if (userId) return { userId, token };
  const [u] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, email))
    .limit(1);
  if (!u) throw new Error(`OTP sign-in did not create a user for ${email}`);
  return { userId: u.id, token };
}

suite("DB integration (real Postgres)", () => {
  const sessionId = `itest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const clientId = "itest-client";
  let originalNodeEnv: string | undefined;
  let originalResendKey: string | undefined;

  beforeAll(async () => {
    // Exercise the real persist* DB paths instead of their NODE_ENV==="test" mocks.
    originalNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    // The suite must stay email-free even when the local .env carries a real RESEND_API_KEY
    // (bun auto-loads it): force the keyless dev fallback, which logs links instead of sending.
    originalResendKey = process.env["RESEND_API_KEY"];
    delete process.env["RESEND_API_KEY"];
    // Unsubscribe tokens (Slice C) HMAC with this; CI sets it, a bare local env may not.
    process.env["BETTER_AUTH_SECRET"] ??= "itest-better-auth-secret";
    await db.insert(schema.sessions).values({ id: sessionId, djName: "ITest DJ" });
  });

  afterAll(async () => {
    // CASCADE clears any remaining played_tracks/likes for this session.
    await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
    await client.end({ timeout: 5 });
    process.env.NODE_ENV = originalNodeEnv;
    if (originalResendKey !== undefined) process.env["RESEND_API_KEY"] = originalResendKey;
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

  // ==========================================================================
  // 3. REST routes against real Postgres (covers the shipped route code that the
  //    unit suite can only test via mocks/in-memory paths).
  // ==========================================================================

  describe("REST routes (real Postgres)", () => {
    const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    // --- auth (Better Auth core: signup + sign-in) ----------------------------

    test("auth: signup creates a 'pending' user; duplicate email is rejected", async () => {
      const email = `reg_${uniq()}@itest.dev`;
      const { userId, token } = await signUpDj({ email });
      expect(typeof token).toBe("string");
      expect(token.length).toBeGreaterThan(0);

      const [row] = await db
        .select({ status: schema.user.status })
        .from(schema.user)
        .where(eq(schema.user.id, userId));
      expect(row?.status).toBe("pending"); // approval gate default

      // Duplicate email → Better Auth rejects (throws an APIError).
      let dupRejected = false;
      try {
        await auth.api.signUpEmail({
          body: { email, password: "validpassword123", name: "Dup" },
        });
      } catch {
        dupRejected = true;
      }
      expect(dupRejected).toBe(true);

      await db.delete(schema.user).where(eq(schema.user.id, userId));
    });

    test("auth: sign-in issues a bearer token; unknown email is rejected", async () => {
      const email = `login_${uniq()}@itest.dev`;
      const { userId } = await signUpDj({ email, approved: true });

      const { headers } = await auth.api.signInEmail({
        body: { email, password: "validpassword123" },
        returnHeaders: true,
      });
      const token = headers.get("set-auth-token");
      expect(typeof token).toBe("string");
      expect((token ?? "").length).toBeGreaterThan(0);

      let badRejected = false;
      try {
        await auth.api.signInEmail({
          body: { email: `nobody_${uniq()}@itest.dev`, password: "validpassword123" },
        });
      } catch {
        badRejected = true;
      }
      expect(badRejected).toBe(true);

      await db.delete(schema.user).where(eq(schema.user.id, userId));
    });

    // --- push (Better Auth bearer-token auth) ---------------------------------

    test("push: /send authenticates a Better Auth bearer token and 401s a bogus one", async () => {
      const { userId, token } = await signUpDj({ approved: true });

      const ok = await pushRoute.request("/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
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

      await db.delete(schema.user).where(eq(schema.user.id, userId));
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

    test("recap + my-likes surface the persisted Spotify identity (Slice 4)", async () => {
      const sid = `s4_${uniq()}`;
      await db.insert(schema.sessions).values({ id: sid, djName: "S4 DJ", endedAt: new Date() });
      const [pt] = await db
        .insert(schema.playedTracks)
        .values({
          sessionId: sid,
          artist: "SYML",
          title: "Careful",
          albumArtUrl: "https://i.scdn.co/image/careful",
          spotifyUrl: "https://open.spotify.com/track/careful",
        })
        .returning({ id: schema.playedTracks.id });
      const trackId = pt?.id;
      if (trackId === undefined) throw new Error("track not created");
      await db
        .insert(schema.likes)
        .values({ sessionId: sid, clientId: "client_s4test", playedTrackId: trackId });

      const recap = await sessionsRoute.request(`/${sid}/recap`);
      expect(recap.status).toBe(200);
      const rBody = (await recap.json()) as {
        tracks: Array<{ title: string; albumArtUrl: string | null; spotifyUrl: string | null }>;
      };
      const rt = rBody.tracks.find((t) => t.title === "Careful");
      expect(rt?.albumArtUrl).toBe("https://i.scdn.co/image/careful");
      expect(rt?.spotifyUrl).toBe("https://open.spotify.com/track/careful");

      // my-likes inherits identity via the played_track FK.
      const likes = await clientRoutes.request("/client_s4test/likes");
      expect(likes.status).toBe(200);
      const lBody = (await likes.json()) as {
        likes: Array<{ title: string; albumArtUrl: string | null; spotifyUrl: string | null }>;
      };
      const lt = lBody.likes.find((l) => l.title === "Careful");
      expect(lt?.albumArtUrl).toBe("https://i.scdn.co/image/careful");
      expect(lt?.spotifyUrl).toBe("https://open.spotify.com/track/careful");

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
      const name = `Prof DJ ${uniq()}`;
      const { userId } = await signUpDj({ name, approved: true });
      // The slug is auto-derived from the name on signup (server databaseHook).
      const [u] = await db
        .select({ slug: schema.user.slug })
        .from(schema.user)
        .where(eq(schema.user.id, userId));
      const slug = u?.slug;
      if (!slug) throw new Error("dj slug not generated");
      const sid = `djprof_${uniq()}`;
      await db
        .insert(schema.sessions)
        .values({ id: sid, djName: name, djUserId: userId, endedAt: new Date() });
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
      expect(body.djName).toBe(name);
      expect(body.totalTracks).toBe(2);
      expect(body.sessions[0]?.trackCount).toBe(2);

      await db.delete(schema.sessions).where(eq(schema.sessions.id, sid));
      await db.delete(schema.user).where(eq(schema.user.id, userId));
    });

    // --- auth guards: route-level branches (status + role), with real sessions ---

    test("guard: requireDjAuth 403s a pending (unapproved) user", async () => {
      const { userId, token } = await signUpDj({ approved: false });
      const res = await pushRoute.request("/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ payload: "hi", filter: "debug" }),
      });
      expect(res.status).toBe(403); // authenticated but status !== 'approved'
      await db.delete(schema.user).where(eq(schema.user.id, userId));
    });

    test("guard: requireAdmin 404s a non-admin DJ but passes an admin", async () => {
      const djUser = await signUpDj({ approved: true });
      const denied = await adminRoute.request("/me", {
        headers: { Authorization: `Bearer ${djUser.token}` },
      });
      expect(denied.status).toBe(404); // hideExistence: role mismatch is not leaked

      const adminUser = await signUpDj({ approved: true, admin: true });
      const ok = await adminRoute.request("/me", {
        headers: { Authorization: `Bearer ${adminUser.token}` },
      });
      expect(ok.status).toBe(200);
      expect(((await ok.json()) as { role?: string }).role).toBe("admin");

      await db.delete(schema.user).where(eq(schema.user.id, djUser.userId));
      await db.delete(schema.user).where(eq(schema.user.id, adminUser.userId));
    });
  });

  // ==========================================================================
  // 4. Stages / Events + SCOPED push (the "Global Megaphone" fix)
  // ==========================================================================

  describe("stages / events + scoped push (real Postgres)", () => {
    const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const createdEventIds: string[] = [];
    const createdEndpoints: string[] = [];
    const djUserIds: string[] = [];

    afterAll(async () => {
      for (const id of createdEventIds) {
        // CASCADE clears the event's stages + stage_subscriptions.
        await db.delete(schema.events).where(eq(schema.events.id, id));
      }
      for (const ep of createdEndpoints) {
        await db.delete(schema.pushSubscriptions).where(eq(schema.pushSubscriptions.endpoint, ep));
      }
      for (const id of djUserIds) {
        await db.delete(schema.user).where(eq(schema.user.id, id));
      }
    });

    // An approved DJ + a Better Auth bearer token (the stage routes are requireDjAuth-gated).
    async function newDjToken(): Promise<string> {
      const { userId, token } = await signUpDj({ approved: true });
      djUserIds.push(userId);
      return token;
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
      const ev = (await evRes.json()) as { id: string; ownerUserId: string };
      createdEventIds.push(ev.id);
      expect(typeof ev.ownerUserId).toBe("string"); // owner derived from token, not the body
      expect(ev.ownerUserId.length).toBeGreaterThan(0);

      const stRes = await stageRoutes.request("/stages", {
        method: "POST",
        headers,
        body: JSON.stringify({ name: "Main Floor", eventId: ev.id }),
      });
      expect(stRes.status).toBe(201);
      const st = (await stRes.json()) as { id: string };

      const getRes = await stageRoutes.request(`/stages/${st.id}`);
      expect(getRes.status).toBe(200);
      // Public read is enriched with the parent event name (for the dancer's "Stage · Event" badge).
      const stageRead = (await getRes.json()) as { name: string; eventName: string | null };
      expect(stageRead.name).toBe("Main Floor");
      expect(stageRead.eventName).toBe("WCS Test 2026");

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

    test("GET /api/events lists the DJ's events; unauthenticated → 401", async () => {
      const token = await newDjToken();
      const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
      const created = (await (
        await stageRoutes.request("/events", {
          method: "POST",
          headers,
          body: JSON.stringify({ name: "Owned Event" }),
        })
      ).json()) as { id: string };
      createdEventIds.push(created.id);

      const list = await stageRoutes.request("/events", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(list.status).toBe(200);
      const body = (await list.json()) as { events: Array<{ id: string }> };
      expect(body.events.some((e) => e.id === created.id)).toBe(true);

      const noauth = await stageRoutes.request("/events");
      expect(noauth.status).toBe(401);
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

    // --- real-DB handler paths (the unit suite runs these in NODE_ENV=test) ----

    async function waitFor(check: () => Promise<boolean>, ms = 1500): Promise<boolean> {
      const start = Date.now();
      while (Date.now() - start < ms) {
        if (await check()) return true;
        await new Promise((r) => setTimeout(r, 20));
      }
      return false;
    }

    function mkStageCtx(stageId: string, clientId: string, messageId?: string) {
      const sent: Array<Record<string, unknown>> = [];
      const subscribed: string[] = [];
      const rawWs = {
        subscribe: (t: string) => subscribed.push(t),
        unsubscribe: () => {},
        publish: () => {},
        getBufferedAmount: () => 0,
      } as unknown as ServerWebSocket;
      const ctx = {
        message: { type: "SUBSCRIBE_STAGE", stageId, clientId },
        ws: { send: (d: string) => sent.push(JSON.parse(d)), close: () => {} },
        rawWs,
        state: {
          clientId,
          isListener: false,
          subscribedSessionId: null,
          subscribedStageId: null,
          djSessionId: null,
        },
        messageId,
      } as unknown as WSContext;
      return { ctx, sent, subscribed };
    }

    test("persistSession records stage_id; handleSubscribeStage arms scoped push", async () => {
      const evId = `evh_${uniq()}`;
      const stId = `sth_${uniq()}`;
      const sid = `sessh_${uniq()}`;
      const clientId = `ch_${uniq()}`;
      const ep = `https://push.test/${clientId}`;
      await db.insert(schema.events).values({ id: evId, name: "Evt" });
      createdEventIds.push(evId);
      await db.insert(schema.stages).values({ id: stId, name: "St", eventId: evId });
      await db
        .insert(schema.pushSubscriptions)
        .values({ endpoint: ep, p256dh: "p", auth: "a", clientId });
      createdEndpoints.push(ep);

      // persistSession writes the stage_id column.
      await persistSession(sid, "DJ H", null, stId);
      const [sess] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, sid));
      expect(sess?.stageId).toBe(stId);
      await db.delete(schema.sessions).where(eq(schema.sessions.id, sid));

      // handleSubscribeStage validates the stage + writes the durable membership row.
      const { ctx, subscribed } = mkStageCtx(stId, clientId);
      await handleSubscribeStage(ctx);
      expect(subscribed).toContain(getStageTopic(stId));

      // Membership write is fire-and-forget → poll, then confirm scoped push reaches us.
      const armed = await waitFor(async () => {
        const rows = await db
          .select()
          .from(schema.stageSubscriptions)
          .where(
            and(
              eq(schema.stageSubscriptions.stageId, stId),
              eq(schema.stageSubscriptions.clientId, clientId),
            ),
          );
        return rows.length === 1;
      });
      expect(armed).toBe(true);
      const targets = await getStagePushTargets(stId);
      expect(targets.map((t) => t.endpoint)).toContain(ep);
    });

    test("handleSubscribeStage NACKs an unknown stage and does not subscribe", async () => {
      const { ctx, sent, subscribed } = mkStageCtx(`ghost_${uniq()}`, `cg_${uniq()}`, "mid-ghost");
      await handleSubscribeStage(ctx);
      expect(subscribed).toHaveLength(0);
      expect(sent.some((m) => m.type === "NACK")).toBe(true);
    });
  });

  describe("Track D — Spotify tables", () => {
    const tdUniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    let djId: string;
    const createdSessions: string[] = [];

    beforeAll(async () => {
      process.env.TOKEN_ENCRYPTION_KEY = Buffer.from(
        crypto.getRandomValues(new Uint8Array(32)),
      ).toString("base64");
      ({ userId: djId } = await signUpDj({ name: "TD DJ", approved: true }));
    });

    afterAll(async () => {
      for (const sid of createdSessions) {
        await db.delete(schema.sessions).where(eq(schema.sessions.id, sid));
      }
      // Cascades spotify_connections + live_pollers for this DJ.
      await db.delete(schema.user).where(eq(schema.user.id, djId));
    });

    test("spotify_connections: encrypted token round-trips; getConnectionStatus reflects it", async () => {
      const refresh = `refresh_${tdUniq()}`;
      await db.insert(schema.spotifyConnections).values({
        djUserId: djId,
        refreshTokenEnc: encryptSecret(refresh),
        scope: "user-read-currently-playing",
        status: "active",
      });

      expect(await getConnectionStatus(djId)).toEqual({ connected: true, status: "active" });

      const [row] = await db
        .select({ enc: schema.spotifyConnections.refreshTokenEnc })
        .from(schema.spotifyConnections)
        .where(eq(schema.spotifyConnections.djUserId, djId));
      expect(decryptSecret(row!.enc)).toBe(refresh);
    });

    test("spotify_connections: djUserId is unique (one connection per DJ)", async () => {
      let threw = false;
      try {
        await db
          .insert(schema.spotifyConnections)
          .values({ djUserId: djId, refreshTokenEnc: encryptSecret("dup"), scope: "s" });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
    });

    test("an undecryptable token (TOKEN_ENCRYPTION_KEY changed) flips the connection to needs_reauth", async () => {
      const { userId } = await signUpDj({ name: "Reauth DJ", approved: true });
      // Garbage ciphertext = what a stored token looks like under a different key. decryptSecret
      // throws BEFORE any Spotify HTTP call, so this is deterministic + network-free.
      await db.insert(schema.spotifyConnections).values({
        djUserId: userId,
        refreshTokenEnc: "not-real-ciphertext",
        scope: "user-read-currently-playing",
        status: "active",
      });

      await expect(fetchNowPlaying(userId)).rejects.toBeInstanceOf(SpotifyAuthError);

      const [conn] = await db
        .select({ status: schema.spotifyConnections.status })
        .from(schema.spotifyConnections)
        .where(eq(schema.spotifyConnections.djUserId, userId));
      expect(conn?.status).toBe("needs_reauth"); // self-heals → UI shows "Reconnect Spotify"

      await db.delete(schema.user).where(eq(schema.user.id, userId)); // cascades the connection
    });

    test("createLiveSession persists a session row for the DJ", async () => {
      const sid = `itest_td_${tdUniq()}`;
      createdSessions.push(sid);
      const { persisted } = await createLiveSession({
        sessionId: sid,
        djName: "TD DJ",
        djUserId: djId,
      });
      expect(persisted).toBe(true);

      const [row] = await db
        .select({ id: schema.sessions.id, djUserId: schema.sessions.djUserId })
        .from(schema.sessions)
        .where(eq(schema.sessions.id, sid));
      expect(row?.id).toBe(sid);
      expect(row?.djUserId).toBe(djId);
    });

    test("live_pollers: unique per session + FK cascade on session delete", async () => {
      const sid = `itest_tdp_${tdUniq()}`;
      await db.insert(schema.sessions).values({ id: sid, djName: "TD DJ", djUserId: djId });
      await db
        .insert(schema.livePollers)
        .values({ djUserId: djId, sessionId: sid, status: "running" });

      let threw = false;
      try {
        await db
          .insert(schema.livePollers)
          .values({ djUserId: djId, sessionId: sid, status: "running" });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);

      await db.delete(schema.sessions).where(eq(schema.sessions.id, sid));
      const rows = await db
        .select()
        .from(schema.livePollers)
        .where(eq(schema.livePollers.sessionId, sid));
      expect(rows.length).toBe(0);
    });
  });

  describe("Admin panel", () => {
    let adminId: string;
    let adminToken: string;
    let pendingId: string;
    let pendingToken: string;
    const cleanupUsers: string[] = [];

    async function seedDj(
      opts: { approved?: boolean; admin?: boolean } = {},
    ): Promise<{ userId: string; token: string }> {
      const r = await signUpDj(opts);
      cleanupUsers.push(r.userId);
      return r;
    }
    const asAdmin = (path: string, init: RequestInit = {}) =>
      adminRoute.request(path, {
        ...init,
        headers: { Authorization: `Bearer ${adminToken}`, ...(init.headers ?? {}) },
      });

    beforeAll(async () => {
      ({ userId: adminId, token: adminToken } = await seedDj({ admin: true, approved: true }));
      ({ userId: pendingId, token: pendingToken } = await seedDj()); // status defaults to 'pending'
    });
    afterAll(async () => {
      await db.delete(schema.adminAudit).where(eq(schema.adminAudit.adminUserId, adminId));
      for (const id of cleanupUsers) {
        await db.delete(schema.user).where(eq(schema.user.id, id));
      }
    });

    test("role defaults to 'dj' for a normal account", async () => {
      const [row] = await db
        .select({ role: schema.user.role })
        .from(schema.user)
        .where(eq(schema.user.id, pendingId));
      expect(row?.role).toBe("dj");
    });

    test("GET /me → 200 admin identity for an admin; 404 for a non-admin (hidden)", async () => {
      const ok = await asAdmin("/me");
      expect(ok.status).toBe(200);
      expect(((await ok.json()) as { role: string }).role).toBe("admin");

      const denied = await adminRoute.request("/me", {
        headers: { Authorization: `Bearer ${pendingToken}` },
      });
      expect(denied.status).toBe(404);
    });

    test("approve flips status to 'approved' and writes an audit row", async () => {
      const res = await asAdmin(`/djs/${pendingId}/approve`, { method: "POST" });
      expect(res.status).toBe(200);

      const [row] = await db
        .select({ status: schema.user.status })
        .from(schema.user)
        .where(eq(schema.user.id, pendingId));
      expect(row?.status).toBe("approved");

      await new Promise((r) => setTimeout(r, 80)); // audit is fire-and-forget
      const audit = await db
        .select()
        .from(schema.adminAudit)
        .where(eq(schema.adminAudit.adminUserId, adminId));
      expect(audit.some((a) => a.action === "dj.approve" && a.targetId === pendingId)).toBe(true);
    });

    test("a rejected DJ is refused at a protected route with 403", async () => {
      const { userId, token } = await seedDj(); // pending
      expect((await asAdmin(`/djs/${userId}/reject`, { method: "POST" })).status).toBe(200);

      // requireDjAuth gates the stage routes: a valid session whose status isn't
      // 'approved' → 403 (not 401 — the token/session itself is valid).
      const denied = await stageRoutes.request("/events", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(denied.status).toBe(403);
    });

    test("GET /overview returns the live-state shape", async () => {
      const res = await asAdmin("/overview");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { sessions: unknown[]; connections: number };
      expect(Array.isArray(body.sessions)).toBe(true);
      expect(typeof body.connections).toBe("number");
    });

    test("create DJ: admin makes an approved 'dj' WITHOUT clobbering the admin session", async () => {
      const email = `created_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@itest.dev`;
      const created = await asAdmin("/djs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName: "Created DJ", password: "validpassword123" }),
      });
      expect(created.status).toBe(200);
      const { id } = (await created.json()) as { id: string };
      cleanupUsers.push(id);

      const [row] = await db
        .select({ role: schema.user.role, status: schema.user.status })
        .from(schema.user)
        .where(eq(schema.user.id, id));
      expect(row?.role).toBe("dj");
      expect(row?.status).toBe("approved"); // admin-created → approved, not pending

      // The admin's own session is untouched (Better Auth createUser issues NO session for the new user).
      expect((await asAdmin("/me")).status).toBe(200);

      // Duplicate email → 409.
      const dup = await asAdmin("/djs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName: "Dup", password: "validpassword123" }),
      });
      expect(dup.status).toBe(409);
    });
  });

  // ==========================================================================
  // 5. Songs Catalog (B3) — seed→catalog read path incl. the Pika consensus join
  // ==========================================================================

  describe("playlist /confirm — promote a DJ correction to the shared cache (real Postgres)", () => {
    test("writes a manual track_link keyed by artist::title", async () => {
      const { userId, token } = await signUpDj({ approved: true });
      const artist = `Confirm Art ${Date.now().toString(36)}`;
      const title = "Confirm Song";
      const spotifyId = "itest_confirm_sp";
      const res = await playlistRoutes.request("/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ artist, title, spotifyId }),
      });
      expect(res.status).toBe(200);

      const key = getTrackKey(artist, title);
      const [row] = await db
        .select()
        .from(schema.trackLinks)
        .where(eq(schema.trackLinks.matchKey, key));
      expect(row?.providerId).toBe(spotifyId);
      expect(row?.source).toBe("manual");
      expect(row?.status).toBe("manual");

      await db.delete(schema.trackLinks).where(eq(schema.trackLinks.matchKey, key));
      await db.delete(schema.user).where(eq(schema.user.id, userId));
    });

    test("a manual confirm overrides an existing auto match", async () => {
      const { userId, token } = await signUpDj({ approved: true });
      const artist = `Override Art ${Date.now().toString(36)}`;
      const title = "Override Song";
      const key = getTrackKey(artist, title);
      await db.insert(schema.trackLinks).values({
        matchKey: key,
        songKey: key,
        provider: "spotify",
        providerId: "auto_id",
        status: "matched",
        source: "auto",
        confidence: 0.9,
      });

      const res = await playlistRoutes.request("/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ artist, title, spotifyId: "manual_id" }),
      });
      expect(res.status).toBe(200);

      const [row] = await db
        .select()
        .from(schema.trackLinks)
        .where(eq(schema.trackLinks.matchKey, key));
      expect(row?.providerId).toBe("manual_id"); // manual overwrote auto
      expect(row?.source).toBe("manual");

      await db.delete(schema.trackLinks).where(eq(schema.trackLinks.matchKey, key));
      await db.delete(schema.user).where(eq(schema.user.id, userId));
    });
  });

  describe("dj profile management — publish toggle + external playlists (real Postgres)", () => {
    const mk = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const PLAYLIST = "37i9dQZF1DXcBWIGoYBM5M";

    test("publish toggle hides a session; playlists CRUD; cross-DJ scoping", async () => {
      const { userId, token } = await signUpDj({ approved: true, name: `PubDJ ${mk()}` });
      const [u] = await db
        .select({ slug: schema.user.slug })
        .from(schema.user)
        .where(eq(schema.user.id, userId));
      const slug = u?.slug ?? "";
      expect(slug).not.toBe("");

      const sidA = `pub_a_${mk()}`;
      const sidB = `pub_b_${mk()}`;
      await db.insert(schema.sessions).values([
        { id: sidA, djUserId: userId, djName: "PubDJ", startedAt: new Date() },
        { id: sidB, djUserId: userId, djName: "PubDJ", startedAt: new Date() },
      ]);

      const authed = (path: string, init: RequestInit = {}) =>
        djRoute.request(path, {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          ...init,
        });
      const publicProfile = async () =>
        (await (await djRoute.request(`/${slug}`)).json()) as {
          sessions: Array<{ id: string }>;
          playlists: Array<{ id: number; spotifyPlaylistId: string }>;
        };

      // Both sessions default published → both show; no playlists yet.
      let pub = await publicProfile();
      expect(pub.sessions.map((s) => s.id).sort()).toEqual([sidA, sidB].sort());
      expect(pub.playlists).toEqual([]);

      // Hide sidA → it drops off the public profile (cache invalidated on mutation).
      expect(
        (
          await authed(`/me/sessions/${sidA}`, {
            method: "PATCH",
            body: JSON.stringify({ published: false }),
          })
        ).status,
      ).toBe(200);
      pub = await publicProfile();
      expect(pub.sessions.map((s) => s.id)).toEqual([sidB]);

      // Authed /me/sessions shows BOTH (incl. hidden) with their flags.
      const mine = (await (await authed("/me/sessions")).json()) as {
        sessions: Array<{ id: string; published: boolean }>;
      };
      expect(mine.sessions.find((s) => s.id === sidA)?.published).toBe(false);
      expect(mine.sessions.find((s) => s.id === sidB)?.published).toBe(true);

      // Add a playlist (good), reject junk (400).
      expect(
        (
          await authed("/me/playlists", {
            method: "POST",
            body: JSON.stringify({ url: `https://open.spotify.com/playlist/${PLAYLIST}?si=x` }),
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await authed("/me/playlists", {
            method: "POST",
            body: JSON.stringify({ url: "not a link" }),
          })
        ).status,
      ).toBe(400);

      pub = await publicProfile();
      expect(pub.playlists.length).toBe(1);
      expect(pub.playlists[0]?.spotifyPlaylistId).toBe(PLAYLIST);

      // Delete it → gone from the public profile.
      const myPl = (await (await authed("/me/playlists")).json()) as {
        playlists: Array<{ id: number }>;
      };
      const plId = myPl.playlists[0]?.id;
      expect((await authed(`/me/playlists/${plId}`, { method: "DELETE" })).status).toBe(200);
      pub = await publicProfile();
      expect(pub.playlists.length).toBe(0);

      // Cross-DJ scoping: another DJ can't toggle my session → 404 (not theirs).
      const other = await signUpDj({ approved: true, name: `OtherDJ ${mk()}` });
      const forbidden = await djRoute.request(`/me/sessions/${sidA}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${other.token}` },
        body: JSON.stringify({ published: true }),
      });
      expect(forbidden.status).toBe(404);
      // …and sidA is still hidden on my profile.
      expect((await publicProfile()).sessions.map((s) => s.id)).toEqual([sidB]);

      await db.delete(schema.sessions).where(inArray(schema.sessions.id, [sidA, sidB]));
      await db.delete(schema.user).where(eq(schema.user.id, userId));
      await db.delete(schema.user).where(eq(schema.user.id, other.userId));
    });
  });

  describe("dj set-playlist sync (real Postgres)", () => {
    const mk = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
    const PL1 = "37i9dQZF1DXcBWIGoYBM5M";
    const PL2 = "3cEYpjA9oz9GiPac4AsH4n";

    test("sync → profile row + recap; ownership 404, invalid 400, unpublished, re-sync, unsync", async () => {
      const { userId, token } = await signUpDj({ approved: true, name: `SyncDJ ${mk()}` });
      const [u] = await db
        .select({ slug: schema.user.slug })
        .from(schema.user)
        .where(eq(schema.user.id, userId));
      const slug = u?.slug ?? "";
      expect(slug).not.toBe("");

      const sid = `syncpl_${mk()}`;
      await db
        .insert(schema.sessions)
        .values({ id: sid, djUserId: userId, djName: "SyncDJ", startedAt: new Date() });
      await db.insert(schema.playedTracks).values({ sessionId: sid, artist: "A", title: "T" });

      const authed = (path: string, init: RequestInit = {}) =>
        djRoute.request(path, {
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          ...init,
        });
      const syncBody = (id: string) => JSON.stringify({ spotifyPlaylistId: id });
      const profileSession = async () => {
        const body = (await (await djRoute.request(`/${slug}`)).json()) as {
          sessions: Array<{ id: string; spotifyPlaylistId: string | null }>;
        };
        return body.sessions.find((s) => s.id === sid) ?? null;
      };
      // Authed recap request bypasses the 15s public cache → always fresh.
      const recapPlaylistId = async () => {
        const r = await sessionsRoute.request(`/${sid}/recap`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        expect(r.status).toBe(200);
        return ((await r.json()) as { spotifyPlaylistId: string | null }).spotifyPlaylistId;
      };

      // Nothing shared yet.
      expect((await profileSession())?.spotifyPlaylistId ?? null).toBeNull();
      expect(await recapPlaylistId()).toBeNull();

      // Unparseable id → 400.
      expect(
        (await authed(`/me/sessions/${sid}/playlist`, { method: "POST", body: syncBody("nope") }))
          .status,
      ).toBe(400);

      // Sync → surfaces on the profile session row AND the recap.
      expect(
        (await authed(`/me/sessions/${sid}/playlist`, { method: "POST", body: syncBody(PL1) }))
          .status,
      ).toBe(200);
      expect((await profileSession())?.spotifyPlaylistId).toBe(PL1);
      expect(await recapPlaylistId()).toBe(PL1);

      // #1: the authed management list (/me/sessions) also exposes the synced playlist id, so the
      // web ProfileManager can offer an unshare control.
      const mySessionRow = (
        (await (await authed("/me/sessions")).json()) as {
          sessions: Array<{ id: string; spotifyPlaylistId: string | null }>;
        }
      ).sessions.find((s) => s.id === sid);
      expect(mySessionRow?.spotifyPlaylistId).toBe(PL1);

      // Accepts a full URL, normalizes to the id, and re-sync updates in place.
      expect(
        (
          await authed(`/me/sessions/${sid}/playlist`, {
            method: "POST",
            body: syncBody(`https://open.spotify.com/playlist/${PL2}?si=x`),
          })
        ).status,
      ).toBe(200);
      expect((await profileSession())?.spotifyPlaylistId).toBe(PL2);
      expect(await recapPlaylistId()).toBe(PL2);

      // Cross-DJ can't sync my session → 404, and mine is unchanged.
      const other = await signUpDj({ approved: true, name: `OtherDJ ${mk()}` });
      const forbidden = await djRoute.request(`/me/sessions/${sid}/playlist`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${other.token}` },
        body: syncBody(PL1),
      });
      expect(forbidden.status).toBe(404);
      expect((await profileSession())?.spotifyPlaylistId).toBe(PL2);

      // Hide the set → off the public profile, but the recap (direct link) still shows the playlist.
      expect(
        (
          await authed(`/me/sessions/${sid}`, {
            method: "PATCH",
            body: JSON.stringify({ published: false }),
          })
        ).status,
      ).toBe(200);
      expect(await profileSession()).toBeNull();
      expect(await recapPlaylistId()).toBe(PL2);

      // Unsync → cleared from the recap; then re-sync (stress cycle) → back.
      expect((await authed(`/me/sessions/${sid}/playlist`, { method: "DELETE" })).status).toBe(200);
      expect(await recapPlaylistId()).toBeNull();
      expect(
        (await authed(`/me/sessions/${sid}/playlist`, { method: "POST", body: syncBody(PL1) }))
          .status,
      ).toBe(200);
      expect(await recapPlaylistId()).toBe(PL1);

      await db.delete(schema.sessions).where(eq(schema.sessions.id, sid));
      await db.delete(schema.user).where(eq(schema.user.id, userId));
      await db.delete(schema.user).where(eq(schema.user.id, other.userId));
    });
  });

  describe("Songs Catalog (real Postgres)", () => {
    const SP = "itest_catalog_sp1";
    const ART = "ITest Artist Cat";
    const TIT = "ITest Song Cat";
    const KEY = getTrackKey(ART, TIT);
    let adminId: string;
    let adminToken: string;
    let djId: string;
    let djName: string;
    let sessionId: string;

    const asAdmin = (path: string) =>
      adminRoute.request(path, { headers: { Authorization: `Bearer ${adminToken}` } });

    beforeAll(async () => {
      ({ userId: adminId, token: adminToken } = await signUpDj({ admin: true, approved: true }));
      const dj = await signUpDj({ approved: true, name: `Cat DJ ${Date.now().toString(36)}` });
      djId = dj.userId;
      const [u] = await db
        .select({ name: schema.user.name })
        .from(schema.user)
        .where(eq(schema.user.id, djId));
      djName = u?.name ?? "";

      // Canonical Spotify features (per-URI).
      await db.insert(schema.spotifyTrackFeatures).values({
        spotifyId: SP,
        tempo: 120,
        keyPitch: 0,
        mode: 1,
        energy: 0.8,
        danceability: 0.6,
        valence: 0.5,
        popularity: 42,
      });
      // Repertoire edge + first-class playlist membership.
      await db
        .insert(schema.curatedTracks)
        .values({ djUserId: djId, spotifyId: SP, name: TIT, artists: ART });
      const [pl] = await db
        .insert(schema.curatedPlaylists)
        .values({ djUserId: djId, name: "ITest Cat List" })
        .returning({ id: schema.curatedPlaylists.id });
      await db
        .insert(schema.curatedPlaylistTracks)
        .values({ playlistId: pl?.id ?? 0, spotifyId: SP });
      // Identity link: the normalized match_key resolves to this Spotify id.
      await db.insert(schema.trackLinks).values({
        matchKey: KEY,
        songKey: KEY,
        provider: "spotify",
        providerId: SP,
        status: "matched",
        source: "playlist",
      });
      // Two plays carrying the same match_key + Pika fingerprints → the consensus.
      sessionId = `itest_cat_${Date.now().toString(36)}`;
      await db
        .insert(schema.sessions)
        .values({ id: sessionId, djUserId: djId, djName, endedAt: new Date() });
      await db.insert(schema.playedTracks).values([
        {
          sessionId,
          artist: ART,
          title: TIT,
          matchKey: KEY,
          energy: 70,
          danceability: 60,
          bpm: 120,
        },
        {
          sessionId,
          artist: ART,
          title: TIT,
          matchKey: KEY,
          energy: 80,
          danceability: 40,
          bpm: 122,
        },
      ]);
    });

    afterAll(async () => {
      await db.delete(schema.playedTracks).where(eq(schema.playedTracks.sessionId, sessionId));
      await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
      await db.delete(schema.trackLinks).where(eq(schema.trackLinks.matchKey, KEY));
      await db
        .delete(schema.spotifyTrackFeatures)
        .where(eq(schema.spotifyTrackFeatures.spotifyId, SP));
      // curated_tracks / curated_playlists cascade from the user.
      await db.delete(schema.user).where(eq(schema.user.id, djId));
      await db.delete(schema.user).where(eq(schema.user.id, adminId));
    });

    test("song detail: Spotify features + Pika consensus + appearances", async () => {
      const res = await asAdmin(`/catalog/songs/${SP}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        spotify: { tempo: number; energy: number } | null;
        pika: {
          energy: number;
          danceability: number;
          bpm: number;
          plays: number;
          djs: number;
        } | null;
        appearances: Array<{ playlistName: string; djName: string }>;
      };
      expect(body.spotify?.tempo).toBe(120);
      // Consensus = averages over both plays: energy (70,80)→75, dance (60,40)→50, bpm (120,122)→121.
      expect(body.pika).toMatchObject({ plays: 2, djs: 1, energy: 75, danceability: 50, bpm: 121 });
      expect(
        body.appearances.some((a) => a.playlistName === "ITest Cat List" && a.djName === djName),
      ).toBe(true);
    });

    test("seedFromPlaylist + getSpotifyFeatures write/read the catalog rows", async () => {
      const SP2 = "itest_seed_sp2";
      const A2 = "Seed Artist Two";
      const T2 = "Seed Song Two";
      const seeded = await seedFromPlaylist(djId, "ITest Seed List", [
        {
          spotifyId: SP2,
          uri: `spotify:track:${SP2}`,
          name: T2,
          artists: A2,
          features: { tempo: 100, energy: 0.5 },
        },
      ]);
      expect(seeded).toBe(1);

      // curated_tracks + track_link (playlist source, exact match_key) + features all written.
      const ct = await db
        .select()
        .from(schema.curatedTracks)
        .where(eq(schema.curatedTracks.spotifyId, SP2));
      expect(ct.length).toBe(1);
      const tl = await db
        .select()
        .from(schema.trackLinks)
        .where(eq(schema.trackLinks.providerId, SP2));
      expect(tl[0]?.matchKey).toBe(getTrackKey(A2, T2));
      expect(tl[0]?.source).toBe("playlist");

      // getSpotifyFeatures returns known ids and omits unknown ones.
      const map = await getSpotifyFeatures([SP2, "itest_not_seeded"]);
      expect(map[SP2]?.tempo).toBe(100);
      expect("itest_not_seeded" in map).toBe(false);

      await db.delete(schema.trackLinks).where(eq(schema.trackLinks.providerId, SP2));
      await db
        .delete(schema.spotifyTrackFeatures)
        .where(eq(schema.spotifyTrackFeatures.spotifyId, SP2));
    });

    test("dual-CSV accretive merge: Exportify precision + Chosic ISRC/Camelot, any order", async () => {
      const readFeat = (id: string) =>
        db
          .select()
          .from(schema.spotifyTrackFeatures)
          .where(eq(schema.spotifyTrackFeatures.spotifyId, id));

      // Chosic carries ISRC/Camelot but rounded values (energy 0.25); Exportify carries precision
      // (0.248) + recordLabel but no ISRC/Camelot. The merge must keep the best of both, either order.
      const chosicFeat = { tempo: 90, energy: 0.25, camelot: "9B", isrc: "CAN112402678" } as const;
      const exportifyFeat = { tempo: 90.012, energy: 0.248, recordLabel: "Nettwerk" } as const;

      const assertMerged = async (id: string, order: string) => {
        const [row] = await readFeat(id);
        expect(row, order).toBeDefined();
        expect(row?.energy, `${order} energy = Exportify precision`).toBeCloseTo(0.248, 5);
        expect(row?.tempo, `${order} tempo = Exportify precision`).toBeCloseTo(90.012, 3);
        expect(row?.isrc, `${order} isrc from Chosic`).toBe("CAN112402678");
        expect(row?.camelot, `${order} camelot from Chosic`).toBe("9B");
        expect(row?.recordLabel, `${order} recordLabel from Exportify (not nulled by Chosic)`).toBe(
          "Nettwerk",
        );
        expect(row?.featuresSource, `${order} winning numeric source`).toBe("exportify");
      };

      // Order A: Chosic then Exportify.
      const SPA = "itest_merge_a";
      await seedFromPlaylist(
        djId,
        "Merge A",
        [
          {
            spotifyId: SPA,
            uri: `spotify:track:${SPA}`,
            name: "MA",
            artists: "Merge A Art",
            features: chosicFeat,
          },
        ],
        "csv",
        "chosic",
      );
      await seedFromPlaylist(
        djId,
        "Merge A",
        [
          {
            spotifyId: SPA,
            uri: `spotify:track:${SPA}`,
            name: "MA",
            artists: "Merge A Art",
            features: exportifyFeat,
          },
        ],
        "csv",
        "exportify",
      );
      await assertMerged(SPA, "chosic→exportify");

      // Order B: Exportify then Chosic — a rounded Chosic value must NOT clobber the Exportify float.
      const SPB = "itest_merge_b";
      await seedFromPlaylist(
        djId,
        "Merge B",
        [
          {
            spotifyId: SPB,
            uri: `spotify:track:${SPB}`,
            name: "MB",
            artists: "Merge B Art",
            features: exportifyFeat,
          },
        ],
        "csv",
        "exportify",
      );
      await seedFromPlaylist(
        djId,
        "Merge B",
        [
          {
            spotifyId: SPB,
            uri: `spotify:track:${SPB}`,
            name: "MB",
            artists: "Merge B Art",
            features: chosicFeat,
          },
        ],
        "csv",
        "chosic",
      );
      await assertMerged(SPB, "exportify→chosic");

      const ids = [SPA, SPB];
      await db.delete(schema.trackLinks).where(inArray(schema.trackLinks.providerId, ids));
      await db
        .delete(schema.spotifyTrackFeatures)
        .where(inArray(schema.spotifyTrackFeatures.spotifyId, ids));
    });

    test("seedFromPlaylist dedupes duplicate ids and replaces a playlist's memberships on re-import", async () => {
      const A = "Dedup Artist";
      const ids = ["itest_dd1", "itest_dd2", "itest_dd3"];
      // A DUPLICATE id (would crash a naive multi-row upsert) + a distinct one.
      await seedFromPlaylist(djId, "Dedup List", [
        { spotifyId: ids[0] as string, uri: `spotify:track:${ids[0]}`, name: "A", artists: A },
        { spotifyId: ids[0] as string, uri: `spotify:track:${ids[0]}`, name: "A", artists: A },
        { spotifyId: ids[1] as string, uri: `spotify:track:${ids[1]}`, name: "B", artists: A },
      ]);
      const [pl] = await db
        .select({ id: schema.curatedPlaylists.id })
        .from(schema.curatedPlaylists)
        .where(
          and(
            eq(schema.curatedPlaylists.djUserId, djId),
            eq(schema.curatedPlaylists.name, "Dedup List"),
          ),
        );
      const members1 = await db
        .select()
        .from(schema.curatedPlaylistTracks)
        .where(eq(schema.curatedPlaylistTracks.playlistId, pl?.id ?? 0));
      expect(members1.length).toBe(2); // the duplicate id collapsed

      // Re-import the SAME playlist with a different track → memberships replaced (not appended).
      await seedFromPlaylist(djId, "Dedup List", [
        { spotifyId: ids[2] as string, uri: `spotify:track:${ids[2]}`, name: "C", artists: A },
      ]);
      const members2 = await db
        .select()
        .from(schema.curatedPlaylistTracks)
        .where(eq(schema.curatedPlaylistTracks.playlistId, pl?.id ?? 0));
      expect(members2.map((m) => m.spotifyId)).toEqual([ids[2]]);

      await db.delete(schema.trackLinks).where(inArray(schema.trackLinks.providerId, ids));
    });

    test("song list: search finds it with DJ/playlist counts", async () => {
      const res = await asAdmin(
        `/catalog/songs?q=${encodeURIComponent("ITest Song Cat")}&sort=tempo`,
      );
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        total: number;
        songs: Array<{
          spotifyId: string;
          djCount: number;
          playlistCount: number;
          tempo: number | null;
        }>;
      };
      const row = body.songs.find((s) => s.spotifyId === SP);
      expect(row).toBeDefined();
      expect(row?.djCount).toBe(1);
      expect(row?.playlistCount).toBe(1);
      expect(row?.tempo).toBe(120);
    });

    test("identity-only feed surfaces in the catalog and the ?missing=1 filter (web-broadcast path)", async () => {
      const SP3 = "itest_missing_sp3";
      const A3 = "MissFeat Artist";
      const T3 = "MissFeat Song";
      // A web-broadcast-style feed: identity only, NO features (empty playlistName → repertoire edge).
      await seedFromPlaylist(
        djId,
        "",
        [{ spotifyId: SP3, uri: `spotify:track:${SP3}`, name: T3, artists: A3 }],
        "profile",
      );

      // No spotify_track_features row was written — it's the un-enriched case.
      const feat = await db
        .select()
        .from(schema.spotifyTrackFeatures)
        .where(eq(schema.spotifyTrackFeatures.spotifyId, SP3));
      expect(feat.length).toBe(0);

      const songs = async (q: string, missing: boolean) => {
        const res = await asAdmin(
          `/catalog/songs?q=${encodeURIComponent(q)}${missing ? "&missing=1" : ""}`,
        );
        expect(res.status).toBe(200);
        return ((await res.json()) as { songs: Array<{ spotifyId: string; tempo: number | null }> })
          .songs;
      };

      // Un-enriched: present in the full list with null features, AND in the missing-only view.
      const inFull = (await songs(T3, false)).find((s) => s.spotifyId === SP3);
      expect(inFull).toBeDefined();
      expect(inFull?.tempo).toBeNull();
      expect((await songs(T3, true)).some((s) => s.spotifyId === SP3)).toBe(true);

      // The enriched catalog track (SP, which HAS features) is EXCLUDED by ?missing=1.
      expect((await songs(TIT, false)).some((s) => s.spotifyId === SP)).toBe(true);
      expect((await songs(TIT, true)).some((s) => s.spotifyId === SP)).toBe(false);

      await db.delete(schema.trackLinks).where(eq(schema.trackLinks.providerId, SP3));
    });

    test("catalog aggregates count the seeded track; unknown id → 404", async () => {
      const agg = await asAdmin("/catalog");
      expect(agg.status).toBe(200);
      const body = (await agg.json()) as { totals: { tracks: number; features: number } };
      expect(body.totals.tracks).toBeGreaterThanOrEqual(1);
      expect(body.totals.features).toBeGreaterThanOrEqual(1);

      expect((await asAdmin("/catalog/songs/nope_unknown_xyz")).status).toBe(404);
    });
  });

  // ==========================================================================
  // Journal read: real count, pagination + retro-enrichment (Slice A)
  // ==========================================================================

  describe("journal read: count, pagination + retro-enrichment", () => {
    const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const jrClient = `client_jr_${uniq()}`;
    const jrSession = `jr_${uniq()}`;
    const kManual = `jr-manual-${uniq()}`;
    const kAuto = `jr-auto-${uniq()}`;
    const kUnmatched = `jr-un-${uniq()}`;

    beforeAll(async () => {
      await db
        .insert(schema.sessions)
        .values({ id: jrSession, djName: "JR DJ", endedAt: new Date() });
      const tracks = await db
        .insert(schema.playedTracks)
        .values([
          // Direct snapshot identity (wedge-era play).
          {
            sessionId: jrSession,
            artist: "A",
            title: "Direct",
            spotifyUrl: "https://open.spotify.com/track/JRDIRECT",
          },
          // Pre-wedge play recovered via a trusted (manual) link.
          { sessionId: jrSession, artist: "B", title: "RetroManual", matchKey: kManual },
          // Auto link below the confidence gate — must stay null.
          { sessionId: jrSession, artist: "C", title: "AutoLow", matchKey: kAuto },
          // Explicitly unmatched link — must stay null.
          { sessionId: jrSession, artist: "D", title: "Unmatched", matchKey: kUnmatched },
          // No match_key at all — three-valued logic keeps the join empty.
          { sessionId: jrSession, artist: "E", title: "NoKey" },
        ])
        .returning({ id: schema.playedTracks.id });
      await db.insert(schema.trackLinks).values([
        {
          matchKey: kManual,
          providerId: "JRMANUAL",
          providerUrl: "https://open.spotify.com/track/JRMANUAL",
          status: "manual",
          source: "manual",
        },
        {
          matchKey: kAuto,
          providerId: "JRAUTO",
          status: "matched",
          source: "auto",
          confidence: 0.5,
        },
        { matchKey: kUnmatched, status: "unmatched", source: "auto" },
      ]);
      await db
        .insert(schema.likes)
        .values(
          tracks.map((t) => ({ sessionId: jrSession, clientId: jrClient, playedTrackId: t.id })),
        );
      // NULL-owner like (nullable by design) — must be invisible to every journal.
      const t0 = tracks[0];
      if (t0) {
        await db
          .insert(schema.likes)
          .values({ sessionId: jrSession, clientId: null, playedTrackId: t0.id });
      }
    });

    afterAll(async () => {
      await db.delete(schema.sessions).where(eq(schema.sessions.id, jrSession)); // cascades likes/tracks
      await db
        .delete(schema.trackLinks)
        .where(inArray(schema.trackLinks.matchKey, [kManual, kAuto, kUnmatched]));
    });

    test("real count + limit/offset paging; playlist null; NULL-owner likes invisible", async () => {
      const page = await clientRoutes.request(`/${jrClient}/likes?limit=2&offset=0`);
      expect(page.status).toBe(200);
      const body = (await page.json()) as {
        totalLikes: number;
        limit: number;
        offset: number;
        likes: unknown[];
        playlist: unknown;
      };
      expect(body.totalLikes).toBe(5); // real count — NOT the page length, NOT 6 (NULL-owner)
      expect(body.likes.length).toBe(2);
      expect(body.limit).toBe(2);
      expect(body.offset).toBe(0);
      expect(body.playlist).toBeNull();

      const beyond = await clientRoutes.request(`/${jrClient}/likes?limit=50&offset=999`);
      const bBody = (await beyond.json()) as { totalLikes: number; likes: unknown[] };
      expect(bBody.likes.length).toBe(0);
      expect(bBody.totalLikes).toBe(5);
    });

    test("retro-enrichment: trusted links resolve, untrusted stay null", async () => {
      const res = await clientRoutes.request(`/${jrClient}/likes?limit=50`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        likes: Array<{ title: string; spotifyUrl: string | null; albumArtUrl: string | null }>;
      };
      const byTitle = (t: string) => body.likes.find((l) => l.title === t);
      expect(byTitle("Direct")?.spotifyUrl).toBe("https://open.spotify.com/track/JRDIRECT");
      expect(byTitle("RetroManual")?.spotifyUrl).toBe("https://open.spotify.com/track/JRMANUAL");
      expect(byTitle("AutoLow")?.spotifyUrl).toBeNull();
      expect(byTitle("Unmatched")?.spotifyUrl).toBeNull();
      expect(byTitle("NoKey")?.spotifyUrl).toBeNull();
      // Album art has no retro source — only the snapshot column feeds it.
      expect(byTitle("RetroManual")?.albumArtUrl).toBeNull();
    });
  });

  // ==========================================================================
  // Journal export (real Postgres, Spotify faked via DI — never touches the API)
  // ==========================================================================

  describe("journal export (real Postgres, Spotify faked via DI)", () => {
    const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const jeClient = `client_je_${uniq()}`;
    const jeSession = `je_${uniq()}`;
    const kJe = `je-manual-${uniq()}`;
    const createCalls: Array<{ name: string; uris: string[] }> = [];
    const replaceCalls: Array<{ playlistId: string; uris: string[] }> = [];
    let failReplaceWith404 = false;

    const fakeDeps = () => ({
      ...defaultJournalExportDeps,
      createPlaylist: async (name: string, uris: string[]) => {
        createCalls.push({ name, uris });
        return {
          playlistId: `pl_${createCalls.length}`,
          playlistUrl: `https://open.spotify.com/playlist/pl_${createCalls.length}`,
        };
      },
      replacePlaylistItems: async (playlistId: string, uris: string[]) => {
        replaceCalls.push({ playlistId, uris });
        if (failReplaceWith404) throw new SpotifyPlaylistNotFoundError();
      },
    });

    beforeAll(async () => {
      await db.insert(schema.sessions).values({ id: jeSession, djName: "JE DJ" });
      const rows = await db
        .insert(schema.playedTracks)
        .values([
          {
            sessionId: jeSession,
            artist: "X",
            title: "First",
            spotifyUrl: "https://open.spotify.com/track/JE1",
          },
          { sessionId: jeSession, artist: "Y", title: "Retro", matchKey: kJe },
          {
            sessionId: jeSession,
            artist: "X",
            title: "First",
            spotifyUrl: "https://open.spotify.com/track/JE1",
          },
        ])
        .returning({ id: schema.playedTracks.id });
      await db
        .insert(schema.trackLinks)
        .values({ matchKey: kJe, providerId: "JE2", status: "manual", source: "manual" });
      // Explicit like timestamps force first-like ASC order: JE1, then retro JE2, then the dupe.
      const base = Date.now() - 10_000;
      await db.insert(schema.likes).values(
        rows.map((t, i) => ({
          sessionId: jeSession,
          clientId: jeClient,
          playedTrackId: t.id,
          createdAt: new Date(base + i * 1000),
        })),
      );
    });

    afterAll(async () => {
      await db
        .delete(schema.journalPlaylists)
        .where(eq(schema.journalPlaylists.clientId, jeClient));
      await db.delete(schema.sessions).where(eq(schema.sessions.id, jeSession));
      await db.delete(schema.trackLinks).where(eq(schema.trackLinks.matchKey, kJe));
    });

    test("happy create: first-like order, dupes collapsed, retro row included; row persisted", async () => {
      resetJournalExportGuardsForTests();
      const result = await exportJournalPlaylist(jeClient, fakeDeps());
      expect(result.updated).toBe(false);
      expect(result.trackCount).toBe(2);
      expect(result.matchedCount).toBe(2);
      expect(result.totalLiked).toBe(3);
      expect(createCalls[0]?.uris).toEqual(["spotify:track:JE1", "spotify:track:JE2"]);
      const [row] = await db
        .select()
        .from(schema.journalPlaylists)
        .where(eq(schema.journalPlaylists.clientId, jeClient));
      expect(row?.spotifyPlaylistId).toBe("pl_1");
      expect(row?.trackCount).toBe(2);
    });

    test("immediate re-export → cooldown error", async () => {
      resetJournalExportGuardsForTests();
      expect(exportJournalPlaylist(jeClient, fakeDeps())).rejects.toThrow(
        JournalExportCooldownError,
      );
    });

    test("past cooldown → replace path on the SAME playlist, updated:true", async () => {
      resetJournalExportGuardsForTests();
      await db
        .update(schema.journalPlaylists)
        .set({ updatedAt: new Date(Date.now() - 120_000) })
        .where(eq(schema.journalPlaylists.clientId, jeClient));
      const result = await exportJournalPlaylist(jeClient, fakeDeps());
      expect(result.updated).toBe(true);
      expect(replaceCalls[replaceCalls.length - 1]?.playlistId).toBe("pl_1");
      expect(createCalls.length).toBe(1); // no new playlist minted
    });

    test("replace 404 → recreate; row swaps to the new playlist id", async () => {
      resetJournalExportGuardsForTests();
      await db
        .update(schema.journalPlaylists)
        .set({ updatedAt: new Date(Date.now() - 120_000) })
        .where(eq(schema.journalPlaylists.clientId, jeClient));
      failReplaceWith404 = true;
      const result = await exportJournalPlaylist(jeClient, fakeDeps());
      failReplaceWith404 = false;
      expect(result.updated).toBe(true);
      const [row] = await db
        .select()
        .from(schema.journalPlaylists)
        .where(eq(schema.journalPlaylists.clientId, jeClient));
      expect(row?.spotifyPlaylistId).toBe("pl_2");
    });

    test("GET now returns the playlist object", async () => {
      const res = await clientRoutes.request(`/${jeClient}/likes`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        playlist: { url: string; trackCount: number } | null;
      };
      expect(body.playlist).not.toBeNull();
      expect(body.playlist?.trackCount).toBe(2);
    });

    test("route-level 409 when the shared service account is not connected", async () => {
      resetJournalExportGuardsForTests();
      // Assert the REAL Spotify boundary — but never fire real Spotify writes: skip when this
      // env actually has the service account connected (e.g. an owner dev machine).
      const svc = await db
        .select({ id: schema.serviceConnections.id })
        .from(schema.serviceConnections)
        .where(eq(schema.serviceConnections.name, "spotify-playlist"));
      if (svc.length > 0) return;

      const c409 = `client_je409_${uniq()}`;
      const [t] = await db
        .insert(schema.playedTracks)
        .values({
          sessionId: jeSession,
          artist: "Z",
          title: "For409",
          spotifyUrl: "https://open.spotify.com/track/JE409",
        })
        .returning({ id: schema.playedTracks.id });
      if (!t) throw new Error("seed failed");
      // The export must reach getServiceAccessToken — an empty journal would 404 first.
      await db
        .insert(schema.likes)
        .values({ sessionId: jeSession, clientId: c409, playedTrackId: t.id });

      const res = await clientRoutes.request(`/${c409}/likes/playlist`, { method: "POST" });
      expect(res.status).toBe(409);
      expect(((await res.json()) as { needsService?: boolean }).needsService).toBe(true);
    });
  });

  // ==========================================================================
  // Journal like removal (post-hoc unlike, Slice A.1)
  // ==========================================================================

  describe("journal like removal (real Postgres)", () => {
    const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const owner = `client_rm_${uniq()}`;
    const other = `client_rmother_${uniq()}`;
    const rmSession = `rm_${uniq()}`;
    let firstLikeId: number;
    let secondLikeId: number;

    beforeAll(async () => {
      await db.insert(schema.sessions).values({ id: rmSession, djName: "RM DJ" });
      const tracks = await db
        .insert(schema.playedTracks)
        .values([
          { sessionId: rmSession, artist: "R", title: "Keep Me" },
          { sessionId: rmSession, artist: "R", title: "Drop Me" },
        ])
        .returning({ id: schema.playedTracks.id });
      const [t1, t2] = tracks;
      if (!t1 || !t2) throw new Error("seed failed");
      const inserted = await db
        .insert(schema.likes)
        .values([
          { sessionId: rmSession, clientId: owner, playedTrackId: t1.id },
          { sessionId: rmSession, clientId: owner, playedTrackId: t2.id },
        ])
        .returning({ id: schema.likes.id });
      const [l1, l2] = inserted;
      if (!l1 || !l2) throw new Error("seed failed");
      firstLikeId = l1.id;
      secondLikeId = l2.id;
    });

    afterAll(async () => {
      await db.delete(schema.sessions).where(eq(schema.sessions.id, rmSession)); // cascades likes
    });

    test("owner delete → 200 with the decremented real total; row is gone", async () => {
      const res = await clientRoutes.request(`/${owner}/likes/${firstLikeId}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; totalLikes: number };
      expect(body.success).toBe(true);
      expect(body.totalLikes).toBe(1);
      const rows = await db.select().from(schema.likes).where(eq(schema.likes.id, firstLikeId));
      expect(rows.length).toBe(0);
    });

    test("deleting the same id again → 404", async () => {
      const res = await clientRoutes.request(`/${owner}/likes/${firstLikeId}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
    });

    test("another client cannot delete the like (404, row survives)", async () => {
      const res = await clientRoutes.request(`/${other}/likes/${secondLikeId}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(404);
      const rows = await db.select().from(schema.likes).where(eq(schema.likes.id, secondLikeId));
      expect(rows.length).toBe(1);
    });

    test("GET reflects the removal", async () => {
      const res = await clientRoutes.request(`/${owner}/likes`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { totalLikes: number; likes: Array<{ title: string }> };
      expect(body.totalLikes).toBe(1);
      expect(body.likes.some((l) => l.title === "Keep Me")).toBe(false);
      expect(body.likes.some((l) => l.title === "Drop Me")).toBe(true);
    });
  });

  // ==========================================================================
  // Slice B1 — dancer accounts: magic-link signup + tightened DJ guards
  // ==========================================================================

  describe("dancer accounts (Slice B1): magic-link signup + guard tightening", () => {
    const createdUserIds: string[] = [];

    afterAll(async () => {
      if (createdUserIds.length > 0) {
        await db.delete(schema.user).where(inArray(schema.user.id, createdUserIds));
      }
    });

    test("magic-link signup mints role=dancer, status=approved, null slug", async () => {
      const d = await signUpDancer();
      createdUserIds.push(d.userId);
      expect(d.token.length).toBeGreaterThan(0);
      const [u] = await db.select().from(schema.user).where(eq(schema.user.id, d.userId));
      expect(u?.role).toBe("dancer");
      expect(u?.status).toBe("approved");
      expect(u?.slug).toBeNull(); // name-less signup — hardened slug hook must not mint "/dj/"
    });

    test("second magic-link sign-in reuses the user and stays dancer/approved", async () => {
      const d = await signUpDancer();
      createdUserIds.push(d.userId);
      const again = await magicLinkSignIn(d.email);
      expect(again.userId).toBe(d.userId);
      const [u] = await db.select().from(schema.user).where(eq(schema.user.id, d.userId));
      expect(u?.role).toBe("dancer");
      expect(u?.status).toBe("approved");
    });

    test("OTP sign-in (PWA path) mints role=dancer, status=approved via the same hook", async () => {
      const rnd = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
      const email = `otp_dancer_${rnd}@itest.dev`;
      const d = await otpSignIn(email);
      createdUserIds.push(d.userId);
      expect(d.token.length).toBeGreaterThan(0);
      const [u] = await db.select().from(schema.user).where(eq(schema.user.id, d.userId));
      expect(u?.role).toBe("dancer");
      expect(u?.status).toBe("approved");
      expect(u?.slug).toBeNull();
    });

    test("an existing DJ who signs in via OTP is NOT demoted", async () => {
      const dj = await signUpDj({ approved: true });
      createdUserIds.push(dj.userId);
      const again = await otpSignIn(dj.email);
      expect(again.userId).toBe(dj.userId);
      const [u] = await db.select().from(schema.user).where(eq(schema.user.id, dj.userId));
      expect(u?.role).toBe("dj");
      expect(u?.status).toBe("approved");
    });

    test("link + OTP share one per-address budget; throttled sends stay invisible", async () => {
      // 3 sends/h per address across BOTH mechanisms: 2 links + 1 OTP consume it; the 4th
      // request (either kind) is silently skipped — endpoint still succeeds, row still mints.
      const email = `combo_${Date.now().toString(36)}@itest.dev`;
      await auth.api.signInMagicLink({ body: { email }, headers: new Headers() });
      await auth.api.signInMagicLink({ body: { email }, headers: new Headers() });
      await auth.api.sendVerificationOTP({
        body: { email, type: "sign-in" },
        headers: new Headers(),
      });
      // Budget exhausted — both kinds must still return success (anti-enumeration).
      await auth.api.signInMagicLink({ body: { email }, headers: new Headers() });
      await auth.api.sendVerificationOTP({
        body: { email, type: "sign-in" },
        headers: new Headers(),
      });
      const [otpRow] = await db
        .select({ value: schema.verification.value })
        .from(schema.verification)
        .where(eq(schema.verification.identifier, `sign-in-otp-${email}`))
        .limit(1);
      expect(otpRow?.value).toBeTruthy();
    });

    test("throttled magic-link sends stay invisible: rapid repeats all succeed, tokens still mint", async () => {
      // Per-address cap is 3/h (email-throttle.ts). Sends 4-5 are silently SKIPPED — the
      // endpoint must still 200 (anti-enumeration) and BA mints the token before the send
      // callback, so the newest token remains verifiable. A visible 429/500 here would leak
      // "someone recently requested links for this address".
      const email = `throttle_${Date.now().toString(36)}@itest.dev`;
      for (let i = 0; i < 5; i++) {
        await auth.api.signInMagicLink({ body: { email }, headers: new Headers() });
      }
      const rows = await db
        .select({ id: schema.verification.identifier, value: schema.verification.value })
        .from(schema.verification);
      expect(rows.filter((r) => r.value.includes(email)).length).toBe(5);
      const d = await magicLinkSignIn(email); // 6th request: send skipped, token minted, verify OK
      createdUserIds.push(d.userId);
      expect(d.token.length).toBeGreaterThan(0);
    });

    test("an existing DJ who magic-links is NOT demoted (credential row blocks the patch)", async () => {
      const dj = await signUpDj({ approved: true });
      createdUserIds.push(dj.userId);
      const again = await magicLinkSignIn(dj.email);
      expect(again.userId).toBe(dj.userId);
      const [u] = await db.select().from(schema.user).where(eq(schema.user.id, dj.userId));
      expect(u?.role).toBe("dj");
      expect(u?.status).toBe("approved");
    });

    test("tightened guards: dancer token → 403 on DJ surfaces; approved DJ unaffected", async () => {
      const dancer = await signUpDancer();
      createdUserIds.push(dancer.userId);
      const dj = await signUpDj({ approved: true });
      createdUserIds.push(dj.userId);

      const asDancer = { headers: { Authorization: `Bearer ${dancer.token}` } };
      const asDj = { headers: { Authorization: `Bearer ${dj.token}` } };

      // /api/live/* (dj-live router mounts requireDjAuth on "*")
      expect((await djLiveRoutes.request("/status", asDancer)).status).toBe(403);
      expect((await djLiveRoutes.request("/status", asDj)).status).toBe(200);

      // /api/playlist/* — the shared-Spotify surface a dancer must never write to.
      expect(
        (
          await playlistRoutes.request("/search", {
            method: "POST",
            headers: { ...asDancer.headers, "Content-Type": "application/json" },
            body: JSON.stringify({ artist: "A", title: "T" }),
          })
        ).status,
      ).toBe(403);

      // /api/push/send (valid SendSchema body so zValidator passes and the GUARD decides —
      // /send validates before auth, so a bogus body would 400 without exercising the role check)
      expect(
        (
          await pushRoute.request("/send", {
            method: "POST",
            headers: { ...asDancer.headers, "Content-Type": "application/json" },
            body: JSON.stringify({ payload: "hi", filter: "debug" }),
          })
        ).status,
      ).toBe(403);

      // sync-fingerprints: valid token but not DJ-capable → 403 (was token-valid-only).
      expect(
        (
          await sessionsRoute.request(`/${sessionId}/sync-fingerprints`, {
            method: "POST",
            headers: { ...asDancer.headers, "Content-Type": "application/json" },
            body: JSON.stringify({ tracks: [] }),
          })
        ).status,
      ).toBe(403);

      // The journal-account guard: any authenticated user passes requireAuth surfaces — covered
      // in Slice B2/B3 blocks once /api/me exists. WS REGISTER_SESSION uses the same
      // hasDjAccess predicate (unit-tested matrix) — a dancer token falls to anonymous mode.
    });
  });

  // ==========================================================================
  // Slice B2 — client identity claims + rotation carry-over
  // ==========================================================================

  describe("client identity claims (Slice B2, real Postgres)", () => {
    const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const createdUserIds: string[] = [];

    afterAll(async () => {
      if (createdUserIds.length > 0) {
        await db.delete(schema.user).where(inArray(schema.user.id, createdUserIds));
      }
    });

    test("claim → claimed; repeat → already_yours; other account → 409; delete cascades", async () => {
      const a = await signUpDancer();
      const b = await signUpDancer();
      createdUserIds.push(a.userId, b.userId);
      const deviceId = `client_b2_${uniq()}`;
      const asA = {
        method: "POST",
        headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: deviceId }),
      };
      const asB = { ...asA, headers: { ...asA.headers, Authorization: `Bearer ${b.token}` } };

      const first = await meRoutes.request("/journal/claim", asA);
      expect(first.status).toBe(200);
      expect(((await first.json()) as { status: string }).status).toBe("claimed");

      const repeat = await meRoutes.request("/journal/claim", asA);
      expect(repeat.status).toBe(200);
      expect(((await repeat.json()) as { status: string }).status).toBe("already_yours");

      // FIRST-CLAIM-WINS: account B never takes over A's device id.
      const conflict = await meRoutes.request("/journal/claim", asB);
      expect(conflict.status).toBe(409);
      expect(((await conflict.json()) as { error: string }).error).toBe(
        "claimed_by_another_account",
      );

      // Malformed id → 400 (zod + CLIENT_ID_REGEX).
      const bad = await meRoutes.request("/journal/claim", {
        ...asA,
        body: JSON.stringify({ clientId: "not-a-client-id!" }),
      });
      expect(bad.status).toBe(400);

      // GDPR: deleting the account unwinds the mapping (FK cascade) — id becomes claimable.
      await db.delete(schema.user).where(eq(schema.user.id, a.userId));
      const rows = await db
        .select()
        .from(schema.clientIdentities)
        .where(eq(schema.clientIdentities.clientId, deviceId));
      expect(rows.length).toBe(0);
      const reclaim = await meRoutes.request("/journal/claim", asB);
      expect(reclaim.status).toBe(200);
    });

    test("device labels + unlink (B.5c): claim stores a UA label, GET lists devices, unlink drops the union", async () => {
      const d = await signUpDancer();
      createdUserIds.push(d.userId);
      const phoneId = `client_b5_phone_${uniq()}`;
      const laptopId = `client_b5_laptop_${uniq()}`;
      const auth = { Authorization: `Bearer ${d.token}`, "Content-Type": "application/json" };
      const iphoneUA =
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";

      // Claim phone (with UA) + laptop (UA-less → null label).
      const claim1 = await meRoutes.request("/journal/claim", {
        method: "POST",
        headers: { ...auth, "User-Agent": iphoneUA },
        body: JSON.stringify({ clientId: phoneId }),
      });
      expect(claim1.status).toBe(200);
      await meRoutes.request("/journal/claim", {
        method: "POST",
        headers: auth,
        body: JSON.stringify({ clientId: laptopId }),
      });

      // A like on the phone id — must vanish from the union after unlink.
      const [track] = await db
        .insert(schema.playedTracks)
        .values({ sessionId, artist: "B5", title: "Unlink Me", bpm: 100 })
        .returning({ id: schema.playedTracks.id });
      await db.insert(schema.likes).values({
        sessionId,
        clientId: phoneId,
        playedTrackId: track?.id ?? 0,
      });

      const journal = await meRoutes.request("/journal", { headers: auth });
      expect(journal.status).toBe(200);
      const body = (await journal.json()) as {
        totalLikes: number;
        devices: { clientId: string; label: string | null }[];
      };
      expect(body.totalLikes).toBe(1);
      expect(body.devices.length).toBe(2);
      expect(body.devices.find((x) => x.clientId === phoneId)?.label).toBe("iPhone · Safari");
      expect(body.devices.find((x) => x.clientId === laptopId)?.label).toBeNull();

      // Unlink the phone: row gone, like leaves the union, device row 404s on repeat.
      const unlink = await meRoutes.request(`/journal/devices/${phoneId}`, {
        method: "DELETE",
        headers: auth,
      });
      expect(unlink.status).toBe(200);
      const after = (await (await meRoutes.request("/journal", { headers: auth })).json()) as {
        totalLikes: number;
        devices: unknown[];
      };
      expect(after.totalLikes).toBe(0);
      expect(after.devices.length).toBe(1);
      const again = await meRoutes.request(`/journal/devices/${phoneId}`, {
        method: "DELETE",
        headers: auth,
      });
      expect(again.status).toBe(404);
      // The like row itself is untouched — the device reverted to anonymous history.
      const [likeRow] = await db
        .select()
        .from(schema.likes)
        .where(eq(schema.likes.clientId, phoneId));
      expect(likeRow).toBeTruthy();
    });

    test("unlink is owner-scoped: another account's device id → 404, row survives", async () => {
      const a = await signUpDancer();
      const b = await signUpDancer();
      createdUserIds.push(a.userId, b.userId);
      const deviceId = `client_b5_own_${uniq()}`;
      await meRoutes.request("/journal/claim", {
        method: "POST",
        headers: { Authorization: `Bearer ${a.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: deviceId }),
      });

      const res = await meRoutes.request(`/journal/devices/${deviceId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${b.token}` },
      });
      expect(res.status).toBe(404);
      const rows = await db
        .select()
        .from(schema.clientIdentities)
        .where(eq(schema.clientIdentities.clientId, deviceId));
      expect(rows.length).toBe(1);
    });

    test("push re-subscribe under a NEW clientId carries the old id's stage follows", async () => {
      const oldId = `client_rot_old_${uniq()}`;
      const newId = `client_rot_new_${uniq()}`;
      const stageId = `stage_rot_${uniq()}`;
      const endpoint = `https://push.example/${uniq()}`;

      await db.insert(schema.stages).values({ id: stageId, name: "Rotation Stage" });
      await db.insert(schema.stageSubscriptions).values({ stageId, clientId: oldId });
      await db
        .insert(schema.pushSubscriptions)
        .values({ endpoint, p256dh: "k", auth: "a", clientId: oldId });

      const res = await pushRoute.request("/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, keys: { p256dh: "k", auth: "a" }, clientId: newId }),
      });
      expect(res.status).toBe(200);

      // The endpoint row re-pointed AND the stage follow copied to the new id (join stays alive).
      const [pushRow] = await db
        .select({ clientId: schema.pushSubscriptions.clientId })
        .from(schema.pushSubscriptions)
        .where(eq(schema.pushSubscriptions.endpoint, endpoint));
      expect(pushRow?.clientId).toBe(newId);
      const targets = await getStagePushTargets(stageId);
      expect(targets.some((t) => t.endpoint === endpoint)).toBe(true);

      await db.delete(schema.stages).where(eq(schema.stages.id, stageId)); // cascades stage subs
      await db
        .delete(schema.pushSubscriptions)
        .where(eq(schema.pushSubscriptions.endpoint, endpoint));
    });
  });

  // ==========================================================================
  // Slice B3 — account journal: union read + account unlike + adopt-first export
  // ==========================================================================

  describe("account journal (Slice B3, real Postgres)", () => {
    const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
    const b3Session = `b3_${uniq()}`;
    const deviceA = `client_b3a_${uniq()}`;
    const deviceB = `client_b3b_${uniq()}`;
    let dancer: { userId: string; token: string; email: string };
    let auth1: { headers: Record<string, string> };
    let trackIds: number[] = [];
    let likeAOnT1 = 0;

    beforeAll(async () => {
      dancer = await signUpDancer();
      auth1 = {
        headers: { Authorization: `Bearer ${dancer.token}`, "Content-Type": "application/json" },
      };
      // Claim device A first (adopt-first tiebreak), then B.
      for (const clientId of [deviceA, deviceB]) {
        const res = await meRoutes.request("/journal/claim", {
          method: "POST",
          ...auth1,
          body: JSON.stringify({ clientId }),
        });
        expect(res.status).toBe(200);
      }

      await db.insert(schema.sessions).values({ id: b3Session, djName: "B3 DJ" });
      const tracks = await db
        .insert(schema.playedTracks)
        .values([
          {
            sessionId: b3Session,
            artist: "X",
            title: "Both Devices",
            spotifyUrl: "https://open.spotify.com/track/B3ONE",
          },
          {
            sessionId: b3Session,
            artist: "Y",
            title: "Only A",
            spotifyUrl: "https://open.spotify.com/track/B3TWO",
          },
        ])
        .returning({ id: schema.playedTracks.id });
      trackIds = tracks.map((t) => t.id);
      const [t1, t2] = trackIds;
      if (t1 === undefined || t2 === undefined) throw new Error("seed failed");
      const base = Date.now() - 10_000;
      const inserted = await db
        .insert(schema.likes)
        .values([
          // Device A likes t1 FIRST (must be the kept row of the de-duped pair)…
          {
            sessionId: b3Session,
            clientId: deviceA,
            playedTrackId: t1,
            createdAt: new Date(base),
          },
          // …device B likes the SAME play (cross-device duplicate)…
          {
            sessionId: b3Session,
            clientId: deviceB,
            playedTrackId: t1,
            createdAt: new Date(base + 1000),
          },
          // …and device A likes t2 (newest).
          {
            sessionId: b3Session,
            clientId: deviceA,
            playedTrackId: t2,
            createdAt: new Date(base + 2000),
          },
        ])
        .returning({ id: schema.likes.id });
      likeAOnT1 = inserted[0]?.id ?? 0;
    });

    afterAll(async () => {
      await db
        .delete(schema.journalPlaylists)
        .where(inArray(schema.journalPlaylists.clientId, [deviceA, deviceB]));
      await db.delete(schema.sessions).where(eq(schema.sessions.id, b3Session));
      await db.delete(schema.user).where(eq(schema.user.id, dancer.userId));
    });

    test("union read de-dupes the cross-device pair, keeps the earliest, paginates truthfully", async () => {
      const res = await meRoutes.request("/journal?limit=50", auth1);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        totalLikes: number;
        claimedCount: number;
        likes: Array<{ id: number; title: string }>;
      };
      expect(body.totalLikes).toBe(2); // 3 like rows → 2 distinct (session, play) pairs
      expect(body.claimedCount).toBe(2);
      expect(body.likes.length).toBe(2);
      expect(body.likes[0]?.title).toBe("Only A"); // newest-first page order
      const both = body.likes.find((l) => l.title === "Both Devices");
      expect(both?.id).toBe(likeAOnT1); // DISTINCT ON kept the EARLIEST like of the pair

      // Pagination consistency: page size 1 → two pages, no duplicates.
      const p1 = (await (await meRoutes.request("/journal?limit=1&offset=0", auth1)).json()) as {
        likes: Array<{ id: number }>;
        totalLikes: number;
      };
      const p2 = (await (await meRoutes.request("/journal?limit=1&offset=1", auth1)).json()) as {
        likes: Array<{ id: number }>;
      };
      expect(p1.totalLikes).toBe(2);
      expect(p1.likes[0]?.id).not.toBe(p2.likes[0]?.id);
    });

    test("adopt-first export: account adopts device A's playlist and regenerates it in place", async () => {
      resetJournalExportGuardsForTests();
      // Device A exported before the account existed (backdated past the cooldown).
      await db.insert(schema.journalPlaylists).values({
        clientId: deviceA,
        spotifyPlaylistId: "pl_deviceA",
        spotifyPlaylistUrl: "https://open.spotify.com/playlist/pl_deviceA",
        trackCount: 1,
        updatedAt: new Date(Date.now() - 120_000),
      });

      const replaceCalls: Array<{ playlistId: string; uris: string[] }> = [];
      const result = await exportJournalPlaylist(`user_${dancer.userId}`, {
        ...defaultJournalExportDeps,
        loadLikedRows: () => loadAccountLikedRows(dancer.userId),
        getPlaylistRow: () => getAccountPlaylistRow(dancer.userId),
        upsertPlaylistRow: (row) =>
          adoptOrUpsertAccountPlaylistRow(dancer.userId, {
            spotifyPlaylistId: row.spotifyPlaylistId,
            spotifyPlaylistUrl: row.spotifyPlaylistUrl,
            trackCount: row.trackCount,
          }),
        createPlaylist: async () => {
          throw new Error("create must not run — the device playlist must be ADOPTED");
        },
        replacePlaylistItems: async (playlistId, uris) => {
          replaceCalls.push({ playlistId, uris });
        },
      });

      expect(result.updated).toBe(true);
      expect(result.trackCount).toBe(2); // union: B3ONE + B3TWO (cross-device dupe collapsed)
      expect(replaceCalls[0]?.playlistId).toBe("pl_deviceA");
      expect(replaceCalls[0]?.uris).toEqual(["spotify:track:B3ONE", "spotify:track:B3TWO"]);

      const [row] = await db
        .select({
          userId: schema.journalPlaylists.userId,
          trackCount: schema.journalPlaylists.trackCount,
        })
        .from(schema.journalPlaylists)
        .where(eq(schema.journalPlaylists.clientId, deviceA));
      expect(row?.userId).toBe(dancer.userId); // adopted
      expect(row?.trackCount).toBe(2);

      // The union read now surfaces the adopted playlist.
      const read = await meRoutes.request("/journal", auth1);
      const body = (await read.json()) as { playlist: { url: string } | null };
      expect(body.playlist?.url).toBe("https://open.spotify.com/playlist/pl_deviceA");
    });

    test("account unlike removes ALL claimed rows of the (session, play) pair", async () => {
      const res = await meRoutes.request(`/journal/likes/${likeAOnT1}`, {
        method: "DELETE",
        headers: auth1.headers,
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; totalLikes: number };
      expect(body.totalLikes).toBe(1);
      const [t1] = trackIds;
      const remaining = await db
        .select()
        .from(schema.likes)
        .where(
          and(eq(schema.likes.sessionId, b3Session), eq(schema.likes.playedTrackId, t1 ?? -1)),
        );
      expect(remaining.length).toBe(0); // device B's duplicate row went too

      // Idempotent-ish: the id is gone now → 404.
      const again = await meRoutes.request(`/journal/likes/${likeAOnT1}`, {
        method: "DELETE",
        headers: auth1.headers,
      });
      expect(again.status).toBe(404);
    });
  });

  // ==========================================================================
  // Telemetry ingest (product_events)
  // ==========================================================================

  describe("telemetry ingest (real Postgres)", () => {
    const ttClient = `client_tt_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

    afterAll(async () => {
      await db.delete(schema.productEvents).where(eq(schema.productEvents.clientId, ttClient));
    });

    test("valid event → 204 and the row lands", async () => {
      const res = await telemetryRoutes.request("/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event: "journal_opened",
          clientId: ttClient,
          props: { totalLikes: 3 },
        }),
      });
      expect(res.status).toBe(204);
      const rows = await db
        .select()
        .from(schema.productEvents)
        .where(eq(schema.productEvents.clientId, ttClient));
      expect(rows.length).toBe(1);
      expect(rows[0]?.event).toBe("journal_opened");
      expect(rows[0]?.props).toEqual({ totalLikes: 3 });
    });

    test("unknown event → 400 and no row", async () => {
      const res = await telemetryRoutes.request("/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: "made_up", clientId: ttClient }),
      });
      expect(res.status).toBe(400);
      const rows = await db
        .select()
        .from(schema.productEvents)
        .where(eq(schema.productEvents.clientId, ttClient));
      expect(rows.length).toBe(1); // still only the valid one
    });
  });

  // ==========================================================================
  // Slice C — The Relationship Loop (follows, booth, consent, thanks, sweep)
  // ==========================================================================
  describe("relationship loop (Slice C, real Postgres)", () => {
    const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

    describe("follows + preferences + unsubscribe", () => {
      let dj: { userId: string; token: string; email: string };
      let djSlug = "";
      let dancer: { userId: string; token: string; email: string };
      let asDancer: Record<string, string>;
      let asDj: Record<string, string>;

      beforeAll(async () => {
        dj = await signUpDj({ approved: true, name: `SliceC DJ ${uniq()}` });
        const [row] = await db
          .select({ slug: schema.user.slug })
          .from(schema.user)
          .where(eq(schema.user.id, dj.userId))
          .limit(1);
        djSlug = row?.slug ?? "";
        expect(djSlug.length).toBeGreaterThan(0);
        dancer = await signUpDancer();
        asDancer = {
          Authorization: `Bearer ${dancer.token}`,
          "Content-Type": "application/json",
        };
        asDj = { Authorization: `Bearer ${dj.token}`, "Content-Type": "application/json" };
      });

      test("PUT follow is idempotent (PK) and GET lists it with the next UPCOMING gig", async () => {
        await db.insert(schema.djGigs).values([
          { djUserId: dj.userId, gigDate: "2000-01-01", title: "Past gig" },
          { djUserId: dj.userId, gigDate: "2099-05-01", title: "Future far" },
          { djUserId: dj.userId, gigDate: "2099-01-15", title: "Future near" },
        ]);
        for (const _ of [1, 2]) {
          const res = await meRoutes.request(`/follows/${djSlug}`, {
            method: "PUT",
            headers: asDancer,
            body: JSON.stringify({ source: "interstitial" }),
          });
          expect(res.status).toBe(200);
        }
        const edges = await db
          .select()
          .from(schema.djFollows)
          .where(
            and(
              eq(schema.djFollows.userId, dancer.userId),
              eq(schema.djFollows.djUserId, dj.userId),
            ),
          );
        expect(edges.length).toBe(1);
        expect(edges[0]?.source).toBe("interstitial");

        const list = await meRoutes.request("/follows", { headers: asDancer });
        expect(list.status).toBe(200);
        const body = (await list.json()) as {
          follows: { slug: string; djName: string; nextGig: string | null }[];
        };
        const mine = body.follows.find((f) => f.slug === djSlug);
        expect(mine).toBeDefined();
        expect(mine?.nextGig).toBe("2099-01-15"); // min upcoming, past excluded
      });

      test("unknown slug → 404; self-follow → 400; unknown source → 400", async () => {
        const unknown = await meRoutes.request(`/follows/no-such-slug-${uniq()}`, {
          method: "PUT",
          headers: asDancer,
          body: JSON.stringify({}),
        });
        expect(unknown.status).toBe(404);

        const self = await meRoutes.request(`/follows/${djSlug}`, {
          method: "PUT",
          headers: asDj,
          body: JSON.stringify({}),
        });
        expect(self.status).toBe(400);

        const badSource = await meRoutes.request(`/follows/${djSlug}`, {
          method: "PUT",
          headers: asDancer,
          body: JSON.stringify({ source: "hacker" }),
        });
        expect(badSource.status).toBe(400);
      });

      test("preferences: consent is timestamped; djDigest is DJ-gated (dancer → 403)", async () => {
        const put = await meRoutes.request("/preferences", {
          method: "PUT",
          headers: asDancer,
          body: JSON.stringify({ recapEmails: true }),
        });
        expect(put.status).toBe(200);
        const [prefRow] = await db
          .select()
          .from(schema.emailPreferences)
          .where(eq(schema.emailPreferences.userId, dancer.userId))
          .limit(1);
        expect(prefRow?.recapOptInAt).toBeInstanceOf(Date); // the GDPR consent proof

        const get = await meRoutes.request("/preferences", { headers: asDancer });
        const prefs = (await get.json()) as {
          recapEmails: boolean;
          djDigest: boolean;
          djDigestAvailable: boolean;
        };
        expect(prefs.recapEmails).toBe(true);
        expect(prefs.djDigestAvailable).toBe(false); // dancers never see the digest surface

        const dancerDigest = await meRoutes.request("/preferences", {
          method: "PUT",
          headers: asDancer,
          body: JSON.stringify({ djDigest: true }),
        });
        expect(dancerDigest.status).toBe(403);

        const djDigest = await meRoutes.request("/preferences", {
          method: "PUT",
          headers: asDj,
          body: JSON.stringify({ djDigest: true }),
        });
        expect(djDigest.status).toBe(200);
      });

      test("unsubscribe round-trip: the one-click POST (form shape) clears exactly that consent", async () => {
        const token = signUnsubToken(dancer.userId, "recap");
        for (const _ of [1, 2]) {
          // idempotent — a re-POST from a mail provider must stay 204
          const res = await emailRoutes.request(`/unsubscribe?token=${encodeURIComponent(token)}`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: "List-Unsubscribe=One-Click",
          });
          expect(res.status).toBe(204);
        }
        const [prefRow] = await db
          .select()
          .from(schema.emailPreferences)
          .where(eq(schema.emailPreferences.userId, dancer.userId))
          .limit(1);
        expect(prefRow?.recapOptInAt).toBeNull();
      });

      test("unfollow is idempotent; deleting the account cascades edges + preferences", async () => {
        for (const _ of [1, 2]) {
          const res = await meRoutes.request(`/follows/${djSlug}`, {
            method: "DELETE",
            headers: asDancer,
          });
          expect(res.status).toBe(200);
        }
        // re-follow, then hard-delete the dancer (the Better Auth flow ends in this row delete)
        await meRoutes.request(`/follows/${djSlug}`, {
          method: "PUT",
          headers: asDancer,
          body: JSON.stringify({}),
        });
        await db.delete(schema.user).where(eq(schema.user.id, dancer.userId));
        const edges = await db
          .select()
          .from(schema.djFollows)
          .where(eq(schema.djFollows.userId, dancer.userId));
        expect(edges.length).toBe(0);
        const prefRows = await db
          .select()
          .from(schema.emailPreferences)
          .where(eq(schema.emailPreferences.userId, dancer.userId));
        expect(prefRows.length).toBe(0);
      });
    });

    describe("booth + gigs (owner routes + public payload)", () => {
      let dj: { userId: string; token: string };
      let djSlug = "";
      let asDj: Record<string, string>;

      beforeAll(async () => {
        dj = await signUpDj({ approved: true, name: `Booth DJ ${uniq()}` });
        const [row] = await db
          .select({ slug: schema.user.slug })
          .from(schema.user)
          .where(eq(schema.user.id, dj.userId))
          .limit(1);
        djSlug = row?.slug ?? "";
        asDj = { Authorization: `Bearer ${dj.token}`, "Content-Type": "application/json" };
      });

      test("bio + gigs land on the public payload (upcoming only); follower count is toggle-gated", async () => {
        const patch = await djRoute.request("/me/booth", {
          method: "PATCH",
          headers: asDj,
          body: JSON.stringify({ bio: "Bluesy after midnight." }),
        });
        expect(patch.status).toBe(200);
        const gig = await djRoute.request("/me/gigs", {
          method: "POST",
          headers: asDj,
          body: JSON.stringify({
            date: "2099-01-15",
            title: "Budafest",
            city: "Budapest",
            url: "https://budafest.example",
          }),
        });
        expect(gig.status).toBe(200);
        const pastGig = await djRoute.request("/me/gigs", {
          method: "POST",
          headers: asDj,
          body: JSON.stringify({ date: "2001-01-01", title: "Ancient" }),
        });
        expect(pastGig.status).toBe(200);

        const pub1 = await djRoute.request(`/${djSlug}`);
        expect(pub1.status).toBe(200);
        const body1 = (await pub1.json()) as {
          bio: string | null;
          gigs: { title: string }[];
          followerCount?: number;
        };
        expect(body1.bio).toBe("Bluesy after midnight.");
        expect(body1.gigs.map((g) => g.title)).toEqual(["Budafest"]); // past gig hidden
        expect(body1.followerCount).toBeUndefined(); // default hidden

        // A follower + the toggle → the count appears (mutation invalidates the cache).
        const follower = await signUpDancer();
        await meRoutes.request(`/follows/${djSlug}`, {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${follower.token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ source: "booth" }),
        });
        const toggle = await djRoute.request("/me/booth", {
          method: "PATCH",
          headers: asDj,
          body: JSON.stringify({ showFollowerCount: true }),
        });
        expect(toggle.status).toBe(200);
        const pub2 = await djRoute.request(`/${djSlug}`);
        const body2 = (await pub2.json()) as { followerCount?: number };
        expect(body2.followerCount).toBe(1);

        // Owner view always carries the count + ALL gigs (incl. past).
        const mine = await djRoute.request("/me/booth", { headers: asDj });
        const mineBody = (await mine.json()) as {
          followerCount: number;
          gigs: { title: string }[];
        };
        expect(mineBody.followerCount).toBe(1);
        expect(mineBody.gigs.map((g) => g.title).sort()).toEqual(["Ancient", "Budafest"]);
      });

      test("gig ownership lives in the WHERE — another DJ's delete is a 404", async () => {
        const [gigRow] = await db
          .select({ id: schema.djGigs.id })
          .from(schema.djGigs)
          .where(eq(schema.djGigs.djUserId, dj.userId))
          .limit(1);
        expect(gigRow).toBeDefined();
        const other = await signUpDj({ approved: true, name: `Other DJ ${uniq()}` });
        const foreign = await djRoute.request(`/me/gigs/${gigRow?.id}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${other.token}` },
        });
        expect(foreign.status).toBe(404);
        const own = await djRoute.request(`/me/gigs/${gigRow?.id}`, {
          method: "DELETE",
          headers: asDj,
        });
        expect(own.status).toBe(200);
      });
    });

    describe("session thanks", () => {
      const thanksSession = `sc_thanks_${uniq()}`;
      const device = `client_thanks_${uniq()}`;

      beforeAll(async () => {
        await db.insert(schema.sessions).values({ id: thanksSession, djName: "Thanks DJ" });
      });

      test("one thanks per device per session (unique absorbs repeats); 404/400 guards", async () => {
        for (const _ of [1, 2]) {
          const res = await clientRoutes.request(`/${device}/sessions/${thanksSession}/thanks`, {
            method: "POST",
          });
          expect(res.status).toBe(200);
        }
        const rows = await db
          .select()
          .from(schema.sessionThanks)
          .where(eq(schema.sessionThanks.sessionId, thanksSession));
        expect(rows.length).toBe(1);

        const unknown = await clientRoutes.request(
          `/${device}/sessions/no_such_session_${uniq()}/thanks`,
          { method: "POST" },
        );
        expect(unknown.status).toBe(404);

        const badClient = await clientRoutes.request(
          `/not-a-client-id/sessions/${thanksSession}/thanks`,
          { method: "POST" },
        );
        expect(badClient.status).toBe(400);
      });
    });

    describe("recap sweep (fake mailer DI)", () => {
      // A far-future time bubble isolates the sweep's age-window queries from every other
      // session this suite (or a local dev DB) has ever created.
      const NOW = new Date(2050, 0, 10, 10, 0, 0); // 10:00 local — inside the send window
      const endedAt = new Date(2050, 0, 10, 0, 0, 0); // 10h before NOW → past the 8h floor
      const startedAt = new Date(2050, 0, 9, 21, 0, 0);

      interface Sent {
        kind: "recap" | "digest";
        to: string;
        personalTotal?: number;
        boothUrl?: string | null;
        thanksCount?: number;
        newFollowers?: number;
        idempotencyKey: string;
      }

      function makeDeps(sent: Sent[], nowOverride: Date = NOW): RecapSweepDeps {
        return {
          now: () => nowOverride,
          hasLiveSession: () => false,
          sendRecap: async (input) => {
            sent.push({
              kind: "recap",
              to: input.to,
              personalTotal: input.personalTotal,
              boothUrl: input.boothUrl,
              idempotencyKey: input.idempotencyKey,
            });
            return { delivered: true };
          },
          sendDigest: async (input) => {
            sent.push({
              kind: "digest",
              to: input.to,
              thanksCount: input.thanksCount,
              newFollowers: input.newFollowers,
              idempotencyKey: input.idempotencyKey,
            });
            return { delivered: true };
          },
          sendMarketing: async (_kind, _email, send) => {
            await send();
            return "sent";
          },
          sendPush: async () => true,
        };
      }

      test("end-to-end: consented+liked account is mailed; digest gated on consent; claim once", async () => {
        const dj = await signUpDj({ approved: true, name: `Sweep DJ ${uniq()}` });
        const [slugRow] = await db
          .select({ slug: schema.user.slug })
          .from(schema.user)
          .where(eq(schema.user.id, dj.userId))
          .limit(1);
        const consented = await signUpDancer();
        const silent = await signUpDancer(); // likes, but never consented → must NOT be mailed
        const deviceC = `client_sweep_c_${uniq()}`;
        const deviceS = `client_sweep_s_${uniq()}`;
        await db.insert(schema.clientIdentities).values([
          { clientId: deviceC, userId: consented.userId },
          { clientId: deviceS, userId: silent.userId },
        ]);
        await db.insert(schema.emailPreferences).values([
          { userId: consented.userId, recapOptInAt: new Date() },
          { userId: dj.userId, digestOptInAt: new Date() },
        ]);

        const sweepSession = `sc_sweep_${uniq()}`;
        await db.insert(schema.sessions).values({
          id: sweepSession,
          djName: "Sweep DJ",
          djUserId: dj.userId,
          startedAt,
          endedAt,
        });
        const tracks = await db
          .insert(schema.playedTracks)
          .values([
            { sessionId: sweepSession, artist: "A", title: "One", playedAt: startedAt },
            { sessionId: sweepSession, artist: "B", title: "Two", playedAt: startedAt },
            { sessionId: sweepSession, artist: "C", title: "Three", playedAt: startedAt },
          ])
          .returning({ id: schema.playedTracks.id });
        const [t1, t2, t3] = tracks.map((t) => t.id);
        if (t1 === undefined || t2 === undefined || t3 === undefined) throw new Error("seed");
        await db.insert(schema.likes).values([
          { sessionId: sweepSession, clientId: deviceC, playedTrackId: t1 },
          { sessionId: sweepSession, clientId: deviceC, playedTrackId: t2 },
          { sessionId: sweepSession, clientId: deviceS, playedTrackId: t1 },
          { sessionId: sweepSession, clientId: `client_anon_${uniq()}`, playedTrackId: t3 },
        ]);
        await db
          .insert(schema.sessionThanks)
          .values({ sessionId: sweepSession, clientId: deviceC });
        await db.insert(schema.djFollows).values({
          userId: consented.userId,
          djUserId: dj.userId,
          source: "live",
          createdAt: new Date(2050, 0, 9, 22, 0, 0), // after set start → counts as new
        });

        const sent: Sent[] = [];
        const first = await sweepRecaps(makeDeps(sent));
        expect(first.sessionsRecapped).toBeGreaterThanOrEqual(1);

        const recaps = sent.filter((s) => s.kind === "recap");
        expect(recaps.length).toBe(1); // ONLY the consented account — never the silent liker
        expect(recaps[0]?.to).toBe(consented.email);
        expect(recaps[0]?.personalTotal).toBe(2);
        expect(recaps[0]?.boothUrl ?? "").toContain(`/dj/${slugRow?.slug}`);
        expect(recaps[0]?.idempotencyKey).toBe(`recap:${sweepSession}:${consented.userId}`);

        const digests = sent.filter((s) => s.kind === "digest");
        expect(digests.length).toBe(1);
        expect(digests[0]?.to).toBe(dj.email);
        expect(digests[0]?.thanksCount).toBe(1);
        expect(digests[0]?.newFollowers).toBe(1);

        const [row] = await db
          .select({ recapProcessedAt: schema.sessions.recapProcessedAt })
          .from(schema.sessions)
          .where(eq(schema.sessions.id, sweepSession))
          .limit(1);
        expect(row?.recapProcessedAt).toBeInstanceOf(Date);

        // Second tick: the claim marker makes the session invisible — nothing re-sends.
        const sent2: Sent[] = [];
        await sweepRecaps(makeDeps(sent2));
        expect(sent2.filter((s) => s.idempotencyKey.includes(sweepSession)).length).toBe(0);
      });

      test("zombie-close: an idle open session absent from memory gets endedAt backdated", async () => {
        const zombie = `sc_zombie_${uniq()}`;
        const zStart = new Date(2050, 0, 9, 1, 0, 0); // 33h before NOW
        const lastPlay = new Date(2050, 0, 9, 2, 0, 0);
        await db
          .insert(schema.sessions)
          .values({ id: zombie, djName: "Zombie DJ", startedAt: zStart });
        await db
          .insert(schema.playedTracks)
          .values({ sessionId: zombie, artist: "Z", title: "Last", playedAt: lastPlay });

        const closed = await closeZombieSessions(makeDeps([]));
        expect(closed).toBeGreaterThanOrEqual(1);
        const [row] = await db
          .select({ endedAt: schema.sessions.endedAt })
          .from(schema.sessions)
          .where(eq(schema.sessions.id, zombie))
          .limit(1);
        expect(row?.endedAt?.getTime()).toBe(lastPlay.getTime()); // backdated to last activity
      });

      test("outside the send window: sends are skipped but zombie-close still ran", async () => {
        const out = await sweepRecaps(makeDeps([], new Date(2050, 0, 10, 15, 0, 0)));
        expect(out.sessionsRecapped).toBe(0);
      });
    });
  });
});
