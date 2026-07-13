/**
 * Admin self/system reads — the identity gate (`/me`), the live overview, and the audit trail.
 * Split (2026-07) from routes/admin.ts, behavior-preserving.
 *
 * Auth: the composer (`../admin.ts`) applies adminLimiter + requireAdmin to every /api/admin
 * route BEFORE the mounts; CSRF (`X-Pika-Client`) is applied at the /api/admin mount in index.ts.
 */

import { desc, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { db } from "../../db";
import { adminAudit, events, livePollers, stages } from "../../db/schema";
import { getUser } from "../../lib/auth";
import { getActiveConnectionCount } from "../../lib/connection-registry";
import { getListenerCount } from "../../lib/listeners";
import { getAllSessions } from "../../lib/sessions";

export const panelRoutes = new Hono();

/** Identity check used by the web gate. */
panelRoutes.get("/me", (c) => {
  const dj = getUser(c);
  return c.json({ id: dj.id, displayName: dj.name, role: dj.role });
});

/** Read-only live overview for supervision. */
panelRoutes.get("/overview", async (c) => {
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
panelRoutes.get("/audit", async (c) => {
  const rows = await db.select().from(adminAudit).orderBy(desc(adminAudit.createdAt)).limit(50);
  return c.json({ audit: rows });
});
