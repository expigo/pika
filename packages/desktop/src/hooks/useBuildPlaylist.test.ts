// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above declarations, so anything the factories use as a *value* (the error
// class) must be created via vi.hoisted; the fn spies live there too (same idiom as
// useSpotifyMatcher.test.ts). Unlike the modal RTL suite's status-less Error stub, this
// PlaylistApiError carries a real `status` so the 401/403 auth gate is actually exercised.
const h = vi.hoisted(() => {
  class PlaylistApiError extends Error {
    constructor(
      public readonly status: number,
      msg: string,
    ) {
      super(msg);
    }
  }
  return {
    PlaylistApiError,
    searchSpotify: vi.fn(),
    resolveSpotifyTrack: vi.fn(),
    resolveSpotifyTracks: vi.fn(),
    createSpotifyPlaylist: vi.fn(),
    syncSessionPlaylist: vi.fn(),
    unsyncSessionPlaylist: vi.fn(),
    getSessionPlaylistUrl: vi.fn(),
    getSessionPlaylistState: vi.fn(),
    setSessionPlaylist: vi.fn(),
    setSessionPlaylistSynced: vi.fn(),
    getSessionTracksForMatching: vi.fn(),
    setTrackAlbumArt: vi.fn(),
    setTrackSpotifyMatch: vi.fn(),
  };
});

vi.mock("../services/spotifyPlaylist", () => ({
  PlaylistApiError: h.PlaylistApiError,
  parseSpotifyTrackId: (input: string) => /track[/:]([A-Za-z0-9]+)/.exec(input)?.[1] ?? null,
  searchSpotify: (...a: unknown[]) => h.searchSpotify(...a),
  resolveSpotifyTrack: (...a: unknown[]) => h.resolveSpotifyTrack(...a),
  resolveSpotifyTracks: (...a: unknown[]) => h.resolveSpotifyTracks(...a),
  createSpotifyPlaylist: (...a: unknown[]) => h.createSpotifyPlaylist(...a),
}));
vi.mock("../services/djApi", () => ({
  syncSessionPlaylist: (...a: unknown[]) => h.syncSessionPlaylist(...a),
  unsyncSessionPlaylist: (...a: unknown[]) => h.unsyncSessionPlaylist(...a),
}));
vi.mock("../db/repositories/sessionRepository", () => ({
  sessionRepository: {
    getSessionPlaylistUrl: (...a: unknown[]) => h.getSessionPlaylistUrl(...a),
    getSessionPlaylistState: (...a: unknown[]) => h.getSessionPlaylistState(...a),
    setSessionPlaylist: (...a: unknown[]) => h.setSessionPlaylist(...a),
    setSessionPlaylistSynced: (...a: unknown[]) => h.setSessionPlaylistSynced(...a),
  },
}));
vi.mock("../db/repositories/trackRepository", () => ({
  trackRepository: {
    getSessionTracksForMatching: (...a: unknown[]) => h.getSessionTracksForMatching(...a),
    setTrackAlbumArt: (...a: unknown[]) => h.setTrackAlbumArt(...a),
    setTrackSpotifyMatch: (...a: unknown[]) => h.setTrackSpotifyMatch(...a),
  },
}));

import { useBuildPlaylist } from "./useBuildPlaylist";

const SESSION = { id: 7, name: "Friday Social" };

/** A row of trackRepository.getSessionTracksForMatching. */
const matchTrack = (trackId: number, over: Record<string, unknown> = {}) => ({
  trackId,
  artist: `Art${trackId}`,
  title: `Ti${trackId}`,
  durationSec: 180,
  spotifyId: null,
  spotifyUrl: null,
  spotifyAlbumArtUrl: null,
  spotifyMatchSource: null,
  spotifyMatchConfidence: null,
  ...over,
});

const candidate = (spotifyId: string, over: Record<string, unknown> = {}) => ({
  spotifyId,
  uri: `spotify:track:${spotifyId}`,
  url: `https://open.spotify.com/track/${spotifyId}`,
  name: `Name ${spotifyId}`,
  artists: `Artists ${spotifyId}`,
  durationMs: 180000,
  popularity: 50,
  ...over,
});

const matchResult = (
  candidates: unknown[],
  confidence: "high" | "medium" | "low" | "none" = "high",
) => ({
  candidates,
  recommendedIndex: candidates.length ? 0 : null,
  confidence,
  cached: false,
});

