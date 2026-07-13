/**
 * REST route surface (auth signup/signin, push, recap reads, history, stats, dj) + telemetry ingest.
 * Moved verbatim from src/__tests__/db.integration.test.ts L428-683 + L2776-2820 @ 2d3f846
 * (2026-07 split; only the shared uniq() helper was deduped into ./harness).
 *
 * Gated by RUN_DB_TESTS via ./harness (plain `bun test` skips). Run ISOLATED:
 * `bun run test:integration` — never bare `RUN_DB_TESTS=1 bun test` (unit files
 * mock modules process-globally). Pool teardown lives in the bunfig preload.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { auth } from "../../lib/auth/server";
import { adminRoutes as adminRoute } from "../../routes/admin";
import { client as clientRoutes } from "../../routes/client";
import { dj as djRoute } from "../../routes/dj";
import { push as pushRoute } from "../../routes/push";
import { sessions as sessionsRoute } from "../../routes/sessions";
import { stats as statsRoute } from "../../routes/stats";
import { telemetryRoutes } from "../../routes/telemetry";
import { ensureBaseSession, setupIntegrationEnv, signUpDj, suite, uniq } from "./harness";

suite("DB integration (real Postgres)", () => {
  beforeAll(async () => {
    setupIntegrationEnv();
    await ensureBaseSession();
  });

  // ==========================================================================
  // 3. REST routes against real Postgres (covers the shipped route code that the
  //    unit suite can only test via mocks/in-memory paths).
  // ==========================================================================

  describe("REST routes (real Postgres)", () => {
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
});
