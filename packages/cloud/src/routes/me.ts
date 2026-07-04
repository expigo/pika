/**
 * /api/me — the authenticated dancer/DJ account surface (Slice B).
 *
 * Everything here requires ONLY authentication (`requireAuth`, 401-only): dancers are
 * auto-approved and DJs may have journals too. State-changing routes additionally pass the
 * X-Pika-Client CSRF check applied at mount in index.ts.
 *
 *   POST /api/me/journal/claim  → claim this device's clientId for the account
 */

import { zValidator } from "@hono/zod-validator";
import { LIMITS } from "@pika/shared";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { z } from "zod";
import { getUser, requireAuth } from "../lib/auth";
import { CLIENT_ID_REGEX, claimClientId } from "../lib/services/identity";

const me = new Hono();

me.use("*", requireAuth);

// Same per-IP budget as the public journal read — claims are cheap single-row writes.
me.use(
  "/journal/*",
  rateLimiter({
    windowMs: LIMITS.CLIENT_LIKES_RATE_LIMIT_WINDOW,
    limit: LIMITS.CLIENT_LIKES_RATE_LIMIT_MAX,
    standardHeaders: "draft-6",
    keyGenerator: (c) =>
      c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
    handler: (c) => c.json({ error: "Too many requests, please try again later" }, 429),
  }),
);

const ClaimBody = z.object({
  clientId: z.string().max(80).regex(CLIENT_ID_REGEX),
});

/**
 * Claim this device's anonymous clientId for the signed-in account. Idempotent
 * (`already_yours`); FIRST-CLAIM-WINS — an id owned by another account returns 409 and the
 * device is expected to rotate to a fresh id (kiosk rule) rather than ever reassigning.
 */
me.post("/journal/claim", zValidator("json", ClaimBody), async (c) => {
  const { clientId } = c.req.valid("json");
  const outcome = await claimClientId(getUser(c).id, clientId);
  if (outcome === "conflict") {
    return c.json({ error: "claimed_by_another_account" }, 409);
  }
  return c.json({ status: outcome });
});

export { me as meRoutes };