/** Let every chained await in the load pipeline settle (one macrotask drains the microtask chain). */
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });

async function mount() {
  const rendered = renderHook(() => useBuildPlaylist(SESSION));
  await flush();
  return rendered;
}

beforeEach(() => {
  for (const m of Object.values(h)) if (typeof m === "function" && "mockReset" in m) m.mockReset();
  h.getSessionPlaylistUrl.mockResolvedValue(null);
  h.getSessionTracksForMatching.mockResolvedValue([]);
  h.getSessionPlaylistState.mockResolvedValue({
    url: null,
    playlistId: null,
    cloudSessionId: null,
    syncedAt: null,
  });
  h.setSessionPlaylist.mockResolvedValue(undefined);
  h.setSessionPlaylistSynced.mockResolvedValue(undefined);
  h.setTrackAlbumArt.mockResolvedValue(undefined);
  h.setTrackSpotifyMatch.mockResolvedValue(undefined);
  h.syncSessionPlaylist.mockResolvedValue(undefined);
  h.unsyncSessionPlaylist.mockResolvedValue(undefined);
});

describe("useBuildPlaylist load pipeline", () => {
  it("short-circuits to the remembered playlist without loading or searching", async () => {
    h.getSessionPlaylistUrl.mockResolvedValue("https://open.spotify.com/playlist/prev");
    const { result } = await mount();
    expect(result.current.doneUrl).toBe("https://open.spotify.com/playlist/prev");
    expect(result.current.loading).toBe(false);
    expect(h.getSessionTracksForMatching).not.toHaveBeenCalled();
    expect(h.searchSpotify).not.toHaveBeenCalled();
  });

  it("seeds remembered matches as ready/fromCache (locked iff dj_confirmed) and drops rows without artist/title", async () => {
    h.getSessionTracksForMatching.mockResolvedValue([
      matchTrack(1, {
        spotifyId: "s1",
        spotifyAlbumArtUrl: "https://art/s1",
        spotifyMatchSource: "dj_confirmed",
      }),
      matchTrack(2, { spotifyId: "s2", spotifyUrl: "https://custom/s2" }),
      matchTrack(3, { artist: null }),
    ]);
    const { result } = await mount();

    expect(result.current.rows).toHaveLength(2);
    const [r1, r2] = result.current.rows;
    expect(r1).toMatchObject({ status: "ready", fromCache: true, locked: true, selectedIndex: 0 });
    expect(r1?.candidates[0]).toMatchObject({
      spotifyId: "s1",
      uri: "spotify:track:s1",
      url: "https://open.spotify.com/track/s1",
      albumArtUrl: "https://art/s1",
    });
    expect(r2).toMatchObject({ status: "ready", fromCache: true, locked: false });
    expect(r2?.candidates[0]?.url).toBe("https://custom/s2");
    expect(h.searchSpotify).not.toHaveBeenCalled();
  });

  it("searches uncached rows serially and applies candidates/confidence", async () => {
    h.getSessionTracksForMatching.mockResolvedValue([matchTrack(1)]);
    h.searchSpotify.mockResolvedValue(matchResult([candidate("f1")], "medium"));
    const { result } = await mount();

    expect(h.searchSpotify).toHaveBeenCalledWith({
      artist: "Art1",
      title: "Ti1",
      durationMs: 180000,
    });
    expect(result.current.rows[0]).toMatchObject({
      status: "ready",
      confidence: "medium",
      selectedIndex: 0,
    });
    expect(result.current.selectedCount).toBe(1);
  });

  it("marks a zero-candidate search as unmatched", async () => {
    h.getSessionTracksForMatching.mockResolvedValue([matchTrack(1)]);
    h.searchSpotify.mockResolvedValue(matchResult([], "none"));
    const { result } = await mount();
    expect(result.current.rows[0]?.status).toBe("unmatched");
    expect(result.current.selectedCount).toBe(0);
  });

  it("keeps searching later rows after a non-auth search error", async () => {
    h.getSessionTracksForMatching.mockResolvedValue([matchTrack(1), matchTrack(2)]);
    h.searchSpotify
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValueOnce(matchResult([candidate("f2")]));
    const { result } = await mount();

    expect(h.searchSpotify).toHaveBeenCalledTimes(2);
    expect(result.current.rows[0]?.status).toBe("error");
    expect(result.current.rows[1]?.status).toBe("ready");
    expect(result.current.authError).toBe(false);
  });

  it("trips the auth gate and aborts the loop on a 401 search", async () => {
    h.getSessionTracksForMatching.mockResolvedValue([matchTrack(1), matchTrack(2)]);
    h.searchSpotify.mockRejectedValue(new h.PlaylistApiError(401, "unauthorized"));
    const { result } = await mount();

    expect(result.current.authError).toBe(true);
    expect(h.searchSpotify).toHaveBeenCalledTimes(1);
    expect(result.current.rows[1]?.status).toBe("searching"); // loop early-returned
  });

  it("backfills art for remembered matches and persists it", async () => {
    h.getSessionTracksForMatching.mockResolvedValue([matchTrack(1, { spotifyId: "s1" })]);
    h.resolveSpotifyTracks.mockResolvedValue({
      candidates: [{ spotifyId: "s1", albumArtUrl: "https://art/s1" }],
    });
    const { result } = await mount();

    expect(h.resolveSpotifyTracks).toHaveBeenCalledWith(["s1"]);
    expect(result.current.rows[0]?.candidates[0]?.albumArtUrl).toBe("https://art/s1");
    expect(h.setTrackAlbumArt).toHaveBeenCalledWith(1, "https://art/s1");
  });

  it("swallows art-backfill failures (cosmetic — no auth gate, row stays ready)", async () => {
    h.getSessionTracksForMatching.mockResolvedValue([matchTrack(1, { spotifyId: "s1" })]);
    h.resolveSpotifyTracks.mockRejectedValue(new h.PlaylistApiError(500, "nope"));
    const { result } = await mount();

    expect(result.current.authError).toBe(false);
    expect(result.current.rows[0]?.status).toBe("ready");
    expect(h.setTrackAlbumArt).not.toHaveBeenCalled();
  });
});

