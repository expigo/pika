import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Next.js Middleware for Security Headers
 * Adds Content-Security-Policy and other security headers to all page responses.
 *
 * Deferred hardening (tracked, intentionally NOT done here to stay low-risk):
 *  - script-src still allows 'unsafe-inline' + 'unsafe-eval'. The `x-nonce` generated
 *    below is currently INERT — it is not referenced by the CSP and nothing consumes it.
 *    Moving to a nonce-based script-src (dropping 'unsafe-inline', and 'unsafe-eval' in
 *    production) needs a prod-build verification pass, so it is a separate follow-up.
 *  - img-src still allows any https: host; tighten once external image origins are known.
 */
export function middleware(_request: NextRequest) {
  // Reserved for a future nonce-based CSP (see note above). Currently inert.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Content Security Policy
  const csp = [
    "default-src 'self'",
    // No external <script> hosts are loaded (Sentry is bundled; GA is unused → removed).
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'", // Needed for styled-jsx and Tailwind
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:", // next/font self-hosts — no external font origins needed
    // api.github.com: download page fetches the latest release. *.ingest.de.sentry.io:
    // Sentry error reporting (was missing → errors were silently CSP-blocked in prod).
    "connect-src 'self' https://api.github.com https://*.github.com https://*.githubusercontent.com wss://api.pika.stream https://api.pika.stream wss://staging-api.pika.stream https://staging-api.pika.stream https://*.sentry.io https://*.ingest.de.sentry.io ws://localhost:* http://localhost:*",
    "worker-src 'self' blob:", // PWA / Serwist service worker
    "manifest-src 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
  ].join("; ");

  const response = NextResponse.next();

  // Set CSP Header
  response.headers.set("Content-Security-Policy", csp);

  // Set Nonce for Next.js to use in components (currently inert — see note)
  response.headers.set("x-nonce", nonce);

  // Additional security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");
  // Lock down powerful features the app never uses (push uses the Notifications API,
  // which Permissions-Policy does not gate, so this is safe).
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), browsing-topics=()",
  );

  // HSTS — only meaningful over HTTPS, so production only (browsers ignore it on
  // http://localhost regardless, but gating keeps dev/self-signed setups clean).
  if (process.env.NODE_ENV === "production") {
    response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }

  return response;
}

// Only run on page routes, skip static files and API routes
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder files
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\..*|api).*)",
  ],
};
