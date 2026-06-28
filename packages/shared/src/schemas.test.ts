import { describe, expect, test } from "bun:test";
import { BroadcastTrackSchema, TrackInfoSchema } from "./schemas";

describe("TrackInfoSchema — tolerant metric normalization", () => {
  test("accepts a fully-populated valid track unchanged", () => {
    const r = TrackInfoSchema.safeParse({
      artist: "A",
      title: "T",
      bpm: 96,
      key: "Am",
      energy: 72,
      danceability: 80,
      brightness: 50,
      acousticness: 10,
      groove: 65,
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.bpm).toBe(96);
  });

  test("null fingerprint metrics normalize to undefined (does not reject)", () => {
    const r = TrackInfoSchema.safeParse({
      artist: "A",
      title: "T",
      bpm: 96,
      key: "Am",
      energy: null,
      danceability: null,
      brightness: null,
      acousticness: null,
      groove: null,
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.energy).toBeUndefined();
      expect(r.data.groove).toBeUndefined();
    }
  });

  test("null bpm and null key normalize to undefined", () => {
    const r = TrackInfoSchema.safeParse({ artist: "A", title: "T", bpm: null, key: null });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.bpm).toBeUndefined();
      expect(r.data.key).toBeUndefined();
    }
  });

  test("accepts valid Spotify album-art + listen-on URLs", () => {
    const r = TrackInfoSchema.safeParse({
      artist: "A",
      title: "T",
      albumArtUrl: "https://i.scdn.co/image/abc123",
      spotifyUrl: "https://open.spotify.com/track/abc123",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.albumArtUrl).toBe("https://i.scdn.co/image/abc123");
      expect(r.data.spotifyUrl).toBe("https://open.spotify.com/track/abc123");
    }
  });

  test("malformed / empty / non-http URL drops to undefined (does not reject the track)", () => {
    for (const bad of ["not-a-url", "", "  ", null, 42, "ftp://x"]) {
      const r = TrackInfoSchema.safeParse({
        artist: "A",
        title: "T",
        albumArtUrl: bad,
        spotifyUrl: bad,
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.albumArtUrl).toBeUndefined();
        expect(r.data.spotifyUrl).toBeUndefined();
      }
    }
  });

  test("implausible / out-of-range bpm drops to undefined", () => {
    for (const bpm of [0, 5, 999, -10, Number.NaN]) {
      const r = TrackInfoSchema.safeParse({ artist: "A", title: "T", bpm });
      expect(r.success).toBe(true);
      if (r.success) expect(r.data.bpm).toBeUndefined();
    }
  });

  test("numeric-string bpm is coerced", () => {
    const r = TrackInfoSchema.safeParse({ artist: "A", title: "T", bpm: "128" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.bpm).toBe(128);
  });

  test("out-of-range fingerprint metric drops to undefined", () => {
    const r = TrackInfoSchema.safeParse({ artist: "A", title: "T", energy: 250 });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.energy).toBeUndefined();
  });

  test("over-long / empty key drops to undefined", () => {
    const long = TrackInfoSchema.safeParse({ artist: "A", title: "T", key: "X".repeat(20) });
    expect(long.success).toBe(true);
    if (long.success) expect(long.data.key).toBeUndefined();
    const empty = TrackInfoSchema.safeParse({ artist: "A", title: "T", key: "   " });
    expect(empty.success).toBe(true);
    if (empty.success) expect(empty.data.key).toBeUndefined();
  });

  test("still rejects missing/empty required fields", () => {
    expect(TrackInfoSchema.safeParse({ title: "T" }).success).toBe(false);
    expect(TrackInfoSchema.safeParse({ artist: "", title: "T" }).success).toBe(false);
  });
});

describe("BroadcastTrackSchema — unanalyzed track no longer rejected", () => {
  test("BROADCAST_TRACK with null metrics validates (the session-start bug)", () => {
    const r = BroadcastTrackSchema.safeParse({
      type: "BROADCAST_TRACK",
      sessionId: "session_12345678",
      messageId: "msg_1_abc",
      track: { artist: "A", title: "T", bpm: null, key: null, energy: null },
    });
    expect(r.success).toBe(true);
  });
});
