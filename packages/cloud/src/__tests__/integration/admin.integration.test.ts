/**
 * Admin panel: identity gate, approve + audit, overview, create-DJ.
 * Moved verbatim from src/__tests__/db.integration.test.ts L1062-1179 @ 2d3f846
 * (2026-07 split; only the shared uniq() helper was deduped into ./harness).
 *
 * Gated by RUN_DB_TESTS via ./harness (plain `bun test` skips). Run ISOLATED:
 * `bun run test:integration` — never bare `RUN_DB_TESTS=1 bun test` (unit files
 * mock modules process-globally). Pool teardown lives in the bunfig preload.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { adminRoutes as adminRoute } from "../../routes/admin";
import { stageRoutes } from "../../routes/stages";
import { ensureBaseSession, setupIntegrationEnv, signUpDj, suite } from "./harness";

suite("DB integration (real Postgres)", () => {
  beforeAll(async () => {
    setupIntegrationEnv();
    await ensureBaseSession();
  });

  describe("Admin panel", () => {
    let adminId: string;
    let adminToken: string;
    let pendingId: string;
    let pendingToken: string;
    const cleanupUsers: string[] = [];

    async function seedDj(
      opts: { approved?: boolean; admin?: boolean } = {},
    ): Promise<{ userId: string; token: string }> {
      const r = await signUpDj(opts);
      cleanupUsers.push(r.userId);
      return r;
    }
    const asAdmin = (path: string, init: RequestInit = {}) =>
      adminRoute.request(path, {
        ...init,
        headers: { Authorization: `Bearer ${adminToken}`, ...(init.headers ?? {}) },
      });

    beforeAll(async () => {
      ({ userId: adminId, token: adminToken } = await seedDj({ admin: true, approved: true }));
      ({ userId: pendingId, token: pendingToken } = await seedDj()); // status defaults to 'pending'
    });
    afterAll(async () => {
      await db.delete(schema.adminAudit).where(eq(schema.adminAudit.adminUserId, adminId));
      for (const id of cleanupUsers) {
        await db.delete(schema.user).where(eq(schema.user.id, id));
      }
    });

    test("role defaults to 'dj' for a normal account", async () => {
      const [row] = await db
        .select({ role: schema.user.role })
        .from(schema.user)
        .where(eq(schema.user.id, pendingId));
      expect(row?.role).toBe("dj");
    });

    test("GET /me → 200 admin identity for an admin; 404 for a non-admin (hidden)", async () => {
      const ok = await asAdmin("/me");
      expect(ok.status).toBe(200);
      expect(((await ok.json()) as { role: string }).role).toBe("admin");

      const denied = await adminRoute.request("/me", {
        headers: { Authorization: `Bearer ${pendingToken}` },
      });
      expect(denied.status).toBe(404);
    });

    test("approve flips status to 'approved' and writes an audit row", async () => {
      const res = await asAdmin(`/djs/${pendingId}/approve`, { method: "POST" });
      expect(res.status).toBe(200);

      const [row] = await db
        .select({ status: schema.user.status })
        .from(schema.user)
        .where(eq(schema.user.id, pendingId));
      expect(row?.status).toBe("approved");

      await new Promise((r) => setTimeout(r, 80)); // audit is fire-and-forget
      const audit = await db
        .select()
        .from(schema.adminAudit)
        .where(eq(schema.adminAudit.adminUserId, adminId));
      expect(audit.some((a) => a.action === "dj.approve" && a.targetId === pendingId)).toBe(true);
    });

    test("a rejected DJ is refused at a protected route with 403", async () => {
      const { userId, token } = await seedDj(); // pending
      expect((await asAdmin(`/djs/${userId}/reject`, { method: "POST" })).status).toBe(200);

      // requireDjAuth gates the stage routes: a valid session whose status isn't
      // 'approved' → 403 (not 401 — the token/session itself is valid).
      const denied = await stageRoutes.request("/events", {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(denied.status).toBe(403);
    });

    test("GET /overview returns the live-state shape", async () => {
      const res = await asAdmin("/overview");
      expect(res.status).toBe(200);
      const body = (await res.json()) as { sessions: unknown[]; connections: number };
      expect(Array.isArray(body.sessions)).toBe(true);
      expect(typeof body.connections).toBe("number");
    });

    test("create DJ: admin makes an approved 'dj' WITHOUT clobbering the admin session", async () => {
      const email = `created_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}@itest.dev`;
      const created = await asAdmin("/djs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName: "Created DJ", password: "validpassword123" }),
      });
      expect(created.status).toBe(200);
      const { id } = (await created.json()) as { id: string };
      cleanupUsers.push(id);

      const [row] = await db
        .select({ role: schema.user.role, status: schema.user.status })
        .from(schema.user)
        .where(eq(schema.user.id, id));
      expect(row?.role).toBe("dj");
      expect(row?.status).toBe("approved"); // admin-created → approved, not pending

      // The admin's own session is untouched (Better Auth createUser issues NO session for the new user).
      expect((await asAdmin("/me")).status).toBe(200);

      // Duplicate email → 409.
      const dup = await asAdmin("/djs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, displayName: "Dup", password: "validpassword123" }),
      });
      expect(dup.status).toBe(409);
    });
  });
});
