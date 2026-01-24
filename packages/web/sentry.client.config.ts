import * as Sentry from "@sentry/nextjs";
import { PIKA_VERSION } from "@pika/shared";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_ENV || "production",
  release: `pika-web@${PIKA_VERSION}`,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  debug: false,

  // PII Scrubbing
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers;
    }
    if (event.user) {
      delete event.user.ip_address;
    }
    return event;
  },

  // Filter noise
  ignoreErrors: [
    "ResizeObserver loop limit exceeded",
    "ResizeObserver loop completed with undelivered notifications",
    "Non-Error promise rejection captured",
    "ChunkLoadError",
  ],

  // Filter out noise from browser extensions and common third-party scripts
  denyUrls: [
    // Browser Extensions
    /extensions\//i,
    /^chrome-extension:\/\//i,
    /^moz-extension:\/\//i,
    // Social media / Ads
    /graph\.facebook\.com/i,
    /connect\.facebook\.net/i,
    /ads-twitter\.com/i,
    /static\.ads-twitter\.com/i,
  ],
});
