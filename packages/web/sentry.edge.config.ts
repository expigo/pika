import * as Sentry from "@sentry/nextjs";
import { PIKA_VERSION } from "@pika/shared";

Sentry.init({
  dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV || "production",
  release: `pika-web@${PIKA_VERSION}`,
  tracesSampleRate: 0.1,
  debug: false,

  // PII Scrubbing
  beforeSend(event) {
    if (event.request) {
      delete event.request.cookies;
      delete event.request.headers;
    }
    return event;
  },
});
