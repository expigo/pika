import { describe, expect, test } from "bun:test";
import { normalizeNowPlaying, type SpotifyCurrentlyPlaying } from "./spotify";

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
