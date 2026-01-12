import { expect, test, describe } from "bun:test";
import { normalizeTrack } from "./utils";

describe("normalizeTrack", () => {
  test("trims whitespace", () => {
    const result = normalizeTrack("  Artist  ", "  Title  ");
    expect(result).toEqual({ artist: "Artist", title: "Title" });
  });

  test("removes feat. from title", () => {
    expect(normalizeTrack("Artist", "Title feat. Guest")).toEqual({
      artist: "Artist",
      title: "Title",
    });
    expect(normalizeTrack("Artist", "Title (feat. Guest)")).toEqual({
      artist: "Artist",
      title: "Title",
    });
    expect(normalizeTrack("Artist", "Title [ft. Guest]")).toEqual({
      artist: "Artist",
      title: "Title",
    });
  });

  test("removes official video suffixes", () => {
    expect(normalizeTrack("Artist", "Song (Official Video)")).toEqual({
      artist: "Artist",
      title: "Song",
    });
    expect(normalizeTrack("Artist", "Song [Official Audio]")).toEqual({
      artist: "Artist",
      title: "Song",
    });
    expect(normalizeTrack("Artist", "Song (Lyrics)")).toEqual({ artist: "Artist", title: "Song" });
  });

  test("removes Mix suffixes", () => {
    expect(normalizeTrack("Artist", "Song (Original Mix)")).toEqual({
      artist: "Artist",
      title: "Song",
    });
    expect(normalizeTrack("Artist", "Song [Extended Mix]")).toEqual({
      artist: "Artist",
      title: "Song",
    });
  });

  test("does not remove significant parts", () => {
    expect(normalizeTrack("Artist", "Song (Live)")).toEqual({
      artist: "Artist",
      title: "Song (Live)",
    }); // Maybe keep Live?
  });
});
