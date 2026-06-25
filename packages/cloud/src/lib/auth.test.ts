import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { requireAdmin, requireDjAuth, requireRole } from "./auth";

// The guards resolve identity via Better Auth's getSession. With no Authorization header or
// session cookie there's no token to look up, so these reject WITHOUT a DB call. The
// approved/role/admin-pass paths need a real session → covered by integration (#24).

describe("auth guards (Better Auth)", () => {
  test("requireDjAuth → 401 with no session", async () => {
    const app = new Hono().get("/x", requireDjAuth, (c) => c.json({ ok: true }));
    const res = await app.request("/x");
    expect(res.status).toBe(401);
  });

  test("requireAdmin → 401 with no session", async () => {
    const app = new Hono().get("/a", requireAdmin, (c) => c.json({ ok: true }));
    expect((await app.request("/a")).status).toBe(401);
  });

  test("requireRole → 401 with no session", async () => {
    const app = new Hono().get("/o", requireRole("organizer"), (c) => c.json({ ok: true }));
    expect((await app.request("/o")).status).toBe(401);
  });
});
