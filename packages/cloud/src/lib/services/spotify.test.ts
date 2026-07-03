import { describe, expect, test } from "bun:test";
import {
  isPlaylistGoneStatus,
  normalizeNowPlaying,
  planReplaceBatches,
  type SpotifyCurrentlyPlaying,
} from "./spotify";

// A realistic payload modeled on the Phase 0 spike (Beautiful Things — Benson Boone):
// note ISRC is absent from currently-playing, but url + album art are present.
const SPIKE_ITEM = {
  id: "3xkHsmpQCBMytMJNiDf3Ii",
  name: "Beautiful Things",
  duration_ms: 180000,
  external_urls: { spotify: "https://open.spotify.com/track/3xkHsmpQCBMytMJNiDf3Ii" },
  artists: [{ name: "Benson Boone" }],
  album: { images: [{ url: "https://i.scdn.co/image/ab67616d0000b273831949037a1db10b87b005fa" }] },
};
const SPIKE_PAYLOAD: SpotifyCurrentlyPlaying = {
  is_playing: true,
  progress_ms: 75000,
  item: SPIKE_ITEM,
};

describe("normalizeNowPlaying", () => {
  test("maps the spike payload to the broadcast shape", () => {
    const np = normalizeNowPlaying(SPIKE_PAYLOAD);
    expect(np).not.toBeNull();
    expect(np?.isPlaying).toBe(true);
    expect(np?.trackId).toBe("3xkHsmpQCBMytMJNiDf3Ii");
    expect(np?.track).toEqual({
      title: "Beautiful Things",
      artist: "Benson Boone",
      albumArtUrl: "https://i.scdn.co/image/ab67616d0000b273831949037a1db10b87b005fa",
      spotifyUrl: "https://open.spotify.com/track/3xkHsmpQCBMytMJNiDf3Ii",
    });
    expect(np?.track.spotifyUrl).toBe("https://open.spotify.com/track/3xkHsmpQCBMytMJNiDf3Ii");
    expect(np?.track.albumArtUrl).toContain("i.scdn.co");
    expect(np?.progressMs).toBe(75000);
    expect(np?.durationMs).toBe(180000);
  });

  test("joins multiple artists with a comma", () => {
    const np = normalizeNowPlaying({
      ...SPIKE_PAYLOAD,
      item: { ...SPIKE_ITEM, artists: [{ name: "A" }, { name: "B" }, { name: "C" }] },
    });
    expect(np?.track.artist).toBe("A, B, C");
  });

  test("reflects pause state", () => {
    const np = normalizeNowPlaying({ ...SPIKE_PAYLOAD, is_playing: false });
    expect(np?.isPlaying).toBe(false);
  });

  test("returns null when nothing is playing", () => {
    expect(normalizeNowPlaying({ is_playing: false, progress_ms: null, item: null })).toBeNull();
  });

  test("tolerates missing album art / url / progress", () => {
    const np = normalizeNowPlaying({
      is_playing: true,
      progress_ms: null,
      item: { id: "x", name: "Indie Track", duration_ms: 200000, artists: [{ name: "Local" }] },
    });
    expect(np?.track.spotifyUrl).toBeUndefined();
    expect(np?.track.albumArtUrl).toBeUndefined();
    expect(np?.progressMs).toBe(0);
  });
});

describe("planReplaceBatches", () => {
  const uris = (n: number) => Array.from({ length: n }, (_, i) => `spotify:track:t${i}`);

  test("≤100 URIs → single PUT, no appends", () => {
    const plan = planReplaceBatches(uris(42));
    expect(plan.put.length).toBe(42);
    expect(plan.posts).toEqual([]);
  });

  test("250 URIs → 1 PUT of 100 + POST batches of 100 and 50, order preserved", () => {
    const plan = planReplaceBatches(uris(250));
    expect(plan.put.length).toBe(100);
    expect(plan.put[0]).toBe("spotify:track:t0");
    expect(plan.posts.length).toBe(2);
    expect(plan.posts[0]?.length).toBe(100);
    expect(plan.posts[0]?.[0]).toBe("spotify:track:t100");
    expect(plan.posts[1]?.length).toBe(50);
    expect(plan.posts[1]?.[49]).toBe("spotify:track:t249");
  });

  test("exactly 100 → PUT only", () => {
    const plan = planReplaceBatches(uris(100));
    expect(plan.put.length).toBe(100);
    expect(plan.posts).toEqual([]);
  });
});

describe("isPlaylistGoneStatus", () => {
  test("client errors that mean the playlist is unusable → recreate", () => {
    // Spotify "delete" = unfollow: writes to the ghost playlist surface as 403/400, not only 404.
    expect(isPlaylistGoneStatus(400)).toBe(true);
    expect(isPlaylistGoneStatus(403)).toBe(true);
    expect(isPlaylistGoneStatus(404)).toBe(true);
  });

  test("rate limits and transient server errors must NOT trigger a recreate", () => {
    expect(isPlaylistGoneStatus(429)).toBe(false);
    expect(isPlaylistGoneStatus(500)).toBe(false);
    expect(isPlaylistGoneStatus(503)).toBe(false);
    expect(isPlaylistGoneStatus(200)).toBe(false);
  });
});
