import { describe, expect, test } from "bun:test";
import { parseSpotifyUserId } from "./spotifyCatalog";

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
