import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { clearSessionCookie, requireDjAuth, SESSION_COOKIE, setSessionCookie } from "./auth";

// These tests cover the parts of the web-session layer that don't touch the DB:
// cookie shape + the no-token rejection path of requireDjAuth. The full
// pending/approved + cookie-auth path is covered by integration/E2E (DB-backed).

describe("session cookie helpers", () => {
  test("setSessionCookie emits an httpOnly, SameSite=Lax, path=/ cookie", async () => {
    const app = new Hono();
    app.get("/set", (c) => {
      setSessionCookie(c, "tok_abc123");
      return c.text("ok");
    });

    const res = await app.request("/set");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=tok_abc123`);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    // NODE_ENV is not "production" under test → no Secure flag (so it sets over http).
    expect(cookie).not.toContain("Secure");
  });

  test("clearSessionCookie expires the cookie", async () => {
    const app = new Hono();
    app.get("/clear", (c) => {
      clearSessionCookie(c);
      return c.text("ok");
    });

    const res = await app.request("/clear");
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain(`${SESSION_COOKIE}=`);
    expect(cookie).toMatch(/Max-Age=0|Expires=/i);
  });
});

describe("requireDjAuth", () => {
  test("rejects with 401 when no token is present (no DB hit)", async () => {
    const app = new Hono();
    app.get("/protected", requireDjAuth, (c) => c.json({ ok: true }));

    const res = await app.request("/protected");
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Authentication required" });
  });
});
