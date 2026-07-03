/**
 * Journal service unit tests — pure URI resolution + the DI export orchestration.
 * No DB, no network, no mock.module (process-global, leaks between files): all I/O arrives
 * through `JournalExportDeps` fakes. Real-Postgres query coverage lives in the gated
 * integration suite (src/__tests__/db.integration.test.ts).
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { LIMITS } from "@pika/shared";
import {
  exportJournalPlaylist,
  JOURNAL_PLAYLIST_DESCRIPTION,
  JOURNAL_PLAYLIST_NAME,
  JournalEmptyError,
  JournalExportCooldownError,
  JournalExportDailyCapError,
  type JournalExportDeps,
  JournalExportInFlightError,
  type JournalLikeRow,
  JournalNoMatchesError,
  linkFallbackUrl,
  resetJournalExportGuardsForTests,
  resolveJournalUris,
} from "./journal";
import { SpotifyPlaylistNotFoundError, SpotifyRateLimitError } from "./spotify";

// ---------------------------------------------------------------------------
// resolveJournalUris (pure)
// ---------------------------------------------------------------------------

describe("resolveJournalUris", () => {
  const row = (spotifyUrl: string | null, linkProviderId: string | null): JournalLikeRow => ({
    spotifyUrl,
    linkProviderId,
  });

  test("snapshot URL beats the link id", () => {
    const out = resolveJournalUris([row("https://open.spotify.com/track/AAA?si=x", "BBB")]);
    expect(out.uris).toEqual(["spotify:track:AAA"]);
    expect(out.matchedCount).toBe(1);
    expect(out.totalLiked).toBe(1);
  });

  test("unparseable URL falls back to the trusted link id", () => {
    const out = resolveJournalUris([row("https://example.com/nope", "BBB")]);
    expect(out.uris).toEqual(["spotify:track:BBB"]);
  });

  test("rows with no identity are counted but not exported", () => {
    const out = resolveJournalUris([row(null, null), row(null, null)]);
    expect(out.uris).toEqual([]);
    expect(out.matchedCount).toBe(0);
    expect(out.totalLiked).toBe(2);
  });

  test("malformed link ids never become URIs", () => {
    const out = resolveJournalUris([row(null, "not a valid id!")]);
    expect(out.uris).toEqual([]);
  });

  test("duplicate ids collapse to the first occurrence (first-like order)", () => {
    const out = resolveJournalUris([
      row("https://open.spotify.com/track/AAA", null),
      row(null, "BBB"),
      row("https://open.spotify.com/track/AAA", null),
    ]);
    expect(out.uris).toEqual(["spotify:track:AAA", "spotify:track:BBB"]);
    expect(out.matchedCount).toBe(2);
    expect(out.totalLiked).toBe(3);
  });

  test("caps at JOURNAL_EXPORT_MAX_URIS, earliest first; matchedCount reports pre-cap", () => {
    const rows = Array.from({ length: LIMITS.JOURNAL_EXPORT_MAX_URIS + 1 }, (_, i) =>
      row(null, `id${i}`),
    );
    const out = resolveJournalUris(rows);
    expect(out.uris.length).toBe(LIMITS.JOURNAL_EXPORT_MAX_URIS);
    expect(out.uris[0]).toBe("spotify:track:id0");
    expect(out.matchedCount).toBe(LIMITS.JOURNAL_EXPORT_MAX_URIS + 1);
  });

  test("empty input → zeros", () => {
    expect(resolveJournalUris([])).toEqual({ uris: [], matchedCount: 0, totalLiked: 0 });
  });
});

describe("linkFallbackUrl", () => {
  test("stored provider URL wins", () => {
    expect(linkFallbackUrl("https://open.spotify.com/track/X", "Y")).toBe(
      "https://open.spotify.com/track/X",
    );
  });
  test("builds a URL from a valid id", () => {
    expect(linkFallbackUrl(null, "AAA")).toBe("https://open.spotify.com/track/AAA");
  });
  test("rejects malformed ids and double-nulls", () => {
    expect(linkFallbackUrl(null, "bad id!")).toBeNull();
    expect(linkFallbackUrl(null, null)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// exportJournalPlaylist (DI)
// ---------------------------------------------------------------------------

const NOW = Date.UTC(2026, 6, 3, 12, 0, 0);

interface FakeLog {
  created: Array<{ name: string; uris: string[]; description?: string; isPublic?: boolean }>;
  replaced: Array<{ playlistId: string; uris: string[] }>;
  upserts: Array<{
    clientId: string;
    spotifyPlaylistId: string;
    spotifyPlaylistUrl: string;
    trackCount: number;
  }>;
}

function makeDeps(overrides: Partial<JournalExportDeps> = {}): {
  deps: JournalExportDeps;
  log: FakeLog;
} {
  const log: FakeLog = { created: [], replaced: [], upserts: [] };
  const deps: JournalExportDeps = {
    loadLikedRows: async () => [
      { spotifyUrl: "https://open.spotify.com/track/AAA", linkProviderId: null },
    ],
    getPlaylistRow: async () => null,
    upsertPlaylistRow: async (rowToUpsert) => {
      log.upserts.push(rowToUpsert);
    },
    createPlaylist: async (name, uris, description, opts) => {
      log.created.push({ name, uris, description, isPublic: opts?.isPublic });
      return { playlistId: "pl_new", playlistUrl: "https://open.spotify.com/playlist/pl_new" };
    },
    replacePlaylistItems: async (playlistId, uris) => {
      log.replaced.push({ playlistId, uris });
    },
    now: () => NOW,
    ...overrides,
  };
  return { deps, log };
}

describe("exportJournalPlaylist", () => {
  beforeEach(() => {
    resetJournalExportGuardsForTests();
  });

  test("create path: no existing row → createPlaylist + upsert, updated:false", async () => {
    const { deps, log } = makeDeps();
    const result = await exportJournalPlaylist("client_a", deps);
    expect(result).toEqual({
      playlistUrl: "https://open.spotify.com/playlist/pl_new",
      trackCount: 1,
      matchedCount: 1,
      totalLiked: 1,
      updated: false,
    });
    expect(log.created).toEqual([
      {
        name: JOURNAL_PLAYLIST_NAME,
        uris: ["spotify:track:AAA"],
        description: JOURNAL_PLAYLIST_DESCRIPTION,
        isPublic: false, // journal playlists are link-only (unlisted)
      },
    ]);
    expect(log.replaced.length).toBe(0);
    expect(log.upserts).toEqual([
      {
        clientId: "client_a",
        spotifyPlaylistId: "pl_new",
        spotifyPlaylistUrl: "https://open.spotify.com/playlist/pl_new",
        trackCount: 1,
      },
    ]);
  });

  test("regenerate path: existing row past cooldown → replace in place, updated:true", async () => {
    const { deps, log } = makeDeps({
      getPlaylistRow: async () => ({
        spotifyPlaylistId: "pl_old",
        spotifyPlaylistUrl: "https://open.spotify.com/playlist/pl_old",
        updatedAt: new Date(NOW - 120_000),
      }),
    });
    const result = await exportJournalPlaylist("client_a", deps);
    expect(result.updated).toBe(true);
    expect(result.playlistUrl).toBe("https://open.spotify.com/playlist/pl_old");
    expect(log.replaced).toEqual([{ playlistId: "pl_old", uris: ["spotify:track:AAA"] }]);
    expect(log.created.length).toBe(0);
    expect(log.upserts[0]?.spotifyPlaylistId).toBe("pl_old");
  });

  test("404-recreate: replace throws PlaylistNotFound → create-new, upsert stores the NEW id", async () => {
    const { deps, log } = makeDeps({
      getPlaylistRow: async () => ({
        spotifyPlaylistId: "pl_deleted",
        spotifyPlaylistUrl: "https://open.spotify.com/playlist/pl_deleted",
        updatedAt: new Date(NOW - 120_000),
      }),
      replacePlaylistItems: async () => {
        throw new SpotifyPlaylistNotFoundError();
      },
    });
    const result = await exportJournalPlaylist("client_a", deps);
    expect(result.updated).toBe(true);
    expect(result.playlistUrl).toBe("https://open.spotify.com/playlist/pl_new");
    expect(log.created.length).toBe(1);
    expect(log.created[0]?.isPublic).toBe(false); // recreate stays link-only too
    expect(log.upserts[0]?.spotifyPlaylistId).toBe("pl_new");
  });

  test("cooldown: 30s since last export → CooldownError with retryAfterSec 30", async () => {
    const { deps } = makeDeps({
      getPlaylistRow: async () => ({
        spotifyPlaylistId: "pl_old",
        spotifyPlaylistUrl: "u",
        updatedAt: new Date(NOW - 30_000),
      }),
    });
    expect(exportJournalPlaylist("client_a", deps)).rejects.toThrow(JournalExportCooldownError);
    resetJournalExportGuardsForTests();
    try {
      await exportJournalPlaylist("client_a", deps);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(JournalExportCooldownError);
      expect((e as JournalExportCooldownError).retryAfterSec).toBe(30);
    }
  });

  test("cooldown boundary: exactly 60s elapsed → proceeds", async () => {
    const { deps, log } = makeDeps({
      getPlaylistRow: async () => ({
        spotifyPlaylistId: "pl_old",
        spotifyPlaylistUrl: "u",
        updatedAt: new Date(NOW - LIMITS.JOURNAL_EXPORT_COOLDOWN_MS),
      }),
    });
    await exportJournalPlaylist("client_a", deps);
    expect(log.replaced.length).toBe(1);
  });

  test("empty journal → JournalEmptyError", async () => {
    const { deps } = makeDeps({ loadLikedRows: async () => [] });
    expect(exportJournalPlaylist("client_a", deps)).rejects.toThrow(JournalEmptyError);
  });

  test("likes without identity → JournalNoMatchesError carrying totalLiked", async () => {
    const { deps } = makeDeps({
      loadLikedRows: async () => [
        { spotifyUrl: null, linkProviderId: null },
        { spotifyUrl: null, linkProviderId: null },
      ],
    });
    try {
      await exportJournalPlaylist("client_a", deps);
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(JournalNoMatchesError);
      expect((e as JournalNoMatchesError).totalLiked).toBe(2);
    }
  });

  test("in-flight: concurrent export for the same client is rejected; released after", async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const { deps } = makeDeps({
      createPlaylist: async () => {
        await blocked;
        return { playlistId: "pl_new", playlistUrl: "u" };
      },
    });
    const first = exportJournalPlaylist("client_a", deps);
    expect(exportJournalPlaylist("client_a", deps)).rejects.toThrow(JournalExportInFlightError);
    release?.();
    await first;
    // Lock released → a third call passes.
    const { deps: freshDeps } = makeDeps();
    await exportJournalPlaylist("client_a", freshDeps);
  });

  test("daily cap: budget exhausts, then DailyCapError", async () => {
    for (let i = 0; i < LIMITS.JOURNAL_EXPORT_GLOBAL_DAILY_MAX; i++) {
      const { deps } = makeDeps();
      await exportJournalPlaylist(`client_${i}`, deps);
    }
    const { deps } = makeDeps();
    expect(exportJournalPlaylist("client_over", deps)).rejects.toThrow(JournalExportDailyCapError);
  });

  test("Spotify errors propagate and the row is NOT upserted", async () => {
    const { deps, log } = makeDeps({
      createPlaylist: async () => {
        throw new SpotifyRateLimitError(3000);
      },
    });
    expect(exportJournalPlaylist("client_a", deps)).rejects.toThrow(SpotifyRateLimitError);
    expect(log.upserts.length).toBe(0);
  });
});
