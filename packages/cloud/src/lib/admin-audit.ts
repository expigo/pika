/**
 * Admin audit log — append-only record of privileged actions for accountability.
 * Fire-and-forget (mirrors `logSessionEvent`): never blocks or fails the action it records.
 */

import { logger } from "@pika/shared";
import { db } from "../db";
import { adminAudit } from "../db/schema";

export function recordAdminAction(
  adminUserId: string,
  action: string, // e.g. 'dj.approve' | 'dj.reject'
  target?: { type: string; id: string | number },
  metadata?: Record<string, unknown>,
): void {
  db.insert(adminAudit)
    .values({
      adminUserId,
      action,
      targetType: target?.type,
      targetId: target?.id !== undefined ? String(target.id) : undefined,
      metadata,
    })
    .catch((e) => logger.error("Failed to record admin action", e));
}
