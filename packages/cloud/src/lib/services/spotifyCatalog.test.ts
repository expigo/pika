import { describe, expect, test } from "bun:test";
import { parseSpotifyPlaylistId, parseSpotifyUserId } from "./spotifyCatalog";

describe("parseSpotifyUserId", () => {
  test("extracts the id from a profile URL", () => {
    expect(parseSpotifyUserId("https://open.spotify.com/user/ichikoo")).toBe("ichikoo");
  });
  test("ignores query params + trailing path", () => {
    expect(parseSpotifyUserId("https://open.spotify.com/user/ichikoo?si=abc")).toBe("ichikoo");
    expect(parseSpotifyUserId("open.spotify.com/user/31abc/playlists")).toBe("31abc");
  });
  test("accepts a bare id", () => {
    expect(parseSpotifyUserId("ichikoo")).toBe("ichikoo");
  });
  test("rejects a non-user link or junk", () => {
    expect(parseSpotifyUserId("https://open.spotify.com/playlist/xyz")).toBeNull();
    expect(parseSpotifyUserId("")).toBeNull();
    expect(parseSpotifyUserId("not a link")).toBeNull();
  });
});

describe("parseSpotifyPlaylistId", () => {
  const ID = "37i9dQZF1DXcBWIGoYBM5M";
  test("extracts the 22-char id from a playlist URL (with query)", () => {
    expect(parseSpotifyPlaylistId(`https://open.spotify.com/playlist/${ID}?si=abc`)).toBe(ID);
  });
  test("accepts a spotify: URI and a bare id", () => {
    expect(parseSpotifyPlaylistId(`spotify:playlist:${ID}`)).toBe(ID);
    expect(parseSpotifyPlaylistId(ID)).toBe(ID);
  });
  test("rejects a track/user link, junk, and empty", () => {
    expect(parseSpotifyPlaylistId(`https://open.spotify.com/track/${ID}`)).toBeNull();
    expect(parseSpotifyPlaylistId("https://open.spotify.com/user/ichikoo")).toBeNull();
    expect(parseSpotifyPlaylistId("not a link")).toBeNull();
    expect(parseSpotifyPlaylistId("")).toBeNull();
  });
});
