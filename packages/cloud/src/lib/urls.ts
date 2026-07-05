/**
 * Environment-aware base URLs for links built server-side (emails, OAuth bounces, redirects).
 *
 * Staging runs NODE_ENV=production (see lib/auth/server.ts), so the env overrides are the ONLY
 * thing keeping staging links off the prod origins — WEB_BASE_URL must be set on staging
 * (ops-manual), and BETTER_AUTH_URL already is (Better Auth requires it).
 */

import { type PikaEnvironment, URLS } from "@pika/shared";

function pikaEnv(): PikaEnvironment {
  const node = process.env["NODE_ENV"];
  return node === "production" ? "production" : node === "staging" ? "staging" : "development";
}

/** The dancer-facing web origin (journal/Booth/recap links in emails, unsubscribe page). */
export function webBaseUrl(): string {
  const override = process.env["WEB_BASE_URL"];
  if (override) return override;
  return URLS.getWebUrl(pikaEnv());
}

/** The cloud API origin (the one-click unsubscribe endpoint in email headers). */
export function apiBaseUrl(): string {
  const override = process.env["BETTER_AUTH_URL"];
  if (override) return override;
  return URLS.getApiUrl(pikaEnv());
}
