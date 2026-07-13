/**
 * Admin panel API (internal, role-gated).
 *
 * Every route requires the `admin` role (`requireAdmin` → 404 to non-admins, so the panel's
 * existence isn't leaked) and is rate-limited. State-changing routes also pass the X-Pika-Client
 * CSRF check applied at mount in index.ts. V1 is approval + READ-ONLY supervision — no destructive
 * controls.
 *
 *   GET  /api/admin/me                 → { id, displayName, role }
 *   GET  /api/admin/djs                → DJ list (status, role, last-seen, Spotify status)
 *   POST /api/admin/djs/:id/approve    → set status 'approved' (audited)
 *   POST /api/admin/djs/:id/reject     → set status 'rejected' (audited)
 *   GET  /api/admin/overview           → live state (sessions, pollers, stages/events, connections)
 *   GET  /api/admin/audit              → recent admin actions
 *
 * Composed (2026-07) from `./admin/` submodules — panel.ts (me/overview/audit) / djs.ts /
 * catalog.ts / ops.ts. Behavior-preserving: every path + method is unchanged. `adminLimiter` +
 * `requireAdmin` live HERE, registered before the mounts, so every mounted route inherits them
 * regardless of submodule order. All prefixes are distinct static literals (the /catalog family
 * differs by segment depth), so mount order is free.
 */

import { logger } from "@pika/shared";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { requireAdmin } from "../lib/auth";
import { catalogRoutes } from "./admin/catalog";
import { djsRoutes } from "./admin/djs";
import { opsRoutes } from "./admin/ops";
import { panelRoutes } from "./admin/panel";

const admin = new Hono();

// Generous limit — the overview is polled ~every 15s by a handful of admin tabs.
const adminLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-6",
  keyGenerator: (c) =>
    c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "admin",
  handler: (c) => c.json({ error: "Too many requests" }, 429),
});

admin.use("*", adminLimiter);
admin.use("*", requireAdmin);

admin.route("/", panelRoutes);
admin.route("/", djsRoutes);
admin.route("/", catalogRoutes);
admin.route("/", opsRoutes);

logger.debug("🛠️ Admin routes mounted");

export { admin as adminRoutes };
