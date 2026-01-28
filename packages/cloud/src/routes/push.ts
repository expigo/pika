import { zValidator } from "@hono/zod-validator";
import { logger } from "@pika/shared";
import { desc, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { db } from "../db";
import { djTokens, pushSubscriptions } from "../db/schema";
import { PushService } from "../services/push";

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

push.post("/send", zValidator("json", SendSchema), async (c) => {
  // 🛡️ Security: Authenticate DJ using Bearer token
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  const token = authHeader.split(" ")[1];
  if (!token) {
    return c.json({ error: "Invalid token format" }, 401);
  }

  // Explicit query to avoid Drizzle inference issues
  const tokenRecords = await db.select().from(djTokens).where(eq(djTokens.token, token)).limit(1);

  if (tokenRecords.length === 0) {
    return c.json({ error: "Invalid token" }, 401);
  }

  // We know it's valid now. Can fetch DJ info if needed later.

  const { payload, filter } = c.req.valid("json");
  const finalPayload = typeof payload === "string" ? payload : JSON.stringify(payload);

  try {
    // Scalability: Efficient Batching for notifications
    const targets = await db
      .select()
      .from(pushSubscriptions)
      .where(isNull(pushSubscriptions.unsubscribedAt))
      .limit(filter === "debug" ? 5 : 1000)
      .orderBy(desc(pushSubscriptions.createdAt));

    logger.info(`[Push] Broadcasting to ${targets.length} targets (Filter: ${filter})`);

    const results = await Promise.allSettled(
      targets.map((sub) => PushService.send(sub, finalPayload)),
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
