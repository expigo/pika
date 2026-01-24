import * as Sentry from "@sentry/react";
import { PIKA_VERSION, logger } from "@pika/shared";

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  const env = import.meta.env.VITE_ENV || "production";

  if (!dsn && env === "production") {
    console.warn("⚠️ SENTRY_DSN not found in production");
    return;
  }

  if (dsn) {
    Sentry.init({
      dsn,
      environment: env,
      release: `pika-desktop@${PIKA_VERSION}`,
      tracesSampleRate: 0.1,

      // PII Scrubbing
      beforeSend(event) {
        if (event.request) {
          delete event.request.headers;
          delete event.request.cookies;
        }
        if (event.user) {
          delete event.user.ip_address;
        }
        return event;
      },

      ignoreErrors: [
        "ResizeObserver loop limit exceeded",
        "ResizeObserver loop completed with undelivered notifications",
      ],
    });

    // Hook into shared logger
    logger.setReporter((message, error, context) => {
      if (error instanceof Error) {
        Sentry.captureException(error, {
          extra: { logMessage: message, ...context },
        });
      } else {
        Sentry.captureMessage(message, {
          level: "error",
          extra: { error, ...context },
        });
      }
    });

    logger.info("🛡️ Sentry initialized for Desktop app");
  }
}
