/**
 * Public email endpoints (Slice C) — the unsubscribe target.
 *
 * Mounted at /api/email WITHOUT the X-Pika-Client CSRF check: the POST caller is the
 * recipient's MAIL PROVIDER (RFC 8058 one-click), which sends a bare form-encoded POST from its
 * own servers. The token itself is the authorization (HMAC over userId|type, lib/services/
 * email-prefs.ts) and its only power is opting one account OUT of one email type — idempotent
 * and safe to expose.
 */

import { LIMITS, logger } from "@pika/shared";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";
import { clearEmailConsent, verifyUnsubToken } from "../lib/services/email-prefs";
import { webBaseUrl } from "../lib/urls";

const email = new Hono();

email.use(
  "/unsubscribe",
  rateLimiter({
    windowMs: LIMITS.FOLLOWS_RATE_LIMIT_WINDOW,
    limit: LIMITS.FOLLOWS_RATE_LIMIT_MAX,
    standardHeaders: "draft-6",
    keyGenerator: (c) =>
      c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
    handler: (c) => c.json({ error: "Too many requests" }, 429),
  }),
);

/**
 * POST /unsubscribe — clears one consent. Token precedence: query (the header-URL form the
 * one-click POST hits), then body. The body may be form-encoded (mail providers) OR JSON (our
 * web confirm page) — never json()-first, RFC 8058 posts `List-Unsubscribe=One-Click` as a form.
 */
email.post("/unsubscribe", async (c) => {
  let token = c.req.query("token") ?? "";
  if (!token) {
    const ct = c.req.header("Content-Type") ?? "";
    if (ct.includes("application/json")) {
      const body = (await c.req.json().catch(() => ({}))) as { token?: unknown };
      if (typeof body.token === "string") token = body.token;
    } else {
      const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
      const t = form["token"];
      if (typeof t === "string") token = t;
    }
  }

  const parsed = verifyUnsubToken(token);
  if (!parsed) return c.json({ error: "Invalid unsubscribe link" }, 400);
  try {
    await clearEmailConsent(parsed.userId, parsed.type);
    return c.body(null, 204);
  } catch (error) {
    logger.error("Failed to process unsubscribe", error);
    return c.json({ error: "Failed to unsubscribe" }, 500);
  }
});

/**
 * GET /unsubscribe — non-8058 mail clients open the header URL in a browser. NEVER mutate on
 * GET (scanners prefetch links); bounce to the web confirm page, which POSTs back on a tap.
 */
email.get("/unsubscribe", (c) => {
  const token = c.req.query("token") ?? "";
  return c.redirect(`${webBaseUrl()}/unsubscribe?token=${encodeURIComponent(token)}`, 302);
});

export { email as emailRoutes };
