import { zValidator } from "@hono/zod-validator";
import { logger } from "@pika/shared";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { db } from "../db";
import { pushSubscriptions } from "../db/schema";
import { requireDjAuth } from "../lib/auth";
import { getAllActivePushTargets } from "../lib/persistence/push-targets";
import { sendPushNotification } from "../services/push";

export const push = new Hono();

// Schema for subscription object
const SubscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string(),
    auth: z.string(),
  }),
  clientId: z.string().optional(),
});

/**
 * POST /api/push/subscribe
 * Public endpoint for browsers to register their subscription.
 * Idempotent (Upsert).
 */
push.post("/subscribe", zValidator("json", SubscriptionSchema), async (c) => {
  const { endpoint, keys, clientId } = c.req.valid("json");

  try {
    await db
      .insert(pushSubscriptions)
      .values({
        endpoint,
        p256dh: keys.p256dh,
        auth: keys.auth,
        clientId,
        // Data Integrity: If re-subscribing, clear unsubscribedAt (resurrect subscription)
        unsubscribedAt: null,
      })
      .onConflictDoUpdate({
        target: pushSubscriptions.endpoint,
        set: {
          p256dh: keys.p256dh,
          auth: keys.auth,
          // Update clientId if changed (e.g. user cleared cookies but browser kept push)
          clientId: clientId || undefined,
          unsubscribedAt: null, // Resurrect logic
        },
      });

    logger.info("[Push] Registered subscription", { endpoint: `${endpoint.substring(0, 30)}...` });
    return c.json({ success: true });
  } catch (e) {
    logger.error("[Push] Registration failed", e);
    return c.json({ error: "Failed to register subscription" }, 500);
  }
});

// Schema for sending notifications
const SendSchema = z.object({
  payload: z.string().or(
    z.object({
      title: z.string(),
      body: z.string(),
      icon: z.string().optional(),
      data: z.any().optional(),
    }),
  ),
  filter: z.enum(["all", "debug"]).default("debug"),
});

/**
 * POST /api/push/send
 * Protected endpoint (DJs only) to broadcast notifications.
 * Rate Limit: 10 requests per minute per DJ.
 */
push.use(
  "/send",
  rateLimiter({
    windowMs: 60 * 1000, // 1 minute
    limit: 10, // 10 sends per minute per DJ
    keyGenerator: (c) => c.req.header("Authorization") || "anonymous",
  }),
);

push.post("/send", zValidator("json", SendSchema), requireDjAuth, async (c) => {
  // 🛡️ Approved DJs only — requireDjAuth gates 401 (unauth) / 403 (unapproved).
  // (The approval check matters post-Better-Auth: pending/rejected accounts now
  // hold a valid session, so the gate must be enforced here, not at login.)
  const { payload, filter } = c.req.valid("json");
  const finalPayload = typeof payload === "string" ? payload : JSON.stringify(payload);

  try {
    // Admin/debug broadcast tool: intentionally global (no session context on
    // this REST path). Product-facing announcements use the SCOPED resolver in
    // lib/persistence/push-targets.ts (see handlers/dj.ts SEND_ANNOUNCEMENT).
    const targets = await getAllActivePushTargets(filter === "debug" ? 5 : 1000);

    logger.info(`[Push] Broadcasting to ${targets.length} targets (Filter: ${filter})`);

    const results = await Promise.allSettled(
      targets.map((sub) => sendPushNotification(sub, finalPayload)),
    );

    const successCount = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
    const failCount = results.length - successCount;

    return c.json({
      success: true,
      stats: { sent: successCount, failed: failCount, total: targets.length },
    });
  } catch (e) {
    logger.error("[Push] Broadcast failed", e);
    return c.json({ error: "Broadcast failed" }, 500);
  }
});
