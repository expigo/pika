/**
 * Stage / Event provisioning routes.
 *
 * Authenticated (DJ bearer token) creation of Events and Stages, plus public
 * read endpoints the client uses to resolve a stage from its QR/share URL.
 * No organizer UI yet — the full identity/role model is a separate blueprint.
 *
 * @file packages/cloud/src/routes/stages.ts
 * @package @pika/cloud
 */

import { zValidator } from "@hono/zod-validator";
import { CreateEventSchema, CreateStageSchema, logger, slugify } from "@pika/shared";
import { and, eq, isNull } from "drizzle-orm";
import type { Context } from "hono";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { db } from "../db";
import { events, stages } from "../db/schema";
import { getUserFromToken } from "../lib/auth";

export const stageRoutes = new Hono();

/** Resolve and validate the DJ bearer token; null when unauthenticated. */
async function requireDj(c: Context) {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.split(" ")[1];
  if (!token) return null;
  return getUserFromToken(token);
}

/** URL-safe id from a display name + short random suffix (collision-resistant). */
function makeId(name: string): string {
  const base = slugify(name).slice(0, 48) || "x";
  return `${base}-${crypto.randomUUID().slice(0, 8)}`;
}

// Creation endpoints are rate-limited per token (mirrors /api/push/send).
const createLimiter = rateLimiter({
  windowMs: 60 * 1000,
  limit: 20,
  keyGenerator: (c) => c.req.header("Authorization") || "anonymous",
});

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

stageRoutes.post("/events", createLimiter, zValidator("json", CreateEventSchema), async (c) => {
  const dj = await requireDj(c);
  if (!dj) return c.json({ error: "Unauthorized" }, 401);

  const { id, name } = c.req.valid("json");
  const eventId = id ?? makeId(name);

  try {
    const [created] = await db
      .insert(events)
      .values({ id: eventId, name, ownerUserId: dj.id })
      .onConflictDoNothing()
      .returning();

    if (!created) return c.json({ error: "Event id already exists" }, 409);
    logger.info("🎪 Event created", { eventId, ownerUserId: dj.id });
    return c.json(created, 201);
  } catch (e) {
    logger.error("Failed to create event", e);
    return c.json({ error: "Failed to create event" }, 500);
  }
});

// List the authenticated DJ's events (for the desktop stage picker).
stageRoutes.get("/events", async (c) => {
  const dj = await requireDj(c);
  if (!dj) return c.json({ error: "Unauthorized" }, 401);
  const rows = await db
    .select()
    .from(events)
    .where(and(eq(events.ownerUserId, dj.id), isNull(events.archivedAt)));
  return c.json({ events: rows });
});

stageRoutes.get("/events/:id/stages", async (c) => {
  const eventId = c.req.param("id");
  const rows = await db
    .select()
    .from(stages)
    .where(and(eq(stages.eventId, eventId), isNull(stages.archivedAt)));
  return c.json({ stages: rows });
});

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------

stageRoutes.post("/stages", createLimiter, zValidator("json", CreateStageSchema), async (c) => {
  const dj = await requireDj(c);
  if (!dj) return c.json({ error: "Unauthorized" }, 401);

  const { id, name, eventId } = c.req.valid("json");

  // If a parent event is named, it must exist (gives a 400 rather than a raw FK error).
  if (eventId) {
    const [parent] = await db.select({ id: events.id }).from(events).where(eq(events.id, eventId));
    if (!parent) return c.json({ error: "Parent event not found" }, 400);
  }

  const stageId = id ?? makeId(name);

  try {
    const [created] = await db
      .insert(stages)
      .values({ id: stageId, name, eventId: eventId ?? null })
      .onConflictDoNothing()
      .returning();

    if (!created) return c.json({ error: "Stage id already exists" }, 409);
    logger.info("🎭 Stage created", { stageId, eventId: eventId ?? null, ownerUserId: dj.id });
    return c.json(created, 201);
  } catch (e) {
    logger.error("Failed to create stage", e);
    return c.json({ error: "Failed to create stage" }, 500);
  }
});

// Public stage read (client resolves a stage from its QR / join code). Includes the
// parent event's name (null for a stand-alone stage) so dancers/DJs can show "Stage · Event".
stageRoutes.get("/stages/:id", async (c) => {
  const stageId = c.req.param("id");
  const [stage] = await db
    .select({
      id: stages.id,
      name: stages.name,
      eventId: stages.eventId,
      eventName: events.name,
      createdAt: stages.createdAt,
      archivedAt: stages.archivedAt,
    })
    .from(stages)
    .leftJoin(events, eq(events.id, stages.eventId))
    .where(and(eq(stages.id, stageId), isNull(stages.archivedAt)));
  if (!stage) return c.json({ error: "Stage not found" }, 404);
  return c.json(stage);
});
