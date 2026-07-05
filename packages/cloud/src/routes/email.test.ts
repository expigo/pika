/**
 * /api/email/unsubscribe unit tests — token-shape rejection + the GET-never-mutates contract.
 * The consent-clearing happy path (real DB) lives in the integration suite.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { emailRoutes } from "./email";

beforeAll(() => {
  process.env["BETTER_AUTH_SECRET"] ??= "test-secret-for-unsub-tokens";
});

describe("/api/email/unsubscribe", () => {
  test("POST with garbage token → 400 (query, JSON body, and form body shapes)", async () => {
    const viaQuery = await emailRoutes.request("/unsubscribe?token=garbage", { method: "POST" });
    expect(viaQuery.status).toBe(400);

    const viaJson = await emailRoutes.request("/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: "garbage" }),
    });
    expect(viaJson.status).toBe(400);

    // RFC 8058 one-click posts form-encoded — the route must parse it, never json()-first.
    const viaForm = await emailRoutes.request("/unsubscribe", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        "List-Unsubscribe": "One-Click",
        token: "garbage",
      }).toString(),
    });
    expect(viaForm.status).toBe(400);
  });

  test("POST with no token at all → 400", async () => {
    const res = await emailRoutes.request("/unsubscribe", { method: "POST" });
    expect(res.status).toBe(400);
  });

  test("GET never mutates — 302 to the web confirm page with the token forwarded", async () => {
    const res = await emailRoutes.request("/unsubscribe?token=abc%2Fdef", { method: "GET" });
    expect(res.status).toBe(302);
    const location = res.headers.get("Location") ?? "";
    expect(location).toContain("/unsubscribe?token=abc%2Fdef");
  });
});