describe("useBuildPlaylist manual overrides", () => {
  it("choose sets the selection (or skip) and closes the picker", async () => {
    h.getSessionTracksForMatching.mockResolvedValue([matchTrack(1)]);
    h.searchSpotify.mockResolvedValue(matchResult([candidate("a"), candidate("b")]));
    const { result } = await mount();

    act(() => result.current.setExpandedRow(0));
    expect(result.current.expandedRow).toBe(0);
    act(() => result.current.choose(0, 1));
    expect(result.current.rows[0]?.selectedIndex).toBe(1);
    expect(result.current.expandedRow).toBeNull();
    act(() => result.current.choose(0, null));
    expect(result.current.selectedCount).toBe(0);
  });

  it("pasteLink rejects garbage without a resolve call", async () => {
    h.getSessionTracksForMatching.mockResolvedValue([matchTrack(1)]);
    h.searchSpotify.mockResolvedValue(matchResult([], "none"));
    const { result } = await mount();

    let msg: string | null = null;
    await act(async () => {
      msg = await result.current.pasteLink(0, "not a link");
    });
    expect(msg).toBe("That doesn't look like a Spotify track link");
    expect(h.resolveSpotifyTrack).not.toHaveBeenCalled();
  });

  it("pasteLink promotes the resolved track to the selected front, deduped", async () => {
    h.getSessionTracksForMatching.mockResolvedValue([matchTrack(1)]);
    h.searchSpotify.mockResolvedValue(matchResult([candidate("dup"), candidate("keep")]));
    h.resolveSpotifyTrack.mockResolvedValue({ candidate: candidate("dup", { name: "Fresh" }) });
    const { result } = await mount();

    let msg: string | null = "sentinel";
    await act(async () => {
      msg = await result.current.pasteLink(0, "https://open.spotify.com/track/dup");
    });
    expect(msg).toBeNull();
    expect(h.resolveSpotifyTrack).toHaveBeenCalledWith("dup");
    const row = result.current.rows[0];
    expect(row?.candidates.map((c) => c.spotifyId)).toEqual(["dup", "keep"]);
    expect(row).toMatchObject({
      selectedIndex: 0,
      confidence: "high",
      locked: false,
      fromCache: false,
      status: "ready",
    });
    expect(row?.candidates[0]?.name).toBe("Fresh");
  });

  it("pasteLink maps 401 to the auth gate (null return) and other errors to a message", async () => {
    h.getSessionTracksForMatching.mockResolvedValue([matchTrack(1)]);
    h.searchSpotify.mockResolvedValue(matchResult([], "none"));
    h.resolveSpotifyTrack.mockRejectedValueOnce(new h.PlaylistApiError(401, "expired"));
    const { result } = await mount();

    let msg: string | null = "sentinel";
    await act(async () => {
      msg = await result.current.pasteLink(0, "https://open.spotify.com/track/x1");
    });
    expect(msg).toBeNull();
    expect(result.current.authError).toBe(true);

    h.resolveSpotifyTrack.mockRejectedValueOnce(new Error("no such track"));
    await act(async () => {
      msg = await result.current.pasteLink(0, "https://open.spotify.com/track/x2");
    });
    expect(msg).toBe("no such track");
  });

  it("rematch re-searches a remembered row, unlocks it, and opens the picker", async () => {
    h.getSessionTracksForMatching.mockResolvedValue([
      matchTrack(1, { spotifyId: "s1", spotifyMatchSource: "dj_confirmed" }),
    ]);
    h.searchSpotify.mockResolvedValue(matchResult([candidate("n1"), candidate("n2")], "medium"));
    const { result } = await mount();

    await act(async () => {
      await result.current.rematch(0);
    });
    expect(h.searchSpotify).toHaveBeenCalledWith({
      artist: "Art1",
      title: "Ti1",
      durationMs: 180000,
    });
    expect(result.current.rows[0]).toMatchObject({
      status: "ready",
      confidence: "medium",
      locked: false,
      fromCache: false,
    });
    expect(result.current.rows[0]?.candidates).toHaveLength(2);
    expect(result.current.expandedRow).toBe(0);
  });

  it("rematch maps 401 to the auth gate and other errors to a row error", async () => {
    h.getSessionTracksForMatching.mockResolvedValue([
      matchTrack(1, { spotifyId: "s1" }),
      matchTrack(2, { spotifyId: "s2" }),
    ]);
    const { result } = await mount();

    h.searchSpotify.mockRejectedValueOnce(new Error("boom"));
    await act(async () => {
      await result.current.rematch(0);
    });
    expect(result.current.rows[0]?.status).toBe("error");
    expect(result.current.authError).toBe(false);

    h.searchSpotify.mockRejectedValueOnce(new h.PlaylistApiError(403, "forbidden"));
    await act(async () => {
      await result.current.rematch(1);
    });
    expect(result.current.authError).toBe(true);
  });
});

