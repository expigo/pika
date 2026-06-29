import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { seedRoutes } from "./seed";

// requireAdmin guards every route; with no session it rejects (401) BEFORE any Spotify/DB call,
// so these run without network or a database. The seed behavior is covered by the catalog +
// spotifyMatch unit tests + manual staging.
const app = new Hono().route("/api/admin/seed", seedRoutes);

describe("seed route admin guard", () => {
  for (const [method, path] of [
    ["GET", "/api/admin/seed/playlists?profile=ichikoo"],
    ["GET", "/api/admin/seed/playlist/abc/tracks"],
    ["POST", "/api/admin/seed/curate"],
  ] as const) {
    test(`${method} ${path} → 401 without a session`, async () => {
      const res = await app.request(path, {
        method,
        ...(method === "POST"
          ? { headers: { "Content-Type": "application/json" }, body: "{}" }
          : {}),
      });
      expect(res.status).toBe(401);
    });
  }
});
