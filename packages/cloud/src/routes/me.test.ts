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

  test("Slice C/D surfaces (follows / preferences / compat) → 401 without a session", async () => {
    for (const [path, method, body] of [
      ["/follows/dj-nova", "PUT", JSON.stringify({ source: "live" })],
      ["/follows/dj-nova", "DELETE", undefined],
      ["/follows", "GET", undefined],
      ["/preferences", "GET", undefined],
      ["/preferences", "PUT", JSON.stringify({ recapEmails: true })],
      ["/compat/dj-nova", "GET", undefined],
    ] as const) {
      const res = await meRoutes.request(path, {
        method,
        ...(body ? { headers: { "Content-Type": "application/json" }, body } : {}),
      });
      expect(res.status).toBe(401);
    }
  });
});
