import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { djLiveRoutes } from "./dj-live";

// requireDjAuth guards every route. With no token the middleware rejects BEFORE any
// DB/poller call, so these run without a database. Deeper behavior (connection gate,
// poller start/stop) is covered by the poller unit tests + manual E2E.
const app = new Hono().route("/api/live", djLiveRoutes);

describe("dj-live control channel auth guard", () => {
  for (const [method, path] of [
    ["POST", "/api/live/start"],
    ["POST", "/api/live/stop"],
    ["POST", "/api/live/share"],
    ["POST", "/api/live/announcement"],
    ["POST", "/api/live/announcement/cancel"],
    ["POST", "/api/live/poll/start"],
    ["POST", "/api/live/poll/end"],
    ["GET", "/api/live/status"],
  ] as const) {
    test(`${method} ${path} → 401 without a session`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    });
  }
});
