import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { adminRoutes } from "./admin";

// requireAdmin rejects unauthenticated requests BEFORE any DB call, so these run without a
// database. Role-mismatch (404) + admin-pass + approve/reject are covered in ../__tests__/integration/admin.integration.test.ts.
const app = new Hono().route("/api/admin", adminRoutes);

describe("admin routes auth guard", () => {
  for (const [method, path] of [
    ["GET", "/api/admin/me"],
    ["GET", "/api/admin/djs"],
    ["GET", "/api/admin/overview"],
    ["GET", "/api/admin/audit"],
    ["GET", "/api/admin/catalog"],
    ["GET", "/api/admin/catalog/songs"],
    ["GET", "/api/admin/catalog/songs/abc"],
    ["POST", "/api/admin/djs"],
    ["POST", "/api/admin/djs/1/approve"],
    ["POST", "/api/admin/djs/1/reject"],
    ["POST", "/api/admin/playlists/backfill-titles"],
  ] as const) {
    test(`${method} ${path} → 401 without a session`, async () => {
      const res = await app.request(path, { method });
      expect(res.status).toBe(401);
    });
  }
});
