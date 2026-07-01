// @vitest-environment happy-dom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted above declarations, so anything the factories use as a *value* (the error class)
// must be created via vi.hoisted; the fn spies are referenced lazily so they're safe.
const { PlaylistApiError, searchSpotify, resolveSpotifyTracks } = vi.hoisted(() => {
  class PlaylistApiError extends Error {
    constructor(
      public readonly status: number,
      msg: string,
    ) {
      super(msg);
    }
  }
  return { PlaylistApiError, searchSpotify: vi.fn(), resolveSpotifyTracks: vi.fn() };
});

vi.mock("../services/spotifyPlaylist", () => ({
  PlaylistApiError,
  searchSpotify: (...a: unknown[]) => searchSpotify(...a),
  resolveSpotifyTracks: (...a: unknown[]) => resolveSpotifyTracks(...a),
}));

const repo = {
  getUnmatchedCount: vi.fn(),
  getUnmatchedLibraryTracks: vi.fn(),
  setTrackSpotifyMatch: vi.fn(),
  markSpotifyMatchAttempted: vi.fn(),
  setTrackAlbumArt: vi.fn(),
};
vi.mock("../db/repositories/trackRepository", () => ({
  trackRepository: {
    getUnmatchedCount: (...a: unknown[]) => repo.getUnmatchedCount(...a),
    getUnmatchedLibraryTracks: (...a: unknown[]) => repo.getUnmatchedLibraryTracks(...a),
    setTrackSpotifyMatch: (...a: unknown[]) => repo.setTrackSpotifyMatch(...a),
    markSpotifyMatchAttempted: (...a: unknown[]) => repo.markSpotifyMatchAttempted(...a),
    setTrackAlbumArt: (...a: unknown[]) => repo.setTrackAlbumArt(...a),
  },
}));

import { useSpotifyMatcher } from "./useSpotifyMatcher";

// Minimal library track (the hook reads id/artist/title/duration).
const track = (id: number, over: Record<string, unknown> = {}) =>
  ({ id, artist: `Art${id}`, title: `Ti${id}`, duration: 180, ...over }) as never;

const high = (spotifyId: string, albumArtUrl?: string) => ({
  candidates: [{ spotifyId, url: `https://open.spotify.com/track/${spotifyId}`, albumArtUrl }],
  recommendedIndex: 0,
  confidence: "high" as const,
  cached: false,
});
const medium = () => ({
  candidates: [{ spotifyId: "x", url: "x" }],
  recommendedIndex: 0,
  confidence: "medium" as const,
  cached: false,
});

/** Run start() to completion, draining all throttle/backoff timers. */
async function runToEnd(start: () => Promise<void>) {
  await act(async () => {
    const p = start();
    await vi.runAllTimersAsync();
    await p;
  });
}

