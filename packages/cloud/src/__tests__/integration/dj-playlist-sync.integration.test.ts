/**
 * DJ set-playlist sync (session playlist id -> recap payload).
 * Moved verbatim from src/__tests__/db.integration.test.ts L1399-1514 @ 2d3f846
 * (2026-07 split; only the shared uniq() helper was deduped into ./harness).
 *
 * Gated by RUN_DB_TESTS via ./harness (plain `bun test` skips). Run ISOLATED:
 * `bun run test:integration` — never bare `RUN_DB_TESTS=1 bun test` (unit files
 * mock modules process-globally). Pool teardown lives in the bunfig preload.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { dj as djRoute } from "../../routes/dj";
import { sessions as sessionsRoute } from "../../routes/sessions";
import { ensureBaseSession, setupIntegrationEnv, signUpDj, suite } from "./harness";

suite("DB integration (real Postgres)", () => {
  beforeAll(async () => {
    setupIntegrationEnv();
    await ensureBaseSession();
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
});
