/**
 * Push-target resolution — SCOPED notification routing.
 *
 * Replaces the unscoped "Global Megaphone" (a broadcast to every active
 * subscription). Push must reach BACKGROUNDED / disconnected devices, so it
 * cannot scope to in-memory listeners; it scopes via the durable
 * `stage_subscriptions` table (which client is at which stage):
 *
 *   push_subscriptions JOIN stage_subscriptions ON client_id WHERE stage_id = $1
 *
 * A stage-less session (the legacy / single-DJ MVP case) has no concurrent
 * context to leak across, so the global broadcast remains correct there — the
 * resolver falls back to {@link getAllActivePushTargets}.
 *
 * @file packages/cloud/src/lib/persistence/push-targets.ts
 * @package @pika/cloud
 */

import { and, desc, eq, getTableColumns, inArray, isNull } from "drizzle-orm";
import { db } from "../../db";
import { pushSubscriptions, stageSubscriptions, stages } from "../../db/schema";
import type { PikaPushSubscription } from "../../services/push";

/** Hard cap on a single broadcast fan-out. */
export const MAX_PUSH_TARGETS = 1000;

/**
 * All active subscriptions (global). The legacy/MVP broadcast — correct only
 * when there is no concurrent context to leak across (i.e. no stage).
 */
export function getAllActivePushTargets(limit = MAX_PUSH_TARGETS): Promise<PikaPushSubscription[]> {
  return db
    .select()
    .from(pushSubscriptions)
    .where(isNull(pushSubscriptions.unsubscribedAt))
    .limit(limit)
    .orderBy(desc(pushSubscriptions.createdAt));
}

/**
 * Active subscriptions for clients currently subscribed to a single stage.
 * One client may have several devices (endpoints) → several rows, all kept.
 */
export function getStagePushTargets(
  stageId: string,
  limit = MAX_PUSH_TARGETS,
): Promise<PikaPushSubscription[]> {
  return db
    .select(getTableColumns(pushSubscriptions))
    .from(pushSubscriptions)
    .innerJoin(stageSubscriptions, eq(stageSubscriptions.clientId, pushSubscriptions.clientId))
    .where(and(isNull(pushSubscriptions.unsubscribedAt), eq(stageSubscriptions.stageId, stageId)))
    .limit(limit);
}

/**
 * Active subscriptions for clients subscribed to ANY stage under an event.
 * A client at two stages of the same event would appear twice → dedup by
 * endpoint so each device is notified once.
 */
export async function getEventPushTargets(
  eventId: string,
  limit = MAX_PUSH_TARGETS,
): Promise<PikaPushSubscription[]> {
  const rows = await db
    .select(getTableColumns(pushSubscriptions))
    .from(pushSubscriptions)
    .innerJoin(stageSubscriptions, eq(stageSubscriptions.clientId, pushSubscriptions.clientId))
    .innerJoin(stages, eq(stages.id, stageSubscriptions.stageId))
    .where(and(isNull(pushSubscriptions.unsubscribedAt), eq(stages.eventId, eventId)))
    .limit(limit);

  const byEndpoint = new Map<string, PikaPushSubscription>();
  for (const row of rows) byEndpoint.set(row.endpoint, row);
  return [...byEndpoint.values()];
}

/**
 * Resolver for a DJ announcement: scope to the session's stage when it has one,
 * else fall back to the global broadcast (correct for a stage-less session).
 */
export function getAnnouncementPushTargets(session: {
  stageId?: string | null;
}): Promise<PikaPushSubscription[]> {
  return session.stageId ? getStagePushTargets(session.stageId) : getAllActivePushTargets();
}

/**
 * Active subscriptions for an explicit set of clientIds (Slice C: the recap push targets an
 * account's claimed devices). `endpoint` is the PK, so rows are already device-unique.
 * Backed by idx_push_subscriptions_client_id.
 */
export function getClientIdsPushTargets(
  clientIds: string[],
  limit = MAX_PUSH_TARGETS,
): Promise<PikaPushSubscription[]> {
  if (clientIds.length === 0) return Promise.resolve([]);
  return db
    .select()
    .from(pushSubscriptions)
    .where(
      and(isNull(pushSubscriptions.unsubscribedAt), inArray(pushSubscriptions.clientId, clientIds)),
    )
    .limit(limit);
}
