/**
 * Telemetry Routes — product-usage event ingest (fire-and-forget beacons from the web app).
 *
 * POST /events — enum-whitelisted, size-capped, per-IP rate-limited. Rows land in
 * `product_events` (distinct from `session_events`, which is connection telemetry). Mounted at
 * /api/telemetry — NOT /api/events, which belongs to the venue Stage/Event model (routes/stages).
 * Insert failures are swallowed: a beacon must never surface an error to the dancer.
 */

import { LIMITS, logger } from "@pika/shared";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { db, schema } from "../db";

/** The full product-event vocabulary — reject anything else at the boundary. */
export const PRODUCT_EVENTS = [
  "journal_opened",
  "journal_spotify_click",
  "journal_export_created",
  "journal_export_updated",
  "journal_export_failed",
  "journal_load_more",
  "journal_removed_like",
  "install_nudge_shown",
  "account_save_card_shown",
  "account_magic_link_requested",
  "account_linked",
  "account_claim_conflict",
  "account_signed_out",
  "account_deletion_requested",
  "account_otp_requested",
  "account_device_unlinked",
  // Slice C — The Relationship Loop
  "follow_tapped",
  "follow_completed",
  "unfollowed",
  "booth_viewed",
  "gig_link_clicked",
  "thanks_sent",
  "interstitial_shown",
  "card_generated",
  "card_shared",
  "email_prefs_updated",
  // Slice D — Musical Identity
  "playlist_imported",
  "playlist_promoted",
  "dj_stats_viewed",
  "compat_viewed",
] as const;

const EventBody = z.object({
  event: z.enum(PRODUCT_EVENTS),
  clientId: z
    .string()
    .regex(/^client_[a-zA-Z0-9_-]+$/i)
    .max(80)
    .optional(),
  sessionId: z.string().max(120).optional(),
  props: z.record(z.string(), z.unknown()).optional(),
});

const telemetry = new Hono();

telemetry.use(
  "/events",
  rateLimiter({
    windowMs: LIMITS.TELEMETRY_RATE_LIMIT_WINDOW,
    limit: LIMITS.TELEMETRY_RATE_LIMIT_MAX,
    standardHeaders: "draft-6",
    keyGenerator: (c) =>
      c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
    handler: (c) => c.json({ error: "Too many requests" }, 429),
  }),
);

telemetry.post("/events", async (c) => {
  const parsed = EventBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
  const { event, clientId, sessionId, props } = parsed.data;
  if (props && JSON.stringify(props).length > LIMITS.MAX_TELEMETRY_PROPS_BYTES) {
    return c.json({ error: "Invalid body" }, 400);
  }

  try {
    await db.insert(schema.productEvents).values({
      event,
      clientId: clientId ?? null,
      sessionId: sessionId ?? null,
      props: props ?? null,
    });
  } catch (e) {
    logger.warn("⚠️ Telemetry insert failed (swallowed)", e as Error, undefined);
  }
  return c.body(null, 204);
});

export { telemetry as telemetryRoutes };
