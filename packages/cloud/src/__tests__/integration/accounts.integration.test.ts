/**
 * Dancer accounts Slice B: magic-link/OTP signup (B1), client-identity claims (B2), account journal (B3).
 * Moved verbatim from src/__tests__/db.integration.test.ts L2238-2774 @ 2d3f846
 * (2026-07 split; only the shared uniq() helper was deduped into ./harness).
 *
 * Gated by RUN_DB_TESTS via ./harness (plain `bun test` skips). Run ISOLATED:
 * `bun run test:integration` — never bare `RUN_DB_TESTS=1 bun test` (unit files
 * mock modules process-globally). Pool teardown lives in the bunfig preload.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../../db";
import { auth } from "../../lib/auth/server";
import { getStagePushTargets } from "../../lib/persistence/push-targets";
import {
  adoptOrUpsertAccountPlaylistRow,
  defaultJournalExportDeps,
  exportJournalPlaylist,
  getAccountPlaylistRow,
  loadAccountLikedRows,
  resetJournalExportGuardsForTests,
} from "../../lib/services/journal";
import { djLiveRoutes } from "../../routes/dj-live";
import { meRoutes } from "../../routes/me";
import { playlistRoutes } from "../../routes/playlist";
import { push as pushRoute } from "../../routes/push";
import { sessions as sessionsRoute } from "../../routes/sessions";
import {
  ensureBaseSession,
  magicLinkSignIn,
  otpSignIn,
  baseSessionId as sessionId,
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
});
