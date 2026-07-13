/**
 * Track D Spotify tables (connections/pollers/crypto/now-playing) + playlist /confirm + Songs Catalog reads/seed.
 * Moved verbatim from src/__tests__/db.integration.test.ts L946-1061 + L1181-1244 + L1516-1880 @ 2d3f846
 * (2026-07 split; only the shared uniq() helper was deduped into ./harness).
 *
 * Gated by RUN_DB_TESTS via ./harness (plain `bun test` skips). Run ISOLATED:
 * `bun run test:integration` — never bare `RUN_DB_TESTS=1 bun test` (unit files
 * mock modules process-globally). Pool teardown lives in the bunfig preload.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { getTrackKey } from "@pika/shared";
import { and, eq, inArray } from "drizzle-orm";
import { db, schema } from "../../db";
import { decryptSecret, encryptSecret } from "../../lib/crypto";
import { createLiveSession } from "../../lib/live-session";
import { fetchNowPlaying, getConnectionStatus, SpotifyAuthError } from "../../lib/services/spotify";
import { getSpotifyFeatures, seedFromPlaylist } from "../../lib/services/spotifyMatch";
import { adminRoutes as adminRoute } from "../../routes/admin";
import { playlistRoutes } from "../../routes/playlist";
import { ensureBaseSession, setupIntegrationEnv, signUpDj, suite } from "./harness";

suite("DB integration (real Postgres)", () => {
  beforeAll(async () => {
    setupIntegrationEnv();
    await ensureBaseSession();
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
      expect(seeded.trackCount).toBe(1);
      expect(seeded.playlistId).not.toBeNull();

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
});
