/**
 * Dancer journal: read/pagination/retro-enrichment, export lifecycle (DI), like removal.
 * Moved verbatim from src/__tests__/db.integration.test.ts L1882-2236 @ 2d3f846
 * (2026-07 split; only the shared uniq() helper was deduped into ./harness).
 *
 * Gated by RUN_DB_TESTS via ./harness (plain `bun test` skips). Run ISOLATED:
 * `bun run test:integration` — never bare `RUN_DB_TESTS=1 bun test` (unit files
 * mock modules process-globally). Pool teardown lives in the bunfig preload.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "../../db";
import {
  defaultJournalExportDeps,
  exportJournalPlaylist,
  JournalExportCooldownError,
  resetJournalExportGuardsForTests,
} from "../../lib/services/journal";
import { SpotifyPlaylistNotFoundError } from "../../lib/services/spotify";
import { client as clientRoutes } from "../../routes/client";
import { ensureBaseSession, setupIntegrationEnv, suite, uniq } from "./harness";

suite("DB integration (real Postgres)", () => {
  beforeAll(async () => {
    setupIntegrationEnv();
    await ensureBaseSession();
  });

  // ==========================================================================
  // Journal read: real count, pagination + retro-enrichment (Slice A)
  // ==========================================================================

  describe("journal read: count, pagination + retro-enrichment", () => {
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
});