describe("useBuildPlaylist create + share", () => {
  it("creates the playlist from selected rows, lists skipped tracks in the description, and writes matches back", async () => {
    h.getSessionTracksForMatching.mockResolvedValue([matchTrack(1), matchTrack(2)]);
    h.searchSpotify
      .mockResolvedValueOnce(matchResult([candidate("c1", { albumArtUrl: "https://art/c1" })]))
      .mockResolvedValueOnce(matchResult([], "none")); // row 2 unmatched → skipped
    h.createSpotifyPlaylist.mockResolvedValue({
      success: true,
      playlistUrl: "https://open.spotify.com/playlist/new",
      playlistId: "pl_new",
    });
    const { result } = await mount();

    act(() => result.current.setNote("  great night  "));
    act(() => result.current.setName("   "));
    await act(async () => {
      await result.current.handleCreate();
    });

    expect(h.createSpotifyPlaylist).toHaveBeenCalledWith({
      name: "Pika set", // blank name falls back
      description: "great night — Not on Spotify — 2. Art2 - Ti2 — Made with Pika · pika.stream",
      tracks: [{ artist: "Art1", title: "Ti1", spotifyId: "c1", uri: "spotify:track:c1" }],
    });
    expect(h.setSessionPlaylist).toHaveBeenCalledWith(
      7,
      "https://open.spotify.com/playlist/new",
      "pl_new",
    );
    expect(h.setTrackSpotifyMatch).toHaveBeenCalledWith(1, {
      spotifyId: "c1",
      spotifyUrl: "https://open.spotify.com/track/c1",
      albumArtUrl: "https://art/c1",
      confidence: null,
      source: "dj_confirmed",
    });
    expect(result.current.resultUrl).toBe("https://open.spotify.com/playlist/new");
    expect(result.current.doneUrl).toBe("https://open.spotify.com/playlist/new");
    expect(result.current.creating).toBe(false);
  });

  it("maps create failures to the auth gate (401) or the error banner, clearing `creating`", async () => {
    h.getSessionTracksForMatching.mockResolvedValue([matchTrack(1)]);
    h.searchSpotify.mockResolvedValue(matchResult([candidate("c1")]));
    const { result } = await mount();

    h.createSpotifyPlaylist.mockRejectedValueOnce(new Error("quota"));
    await act(async () => {
      await result.current.handleCreate();
    });
    expect(result.current.error).toBe("quota");
    expect(result.current.creating).toBe(false);
    expect(result.current.authError).toBe(false);

    h.createSpotifyPlaylist.mockRejectedValueOnce(new h.PlaylistApiError(401, "expired"));
    await act(async () => {
      await result.current.handleCreate();
    });
    expect(result.current.authError).toBe(true);
    expect(result.current.creating).toBe(false);
  });

  it("loads sync state on the done screen; share round-trips through the cloud + local mark", async () => {
    h.getSessionPlaylistUrl.mockResolvedValue("https://open.spotify.com/playlist/prev");
    h.getSessionPlaylistState.mockResolvedValue({
      url: "https://open.spotify.com/playlist/prev",
      playlistId: "pl1",
      cloudSessionId: "cloud1",
      syncedAt: null,
    });
    const { result } = await mount();
    expect(result.current.syncState).toMatchObject({ cloudSessionId: "cloud1", playlistId: "pl1" });

    await act(async () => {
      await result.current.handleSync();
    });
    expect(h.syncSessionPlaylist).toHaveBeenCalledWith("cloud1", {
      spotifyPlaylistId: "pl1",
      spotifyPlaylistUrl: "https://open.spotify.com/playlist/prev",
    });
    expect(h.setSessionPlaylistSynced).toHaveBeenCalledWith(7, expect.any(Number));
    expect(result.current.syncState?.syncedAt).toEqual(expect.any(Number));

    await act(async () => {
      await result.current.handleUnsync();
    });
    expect(h.unsyncSessionPlaylist).toHaveBeenCalledWith("cloud1");
    expect(h.setSessionPlaylistSynced).toHaveBeenLastCalledWith(7, null);
    expect(result.current.syncState?.syncedAt).toBeNull();
  });

  it("maps share failures to the auth gate (401) or syncError", async () => {
    h.getSessionPlaylistUrl.mockResolvedValue("https://open.spotify.com/playlist/prev");
    h.getSessionPlaylistState.mockResolvedValue({
      url: null,
      playlistId: "pl1",
      cloudSessionId: "cloud1",
      syncedAt: null,
    });
    const { result } = await mount();

    h.syncSessionPlaylist.mockRejectedValueOnce(new Error("offline"));
    await act(async () => {
      await result.current.handleSync();
    });
    expect(result.current.syncError).toBe("offline");
    expect(result.current.syncing).toBe(false);

    h.syncSessionPlaylist.mockRejectedValueOnce(new h.PlaylistApiError(401, "expired"));
    await act(async () => {
      await result.current.handleSync();
    });
    expect(result.current.authError).toBe(true);
  });

  it("startRebuild leaves the done screen and re-runs the load without re-consulting the remembered URL", async () => {
    h.getSessionPlaylistUrl.mockResolvedValue("https://open.spotify.com/playlist/prev");
    h.getSessionTracksForMatching.mockResolvedValue([matchTrack(1)]);
    h.searchSpotify.mockResolvedValue(matchResult([candidate("c1")]));
    const { result } = await mount();
    expect(result.current.doneUrl).toBe("https://open.spotify.com/playlist/prev");

    act(() => result.current.startRebuild());
    await flush();

    expect(result.current.doneUrl).toBeNull();
    expect(h.getSessionPlaylistUrl).toHaveBeenCalledTimes(1); // rebuild skips the short-circuit
    expect(h.getSessionTracksForMatching).toHaveBeenCalledTimes(1);
    expect(result.current.rows[0]?.status).toBe("ready");
  });
});
