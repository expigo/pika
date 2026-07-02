import { describe, expect, test } from "bun:test";
import { type PlayRow, parseSpotifyTrackId, tracksFromPlays } from "./finalizeWebSet";

describe("parseSpotifyTrackId", () => {
  test("extracts the id from a canonical track URL", () => {
    expect(parseSpotifyTrackId("https://open.spotify.com/track/0VjIjW4GlUZAMYd2vXMi3b")).toBe(
      "0VjIjW4GlUZAMYd2vXMi3b",
    );
  });
  test("ignores query params + hash", () => {
    expect(parseSpotifyTrackId("https://open.spotify.com/track/abc123?si=xyz#foo")).toBe("abc123");
  });
  test("returns null for null / empty / non-track URLs", () => {
    expect(parseSpotifyTrackId(null)).toBeNull();
    expect(parseSpotifyTrackId(undefined)).toBeNull();
    expect(parseSpotifyTrackId("")).toBeNull();
    expect(parseSpotifyTrackId("https://open.spotify.com/playlist/xyz")).toBeNull();
    expect(parseSpotifyTrackId("not a url")).toBeNull();
  });
});

describe("tracksFromPlays", () => {
  const row = (o: Partial<PlayRow>): PlayRow => ({
    artist: "A",
    title: "T",
    albumArtUrl: null,
    spotifyUrl: "https://open.spotify.com/track/id1",
    ...o,
  });

  test("maps plays → identity-only SeedTracks (uri built, no features)", () => {
    const out = tracksFromPlays([
      row({
        artist: "Dua Lipa",
        title: "Levitating",
        spotifyUrl: "https://open.spotify.com/track/id1",
        albumArtUrl: "art",
      }),
    ]);
    expect(out).toEqual([
      {
        spotifyId: "id1",
        uri: "spotify:track:id1",
        name: "Levitating",
        artists: "Dua Lipa",
        albumArtUrl: "art",
      },
    ]);
    // Identity only — never carries Spotify features.
    expect("features" in out[0]!).toBe(false);
  });

  test("preserves play order and collapses repeats to first appearance", () => {
    const out = tracksFromPlays([
      row({ title: "one", spotifyUrl: "https://open.spotify.com/track/a" }),
      row({ title: "two", spotifyUrl: "https://open.spotify.com/track/b" }),
      row({ title: "one-again", spotifyUrl: "https://open.spotify.com/track/a" }),
    ]);
    expect(out.map((t) => t.spotifyId)).toEqual(["a", "b"]);
    expect(out[0]!.name).toBe("one"); // first appearance kept
  });

  test("skips rows without a parseable Spotify url", () => {
    const out = tracksFromPlays([
      row({ spotifyUrl: null }),
      row({ spotifyUrl: "https://open.spotify.com/track/keep" }),
      row({ spotifyUrl: "garbage" }),
    ]);
    expect(out.map((t) => t.spotifyId)).toEqual(["keep"]);
  });

  test("empty input → empty output", () => {
    expect(tracksFromPlays([])).toEqual([]);
  });
});
