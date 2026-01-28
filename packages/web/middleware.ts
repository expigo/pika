import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

/**
 * Next.js Middleware for Security Headers
 * Adds Content-Security-Policy and other security headers to all responses.
 */
export function middleware(_request: NextRequest) {
  // Security Enhancement: Generate dynamic nonce for CSP
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://*.sentry.io https://*.google-analytics.com",
    "style-src 'self' 'unsafe-inline'", // Needed for styled-jsx and Tailwind
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.github.com https://*.github.com https://*.githubusercontent.com wss://api.pika.stream https://api.pika.stream wss://staging-api.pika.stream https://staging-api.pika.stream ws://localhost:* http://localhost:*",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
  ].join("; ");

  const response = NextResponse.next();

  // Set CSP Header
  response.headers.set("Content-Security-Policy", csp);

  // Set Nonce for Next.js to use in components
  response.headers.set("x-nonce", nonce);

  // Additional security headers
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("X-XSS-Protection", "1; mode=block");

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
