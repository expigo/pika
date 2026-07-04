/**
 * Announcement fan-out — shared by the WS handler (desktop DJ) and the REST endpoint (web DJ).
 *
 * `publish` is supplied by the caller so the transport stays the caller's concern: the WS handler
 * passes `rawWs.publish` (excludes the sender + honours backpressure); the REST endpoint passes a
 * `getBroadcaster()`-based publisher. The in-session banner is unthrottled; the optional Web-Push
 * fan-out is rate-limited per session (each push hits every subscriber's device).
 */

import { LIMITS, logger } from "@pika/shared";
import { sendPushNotification } from "../services/push";
import type { PublishFn } from "./live-session";
import { getAnnouncementPushTargets } from "./persistence/push-targets";
import { ClientRateLimiter } from "./rate-limit";
import {
  getSession,
  getSessionBroadcastTopic,
  type LiveSession,
  setSessionAnnouncement,
} from "./sessions";

export const announcementPushLimiter = new ClientRateLimiter(
  LIMITS.ANNOUNCEMENT_PUSH_RATE_LIMIT_MAX,
  LIMITS.ANNOUNCEMENT_PUSH_RATE_LIMIT_WINDOW,
);

async function broadcastAnnouncementPush(djSession: LiveSession, message: string): Promise<void> {
  try {
    // SCOPED push: a staged session reaches only that stage's subscribers; a stage-less session
    // falls back to the global broadcast. See lib/persistence/push-targets.ts.
    const targets = await getAnnouncementPushTargets(djSession);
    if (targets.length === 0) return;
    logger.info(`[Push] Broadcasting announcement to ${targets.length} targets`, {
      scoped: Boolean(djSession.stageId),
    });
    const payload = JSON.stringify({
      title: `Announcement from ${djSession.djName}`,
      body: message,
      data: { url: "/live" },
    });
    await Promise.allSettled(targets.map((sub) => sendPushNotification(sub, payload)));
  } catch (e) {
    logger.error("[Push] Failed to broadcast announcement push", e);
  }
}

/**
 * Store + broadcast a transient announcement for a live session, with optional Web Push. Returns
 * `false` if the session doesn't exist. Ownership is the caller's responsibility (WS: `djSessionId`
 * match; REST: the session is resolved from the authenticated DJ's own poller).
 */
export function announceToSession(
  sessionId: string,
  opts: { message: string; durationSeconds?: number | undefined; push?: boolean | undefined },
  publish: PublishFn,
): boolean {
  const djSession = getSession(sessionId);
  if (!djSession) return false;

  const timestamp = new Date().toISOString();
  const endsAt = opts.durationSeconds
    ? new Date(Date.now() + opts.durationSeconds * 1000).toISOString()
    : undefined;

  setSessionAnnouncement(sessionId, {
    message: opts.message,
    timestamp,
    ...(endsAt && { endsAt }),
  });

  publish(
    getSessionBroadcastTopic(sessionId),
    JSON.stringify({
      type: "ANNOUNCEMENT_RECEIVED",
      sessionId,
      message: opts.message,
      djName: djSession.djName,
      timestamp,
      endsAt,
    }),
  );

  logger.info("📢 Announcement", {
    djName: djSession.djName,
    message: opts.message,
    durationSeconds: opts.durationSeconds,
    push: opts.push,
  });

  if (opts.push) {
    if (announcementPushLimiter.check(sessionId)) {
      void broadcastAnnouncementPush(djSession, opts.message);
    } else {
      logger.warn("⏳ Announcement push rate-limited; banner sent, push skipped", { sessionId });
    }
  }
  return true;
}

/**
 * Clear the session's active announcement and broadcast ANNOUNCEMENT_CANCELLED so every receiver's
 * banner disappears (not just the local viewer's dismiss). Returns `false` if the session is gone.
 */
export function cancelSessionAnnouncement(sessionId: string, publish: PublishFn): boolean {
  if (!getSession(sessionId)) return false;
  setSessionAnnouncement(sessionId, null);
  publish(
    getSessionBroadcastTopic(sessionId),
    JSON.stringify({ type: "ANNOUNCEMENT_CANCELLED", sessionId }),
  );
  logger.info("📢❌ Announcement cancelled", { sessionId });
  return true;
}
