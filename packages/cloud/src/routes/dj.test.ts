import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { dj as djRoutes } from "./dj";

// The `/me/*` profile-management routes are `requireDjAuth`-guarded; with no session the middleware
// rejects BEFORE any DB call. (Deeper behavior — publish filter, playlist CRUD — is covered by the
// gated real-Postgres integration suite.) The public `GET /:slug` is intentionally unguarded.
const app = new Hono().route("/api/dj", djRoutes);

describe("dj /me/* profile-management auth guard", () => {
  const cases: Array<[string, string]> = [
    ["GET", "/api/dj/me/sessions"],
    ["PATCH", "/api/dj/me/sessions/some-id"],
    ["GET", "/api/dj/me/playlists"],
    ["POST", "/api/dj/me/playlists"],
    ["DELETE", "/api/dj/me/playlists/1"],
    ["POST", "/api/dj/me/sessions/some-id/playlist"],
    ["DELETE", "/api/dj/me/sessions/some-id/playlist"],
    ["GET", "/api/dj/me/booth"],
    ["PATCH", "/api/dj/me/booth"],
    ["POST", "/api/dj/me/gigs"],
    ["DELETE", "/api/dj/me/gigs/1"],
    // Slice D
    ["POST", "/api/dj/me/playlists/import"],
    ["GET", "/api/dj/me/curated-playlists"],
    ["PATCH", "/api/dj/me/curated-playlists/1"],
    ["DELETE", "/api/dj/me/curated-playlists/1"],
    ["GET", "/api/dj/me/crowd-pleasers"],
  ];
  for (const [method, path] of cases) {
    test(`${method} ${path} → 401 without a session`, async () => {
      const res = await app.request(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: method === "GET" || method === "DELETE" ? undefined : "{}",
      });
      expect(res.status).toBe(401);
    });
  }
});
