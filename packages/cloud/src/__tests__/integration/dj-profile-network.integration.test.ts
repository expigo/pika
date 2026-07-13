/**
 * DJ profile management: publish toggle + external playlists CRUD + admin title backfill.
 * Moved verbatim from src/__tests__/db.integration.test.ts L1245-1397 @ 2d3f846
 * (2026-07 split; only the shared uniq() helper was deduped into ./harness).
 *
 * QUARANTINE: the two tests here fire REAL Spotify oEmbed fetches (offline-tolerant
 * asserts). If only this file flakes on a rapid re-run, wait a few minutes (throttle)
 * and re-run it solo:
 *   RUN_DB_TESTS=1 bun test src/__tests__/integration/dj-profile-network.integration.test.ts
 *
 * Gated by RUN_DB_TESTS via ./harness (plain `bun test` skips). Run ISOLATED:
 * `bun run test:integration` — never bare `RUN_DB_TESTS=1 bun test` (unit files
 * mock modules process-globally). Pool teardown lives in the bunfig preload.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "../../db";
import { adminRoutes as adminRoute } from "../../routes/admin";
import { dj as djRoute } from "../../routes/dj";
import { ensureBaseSession, setupIntegrationEnv, signUpDj, suite } from "./harness";

suite("DB integration (real Postgres)", () => {
  beforeAll(async () => {
    setupIntegrationEnv();
    await ensureBaseSession();
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
          playlists: Array<{ id: number; spotifyPlaylistId: string; title: string | null }>;
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
      // D.1: the payload carries the oEmbed title field. Its VALUE is network-dependent
      // (string when the oEmbed fetch succeeded, null offline/failed) — assert presence only.
      expect(pub.playlists[0]).toHaveProperty("title");

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

    test("admin title backfill scans titleless rows, tolerates fetch failure, and audits", async () => {
      const boss = await signUpDj({ approved: true, admin: true, name: `BackfillAdmin ${mk()}` });
      const dj = await signUpDj({ approved: true, name: `EmbedDJ ${mk()}` });
      // A pre-D.1 row: no title; an unfetchable (nonexistent) id — the oEmbed fetch lawfully
      // fails (404 online, network error offline) and the title must simply stay null.
      const fakeId = `PIKAFAKE${mk()}`
        .replace(/[^a-zA-Z0-9]/g, "")
        .padEnd(22, "0")
        .slice(0, 22);
      await db.insert(schema.djPlaylists).values({
        djUserId: dj.userId,
        url: `https://open.spotify.com/playlist/${fakeId}`,
        spotifyPlaylistId: fakeId,
      });

      const res = await adminRoute.request("/playlists/backfill-titles", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${boss.token}` },
        body: JSON.stringify({ limit: 200 }),
      });
      expect(res.status).toBe(200);
      const body = (await res.json()) as { success: boolean; scanned: number };
      expect(body.success).toBe(true);
      // ≥, not ===: the suite runs against a shared dev DB that may hold other titleless rows.
      expect(body.scanned).toBeGreaterThanOrEqual(1);

      const [row] = await db
        .select({ title: schema.djPlaylists.title })
        .from(schema.djPlaylists)
        .where(eq(schema.djPlaylists.spotifyPlaylistId, fakeId));
      expect(row?.title).toBeNull();

      // The action is audited (recordAdminAction is fire-and-forget — poll briefly).
      let audited = false;
      for (let i = 0; i < 10 && !audited; i++) {
        const rows = await db
          .select({ id: schema.adminAudit.id })
          .from(schema.adminAudit)
          .where(eq(schema.adminAudit.action, "playlists.backfillTitles"))
          .limit(1);
        audited = rows.length > 0;
        if (!audited) await new Promise((r) => setTimeout(r, 50));
      }
      expect(audited).toBe(true);

      await db.delete(schema.user).where(inArray(schema.user.id, [boss.userId, dj.userId]));
    });
  });
});
