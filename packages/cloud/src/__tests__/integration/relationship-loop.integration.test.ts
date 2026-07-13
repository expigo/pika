/**
 * Slice C: follows + preferences + unsubscribe, booth + gigs, session thanks, recap sweep (fake mailer DI).
 * Moved verbatim from src/__tests__/db.integration.test.ts L2822-3440 @ 2d3f846
 * (2026-07 split; only the shared uniq() helper was deduped into ./harness).
 *
 * Gated by RUN_DB_TESTS via ./harness (plain `bun test` skips). Run ISOLATED:
 * `bun run test:integration` — never bare `RUN_DB_TESTS=1 bun test` (unit files
 * mock modules process-globally). Pool teardown lives in the bunfig preload.
 */

import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { and, eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { signUnsubToken } from "../../lib/services/email-prefs";
import {
  closeZombieSessions,
  type RecapSweepDeps,
  resetRecapSweepStateForTests,
  sweepRecaps,
} from "../../lib/services/recap";
import { client as clientRoutes } from "../../routes/client";
import { dj as djRoute } from "../../routes/dj";
import { emailRoutes } from "../../routes/email";
import { meRoutes } from "../../routes/me";
import {
  ensureBaseSession,
  setupIntegrationEnv,
  signUpDancer,
  signUpDj,
  suite,
  uniq,
} from "./harness";

suite("DB integration (real Postgres)", () => {
  beforeAll(async () => {
    setupIntegrationEnv();
    await ensureBaseSession();
  });

  // ==========================================================================
  // Slice C — The Relationship Loop (follows, booth, consent, thanks, sweep)
  // ==========================================================================
  describe("relationship loop (Slice C, real Postgres)", () => {
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

      test("gig URL: bare domain gets https://; other schemes rejected; bad date is descriptive", async () => {
        // Bare domain accepted and stored https-prefixed (owner ergonomics).
        const bare = await djRoute.request("/me/gigs", {
          method: "POST",
          headers: asDj,
          body: JSON.stringify({ date: "2099-06-01", title: "Bare", url: "westie.club" }),
        });
        expect(bare.status).toBe(200);
        const bareId = ((await bare.json()) as { id: number }).id;
        const [bareRow] = await db
          .select({ url: schema.djGigs.url })
          .from(schema.djGigs)
          .where(eq(schema.djGigs.id, bareId))
          .limit(1);
        expect(bareRow?.url).toBe("https://westie.club");

        // A non-web scheme is NOT silently rewritten into a valid-looking link — it fails.
        const js = await djRoute.request("/me/gigs", {
          method: "POST",
          headers: asDj,
          body: JSON.stringify({ date: "2099-06-02", title: "XSS", url: "javascript:alert(1)" }),
        });
        expect(js.status).toBe(400);
        expect(((await js.json()) as { error: string }).error).toMatch(/web address/i);

        // A malformed date surfaces the schema message, not the generic "Invalid body".
        const badDate = await djRoute.request("/me/gigs", {
          method: "POST",
          headers: asDj,
          body: JSON.stringify({ date: "March 1st", title: "Whenever" }),
        });
        expect(badDate.status).toBe(400);
        expect(((await badDate.json()) as { error: string }).error).not.toBe("Invalid body");
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

      // The cap latch is module-level process state — a capped test must never poison the next.
      beforeEach(() => {
        resetRecapSweepStateForTests();
      });

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

      test("F1: a session capped before any send is un-claimed and recapped next window", async () => {
        const dj = await signUpDj({ approved: true, name: `Cap DJ ${uniq()}` });
        const dancer = await signUpDancer();
        const device = `client_cap_${uniq()}`;
        await db
          .insert(schema.clientIdentities)
          .values({ clientId: device, userId: dancer.userId });
        await db
          .insert(schema.emailPreferences)
          .values({ userId: dancer.userId, recapOptInAt: new Date() });
        const sid = `sc_cap_${uniq()}`;
        await db.insert(schema.sessions).values({
          id: sid,
          djName: "Cap DJ",
          djUserId: dj.userId,
          startedAt,
          endedAt,
        });
        const tracks = await db
          .insert(schema.playedTracks)
          .values([
            { sessionId: sid, artist: "A", title: "One", playedAt: startedAt },
            { sessionId: sid, artist: "B", title: "Two", playedAt: startedAt },
            { sessionId: sid, artist: "C", title: "Three", playedAt: startedAt },
          ])
          .returning({ id: schema.playedTracks.id });
        const [ct1] = tracks.map((t) => t.id);
        if (ct1 === undefined) throw new Error("seed");
        await db
          .insert(schema.likes)
          .values({ sessionId: sid, clientId: device, playedTrackId: ct1 });

        // Mailer caps immediately → zero sends for the session.
        const cappingDeps: RecapSweepDeps = {
          ...makeDeps([]),
          sendMarketing: async () => "capped",
        };
        const cappedRun = await sweepRecaps(cappingDeps);
        expect(cappedRun.capExhausted).toBe(true);
        const [after] = await db
          .select({ r: schema.sessions.recapProcessedAt })
          .from(schema.sessions)
          .where(eq(schema.sessions.id, sid))
          .limit(1);
        expect(after?.r).toBeNull(); // un-claimed, not permanently stranded

        // Same UTC day, even with a WORKING mailer: the latch keeps the tick quiet — no
        // claim/unclaim churn, no sends, no repeated warn (the budget is empty until tomorrow).
        const sameDay: Sent[] = [];
        const latchedRun = await sweepRecaps(makeDeps(sameDay));
        expect(latchedRun.capExhausted).toBe(true);
        expect(latchedRun.sessionsRecapped).toBe(0);
        expect(sameDay.length).toBe(0);

        // NEXT DAY's window (latch cleared by the day roll) → the recap actually goes out.
        const sent: Sent[] = [];
        await sweepRecaps(makeDeps(sent, new Date(2050, 0, 11, 10, 0, 0)));
        expect(sent.filter((s) => s.kind === "recap" && s.to === dancer.email).length).toBe(1);
      });

      test("F5: batched assembly gives each recipient their OWN like set (not the union)", async () => {
        const dj = await signUpDj({ approved: true, name: `Batch DJ ${uniq()}` });
        const a = await signUpDancer();
        const b = await signUpDancer();
        const da = `client_ba_${uniq()}`;
        const dbId = `client_bb_${uniq()}`;
        await db.insert(schema.clientIdentities).values([
          { clientId: da, userId: a.userId },
          { clientId: dbId, userId: b.userId },
        ]);
        await db.insert(schema.emailPreferences).values([
          { userId: a.userId, recapOptInAt: new Date() },
          { userId: b.userId, recapOptInAt: new Date() },
        ]);
        const sid = `sc_batch_${uniq()}`;
        await db.insert(schema.sessions).values({
          id: sid,
          djName: "Batch DJ",
          djUserId: dj.userId,
          startedAt,
          endedAt,
        });
        const tracks = await db
          .insert(schema.playedTracks)
          .values([
            { sessionId: sid, artist: "A", title: "One", playedAt: startedAt },
            { sessionId: sid, artist: "B", title: "Two", playedAt: startedAt },
            { sessionId: sid, artist: "C", title: "Three", playedAt: startedAt },
          ])
          .returning({ id: schema.playedTracks.id });
        const [bt1, bt2, bt3] = tracks.map((t) => t.id);
        if (bt1 === undefined || bt2 === undefined || bt3 === undefined) throw new Error("seed");
        // A loves t1,t2; B loves t1,t3 — overlap on t1. Each should see exactly their own two.
        await db.insert(schema.likes).values([
          { sessionId: sid, clientId: da, playedTrackId: bt1 },
          { sessionId: sid, clientId: da, playedTrackId: bt2 },
          { sessionId: sid, clientId: dbId, playedTrackId: bt1 },
          { sessionId: sid, clientId: dbId, playedTrackId: bt3 },
        ]);

        const sent: Sent[] = [];
        await sweepRecaps(makeDeps(sent));
        const recaps = sent.filter((s) => s.kind === "recap");
        expect(recaps.find((r) => r.to === a.email)?.personalTotal).toBe(2);
        expect(recaps.find((r) => r.to === b.email)?.personalTotal).toBe(2);
      });
    });
  });
});
