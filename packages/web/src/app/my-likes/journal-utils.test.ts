import { describe, expect, it } from "bun:test";
import { exportErrorCopy, groupBySession, slugify } from "./journal-utils";
import type { LikedTrack } from "./types";

function like(id: number, sessionId: string | null): LikedTrack {
  return {
    id,
    sessionId,
    djName: "DJ Test",
    sessionDate: "2026-07-01T20:00:00.000Z",
    artist: "Artist",
    title: `Track ${id}`,
    albumArtUrl: null,
    spotifyUrl: null,
    likedAt: "2026-07-01T21:00:00.000Z",
  };
}

describe("groupBySession", () => {
  it("groups likes by sessionId preserving first-seen group order", () => {
    const groups = groupBySession([like(1, "s1"), like(2, "s2"), like(3, "s1")]);
    expect(Array.from(groups.keys())).toEqual(["s1", "s2"]);
    expect(groups.get("s1")?.map((l) => l.id)).toEqual([1, 3]);
    expect(groups.get("s2")?.map((l) => l.id)).toEqual([2]);
  });

  it("collects null sessionIds under a single null key", () => {
    const groups = groupBySession([like(1, null), like(2, "s1"), like(3, null)]);
    expect(groups.get(null)?.map((l) => l.id)).toEqual([1, 3]);
    expect(groups.size).toBe(2);
  });

  it("returns an empty map for no likes", () => {
    expect(groupBySession([]).size).toBe(0);
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates whitespace/underscores", () => {
    expect(slugify("DJ Cool_Cat Swing")).toBe("dj-cool-cat-swing");
  });

  it("strips diacritics via NFD normalization", () => {
    expect(slugify("Bénédicte Ångström")).toBe("benedicte-angstrom");
  });

  it("drops special characters and collapses repeated hyphens", () => {
    expect(slugify("D.J. & The -- Band!")).toBe("dj-the-band");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("  ~Night Owl~  ")).toBe("night-owl");
  });
});

describe("exportErrorCopy", () => {
  it("maps known statuses to their copy", () => {
    expect(exportErrorCopy(401)).toBe("Your sign-in expired — sign in again to update");
    expect(exportErrorCopy(409)).toBe(
      "Playlist export isn't set up yet — try again after the next update",
    );
    expect(exportErrorCopy(422)).toBe("None of your likes have a Spotify match yet");
    expect(exportErrorCopy(503)).toBe("Spotify is busy — try again in a minute");
  });

  it("includes the retry hint for 429 only when provided", () => {
    expect(exportErrorCopy(429, 42)).toBe("Hold on — try again in 42s");
    expect(exportErrorCopy(429)).toBe("Hold on — try again in a minute");
  });

  it("falls back to generic copy for unknown statuses", () => {
    expect(exportErrorCopy(500)).toBe("Export failed — try again");
  });
});
