import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { hasDjAccess, requireAdmin, requireAuth, requireDjAuth, requireRole } from "./auth";

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

  test("requireAuth → 401 with no session", async () => {
    const app = new Hono().get("/m", requireAuth, (c) => c.json({ ok: true }));
    expect((await app.request("/m")).status).toBe(401);
  });
});

// Slice B security fix: DJ surfaces gate on status AND role — an auto-approved dancer must
// never pass. Pure predicate → the full matrix is unit-testable without sessions.
describe("hasDjAccess", () => {
  test("approved dj/admin → ok", () => {
    expect(hasDjAccess({ role: "dj", status: "approved" })).toBe("ok");
    expect(hasDjAccess({ role: "admin", status: "approved" })).toBe("ok");
  });

  test("approved dancer → forbidden (THE Slice-B hole this closes)", () => {
    expect(hasDjAccess({ role: "dancer", status: "approved" })).toBe("forbidden");
  });

  test("missing/unknown role → forbidden even when approved", () => {
    expect(hasDjAccess({ role: null, status: "approved" })).toBe("forbidden");
    expect(hasDjAccess({ status: "approved" })).toBe("forbidden");
    expect(hasDjAccess({ role: "organizer", status: "approved" })).toBe("forbidden");
  });

  test("unapproved beats role — pending/rejected dj is unapproved, not forbidden", () => {
    expect(hasDjAccess({ role: "dj", status: "pending" })).toBe("unapproved");
    expect(hasDjAccess({ role: "dj", status: "rejected" })).toBe("unapproved");
    expect(hasDjAccess({ role: "admin", status: null })).toBe("unapproved");
  });
});
