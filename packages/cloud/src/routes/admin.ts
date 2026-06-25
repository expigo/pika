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
 */

import { logger } from "@pika/shared";
import { desc, eq, isNull, max, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { db } from "../db";
import {
  adminAudit,
  djTokens,
  djUsers,
  events,
  livePollers,
  spotifyConnections,
  stages,
} from "../db/schema";
import { recordAdminAction } from "../lib/admin-audit";
import { getDjUser, requireAdmin } from "../lib/auth";
import { getActiveConnectionCount } from "../lib/connection-registry";
import { getListenerCount } from "../lib/listeners";
import { getAllSessions } from "../lib/sessions";

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

/** Identity check used by the web gate. */
admin.get("/me", (c) => {
  const dj = getDjUser(c);
  return c.json({ id: dj.id, displayName: dj.displayName, role: dj.role });
});

/** All DJ accounts with approval + Spotify-connection status (pending first). */
admin.get("/djs", async (c) => {
  const rows = await db
    .select({
      id: djUsers.id,
      email: djUsers.email,
      displayName: djUsers.displayName,
      slug: djUsers.slug,
      status: djUsers.status,
      role: djUsers.role,
      createdAt: djUsers.createdAt,
      lastSeen: max(djTokens.lastUsed),
      spotifyStatus: spotifyConnections.status,
    })
    .from(djUsers)
    .leftJoin(djTokens, eq(djTokens.djUserId, djUsers.id))
    .leftJoin(spotifyConnections, eq(spotifyConnections.djUserId, djUsers.id))
    .groupBy(djUsers.id, spotifyConnections.status)
    .orderBy(sql`(${djUsers.status} = 'pending') desc`, desc(djUsers.createdAt));
  return c.json({ djs: rows });
});

async function setDjStatus(c: Context, status: "approved" | "rejected", action: string) {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return c.json({ error: "Invalid id" }, 400);

  const [updated] = await db
    .update(djUsers)
    .set({ status })
    .where(eq(djUsers.id, id))
    .returning({ id: djUsers.id });
  if (!updated) return c.json({ error: "DJ not found" }, 404);

  recordAdminAction(getDjUser(c).id, action, { type: "dj_user", id });
  return c.json({ success: true });
}

admin.post("/djs/:id/approve", (c) => setDjStatus(c, "approved", "dj.approve"));
admin.post("/djs/:id/reject", (c) => setDjStatus(c, "rejected", "dj.reject"));

/** Read-only live overview for supervision. */
admin.get("/overview", async (c) => {
  const live = getAllSessions();

  const [pollers, activeStages, activeEvents] = await Promise.all([
    db
      .select({
        sessionId: livePollers.sessionId,
        djUserId: livePollers.djUserId,
        status: livePollers.status,
        heartbeatAt: livePollers.heartbeatAt,
      })
      .from(livePollers),
    db
      .select({ id: stages.id, name: stages.name, eventId: stages.eventId })
      .from(stages)
      .where(isNull(stages.archivedAt)),
    db.select({ id: events.id, name: events.name }).from(events).where(isNull(events.archivedAt)),
  ]);

  const pollerSessions = new Set(pollers.map((p) => p.sessionId));
  const sessions = live.map((s) => ({
    sessionId: s.sessionId,
    djName: s.djName,
    currentTrack: s.currentTrack
      ? { title: s.currentTrack.title, artist: s.currentTrack.artist }
      : null,
    startedAt: s.startedAt,
    stageName: s.stageName ?? null,
    listeners: getListenerCount(s.sessionId),
    source: pollerSessions.has(s.sessionId) ? "spotify" : "vdj",
  }));

  return c.json({
    sessions,
    pollers,
    stages: activeStages,
    events: activeEvents,
    connections: getActiveConnectionCount(),
    generatedAt: new Date().toISOString(),
  });
});

/** Recent admin actions. */
admin.get("/audit", async (c) => {
  const rows = await db.select().from(adminAudit).orderBy(desc(adminAudit.createdAt)).limit(50);
  return c.json({ audit: rows });
});

logger.debug("🛠️ Admin routes mounted");

export { admin as adminRoutes };
