import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { playlistRoutes } from "./playlist";

// requireDjAuth guards every route; with no session the middleware rejects BEFORE any Spotify/DB
// call, so these run without network or a database. Deeper behavior (search/create) is covered by
// the spotifyMatch unit tests + manual E2E.
const app = new Hono().route("/api/playlist", playlistRoutes);

describe("playlist route auth guard", () => {
  for (const path of ["/api/playlist/search", "/api/playlist/create"] as const) {
    test(`POST ${path} → 401 without a session`, async () => {
      const res = await app.request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(401);
    });
  }
});