describe("useSpotifyMatcher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    for (const m of Object.values(repo)) m.mockReset();
    searchSpotify.mockReset();
    resolveSpotifyTracks.mockReset();
    // Default: one page then empty (loop terminates).
    repo.getUnmatchedLibraryTracks.mockResolvedValue([]);
  });
  afterEach(() => vi.useRealTimers());

  it("writes high-confidence auto matches, skips the rest, and backfills cache-hit art", async () => {
    repo.getUnmatchedCount.mockResolvedValue(2);
    repo.getUnmatchedLibraryTracks
      .mockResolvedValueOnce([track(1), track(2)])
      .mockResolvedValue([]);
    // t1 = high but NO album art (cache-hit shape) → backfill; t2 = medium → skip.
    searchSpotify.mockResolvedValueOnce(high("s1")).mockResolvedValueOnce(medium());
    resolveSpotifyTracks.mockResolvedValue({
      candidates: [{ spotifyId: "s1", albumArtUrl: "https://art/s1" }],
    });

    const { result } = renderHook(() => useSpotifyMatcher());
    await runToEnd(result.current.start);

    expect(repo.setTrackSpotifyMatch).toHaveBeenCalledExactlyOnceWith(1, {
      spotifyId: "s1",
      spotifyUrl: "https://open.spotify.com/track/s1",
      albumArtUrl: null,
      confidence: 0.8,
      source: "auto",
    });
    expect(repo.markSpotifyMatchAttempted).toHaveBeenCalledExactlyOnceWith(2);
    // Cache-hit art backfill.
    expect(resolveSpotifyTracks).toHaveBeenCalledWith(["s1"]);
    expect(repo.setTrackAlbumArt).toHaveBeenCalledWith(1, "https://art/s1");
    expect(result.current.matched).toBe(1);
    expect(result.current.skipped).toBe(1);
    expect(result.current.isMatching).toBe(false);
  });

  it("does NOT backfill when the match already carries album art (fresh search)", async () => {
    repo.getUnmatchedCount.mockResolvedValue(1);
    repo.getUnmatchedLibraryTracks.mockResolvedValueOnce([track(1)]).mockResolvedValue([]);
    searchSpotify.mockResolvedValue(high("s1", "https://art/fresh"));

    const { result } = renderHook(() => useSpotifyMatcher());
    await runToEnd(result.current.start);

    expect(repo.setTrackSpotifyMatch).toHaveBeenCalledWith(
      1,
      expect.objectContaining({ albumArtUrl: "https://art/fresh" }),
    );
    expect(resolveSpotifyTracks).not.toHaveBeenCalled();
  });

  it("on 429, backs off and retries the SAME track (never skips it)", async () => {
    repo.getUnmatchedCount.mockResolvedValue(1);
    repo.getUnmatchedLibraryTracks.mockResolvedValueOnce([track(1)]).mockResolvedValue([]);
    searchSpotify
      .mockRejectedValueOnce(new PlaylistApiError(429, "rate"))
      .mockResolvedValueOnce(high("s1", "art"));

    const { result } = renderHook(() => useSpotifyMatcher());
    await runToEnd(result.current.start);

    expect(searchSpotify).toHaveBeenCalledTimes(2); // retried the same track
    expect(repo.setTrackSpotifyMatch).toHaveBeenCalledTimes(1);
    expect(repo.markSpotifyMatchAttempted).not.toHaveBeenCalled();
    expect(result.current.matched).toBe(1);
  });

  it("on 401, stops the run with a reconnect error and writes nothing", async () => {
    repo.getUnmatchedCount.mockResolvedValue(2);
    repo.getUnmatchedLibraryTracks
      .mockResolvedValueOnce([track(1), track(2)])
      .mockResolvedValue([]);
    searchSpotify.mockRejectedValue(new PlaylistApiError(401, "unauth"));

    const { result } = renderHook(() => useSpotifyMatcher());
    await runToEnd(result.current.start);

    expect(result.current.error).toMatch(/reconnect/i);
    expect(repo.setTrackSpotifyMatch).not.toHaveBeenCalled();
    expect(repo.markSpotifyMatchAttempted).not.toHaveBeenCalled(); // aborted before counting
    expect(result.current.isMatching).toBe(false);
  });

  it("on a non-auth/non-429 error, marks the track attempted and continues", async () => {
    repo.getUnmatchedCount.mockResolvedValue(2);
    repo.getUnmatchedLibraryTracks
      .mockResolvedValueOnce([track(1), track(2)])
      .mockResolvedValue([]);
    searchSpotify
      .mockRejectedValueOnce(new PlaylistApiError(400, "bad title"))
      .mockResolvedValueOnce(high("s2", "art"));

    const { result } = renderHook(() => useSpotifyMatcher());
    await runToEnd(result.current.start);

    expect(repo.markSpotifyMatchAttempted).toHaveBeenCalledExactlyOnceWith(1);
    expect(repo.setTrackSpotifyMatch).toHaveBeenCalledExactlyOnceWith(2, expect.any(Object));
    expect(result.current.matched).toBe(1);
    expect(result.current.skipped).toBe(1);
  });

  it("no-ops when nothing is unmatched", async () => {
    repo.getUnmatchedCount.mockResolvedValue(0);
    const { result } = renderHook(() => useSpotifyMatcher());
    await runToEnd(result.current.start);
    expect(searchSpotify).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/already matched/i);
  });
});
