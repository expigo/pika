import { describe, expect, test } from "bun:test";
import { getFuzzyKey, getTrackKey, normalizeExact, normalizeFuzzy } from "./utils";

describe("getTrackKey (exact)", () => {
  test("normalizes case and whitespace", () => {
    expect(getTrackKey("  DELTA dreambox  ", "  Queen of   Loneliness  ")).toBe(
      "delta dreambox::queen of loneliness",
    );
  });

  test("preserves remix info", () => {
    expect(getTrackKey("Artist", "Song (Remix)")).toBe("artist::song (remix)");
  });

  test("preserves feat info", () => {
    expect(getTrackKey("Artist feat. Other", "Song")).toBe("artist feat. other::song");
  });

  test("preserves version info", () => {
    expect(getTrackKey("Artist", "Song [Radio Edit]")).toBe("artist::song [radio edit]");
  });

  test("works with object input", () => {
    expect(getTrackKey({ artist: "Artist", title: "Song" })).toBe("artist::song");
  });
});

describe("getFuzzyKey (fuzzy)", () => {
  test("removes parentheses content", () => {
    expect(getFuzzyKey("Artist", "Song (Remix)")).toBe("artist::song");
  });

  test("removes bracket content", () => {
    expect(getFuzzyKey("Artist", "Song [Radio Edit]")).toBe("artist::song");
  });

  test("removes feat info", () => {
    expect(getFuzzyKey("Artist feat. Other", "Song")).toBe("artist::song");
  });

  test("removes ft. info", () => {
    expect(getFuzzyKey("Artist ft. Other", "Song")).toBe("artist::song");
  });

  test("removes & collaborators", () => {
    expect(getFuzzyKey("Artist & Other", "Song")).toBe("artist::song");
  });

  test("works with object input", () => {
    expect(getFuzzyKey({ artist: "Artist (feat. X)", title: "Song [Remix]" })).toBe("artist::song");
  });
});

describe("normalizeExact", () => {
  test("lowercases and trims", () => {
    expect(normalizeExact("  HELLO World  ")).toBe("hello world");
  });

  test("collapses multiple spaces", () => {
    expect(normalizeExact("hello   world")).toBe("hello world");
  });
});

describe("normalizeFuzzy", () => {
  test("removes all parentheses", () => {
    expect(normalizeFuzzy("Song (Live) (Remix)")).toBe("song");
  });

  test("removes punctuation", () => {
    expect(normalizeFuzzy("It's A Song!")).toBe("its a song");
  });
});
