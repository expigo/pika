/**
 * /api/me guard tests — requireAuth short-circuits without a session (no DB needed;
 * routes/playlist.test.ts pattern). Real claim behavior lives in the integration suite.
 */

import { describe, expect, test } from "bun:test";
import { meRoutes } from "./me";

describe("/api/me guards", () => {
  test("POST /journal/claim → 401 without a session", async () => {
    const res = await meRoutes.request("/journal/claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: "client_x" }),
    });
    expect(res.status).toBe(401);
  });
});
