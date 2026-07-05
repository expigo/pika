/**
 * Pinhole image proxy (Slice C) — album art for the Night Card canvas.
 *
 * i.scdn.co's CORS is unreliable, and drawing an un-CORS'd image taints the canvas
 * (`toBlob` throws). Proxying same-origin makes the bytes CORS-clean. The SSRF surface is
 * deliberately tiny: ONE allowlisted host/path shape, no redirects followed, image/* only,
 * 2 MB cap, long immutable cache (art URLs are content-addressed).
 */

import { LIMITS, logger } from "@pika/shared";
import { Hono } from "hono";
import { rateLimiter } from "hono-rate-limiter";

const ALLOWED_SRC = /^https:\/\/i\.scdn\.co\/image\/[A-Za-z0-9]+$/;
const MAX_BYTES = 2 * 1024 * 1024;

const img = new Hono();

img.use(
  "/",
  rateLimiter({
    windowMs: LIMITS.IMG_PROXY_RATE_LIMIT_WINDOW,
    limit: LIMITS.IMG_PROXY_RATE_LIMIT_MAX,
    standardHeaders: "draft-6",
    keyGenerator: (c) =>
      c.req.header("CF-Connecting-IP") || c.req.header("X-Forwarded-For") || "unknown",
    handler: (c) => c.json({ error: "Too many requests" }, 429),
  }),
);

/** GET /api/img?src=https://i.scdn.co/image/… → the image bytes, same-origin. */
img.get("/", async (c) => {
  const src = c.req.query("src") ?? "";
  if (!ALLOWED_SRC.test(src)) return c.json({ error: "Unsupported image source" }, 400);
  try {
    const upstream = await fetch(src, { redirect: "error" });
    if (!upstream.ok) return c.json({ error: "Upstream fetch failed" }, 502);
    const type = upstream.headers.get("Content-Type") ?? "";
    if (!type.startsWith("image/")) return c.json({ error: "Not an image" }, 502);
    const buf = await upstream.arrayBuffer();
    if (buf.byteLength > MAX_BYTES) return c.json({ error: "Image too large" }, 502);
    return c.body(buf, 200, {
      "Content-Type": type,
      "Cache-Control": "public, max-age=604800, immutable",
    });
  } catch {
    // Redirect attempts land here too (redirect:"error") — never follow off the allowlist.
    logger.warn("Image proxy fetch failed", { src });
    return c.json({ error: "Fetch failed" }, 502);
  }
});

export { img as imgRoutes };
