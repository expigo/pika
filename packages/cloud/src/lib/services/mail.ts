/**
 * Transactional email (Resend) — dancer magic links + account-deletion confirmations.
 *
 * DI-style like journal.ts (tests inject deps; never mock.module). Keyless behavior is
 * environment-aware: outside production the message is LOGGED instead of sent — the magic-link
 * URL lives in `text`, so local dev and the integration suite read it from the log line (or the
 * `verification` table) without any email provider. In production a missing key throws loudly:
 * an unconfigured mailer must never become a silent dead sign-in flow.
 *
 * Templates + throttled send orchestration moved to `./mailTemplates.ts` (2026-07); this file
 * is the transport core (error taxonomy, deps, sendEmail, maskEmail).
 */

import { logger } from "@pika/shared";

export class MailNotConfiguredError extends Error {
  constructor() {
    super("Transactional email is not configured (RESEND_API_KEY missing)");
    this.name = "MailNotConfiguredError";
  }
}

export class MailThrottledError extends Error {
  constructor() {
    super("Daily transactional-email budget exhausted");
    this.name = "MailThrottledError";
  }
}

export class MailSendError extends Error {
  constructor(public readonly status: number) {
    super(`Mail send failed: ${status}`);
    this.name = "MailSendError";
  }
}

export interface MailDeps {
  fetchImpl: typeof fetch;
  apiKey: () => string | undefined;
  from: () => string;
  isProduction: () => boolean;
}

export const defaultMailDeps: MailDeps = {
  fetchImpl: fetch,
  apiKey: () => process.env["RESEND_API_KEY"],
  from: () => process.env["MAIL_FROM"] ?? "Pika! <journal@pika.stream>",
  isProduction: () => process.env["NODE_ENV"] === "production",
};

// Boot-time loudness: a keyless production cloud cannot send sign-in links.
if (defaultMailDeps.isProduction() && !defaultMailDeps.apiKey()) {
  logger.error("❌ RESEND_API_KEY is not set — dancer magic-link sign-in WILL fail");
}

export interface MailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** MESSAGE headers — go in the Resend BODY `headers` field (List-Unsubscribe & co). */
  headers?: Record<string, string>;
  /** Resend API dedup — an HTTP REQUEST header, NOT a message header (24h window). */
  idempotencyKey?: string;
}

export async function sendEmail(
  input: MailInput,
  deps: MailDeps = defaultMailDeps,
): Promise<{ delivered: boolean }> {
  const key = deps.apiKey();
  if (!key) {
    if (deps.isProduction()) throw new MailNotConfiguredError();
    logger.info("📧 [mail-fallback] would send", {
      to: input.to,
      subject: input.subject,
      text: input.text,
      // Surfaced so local/integration verification can assert BOTH header placements.
      ...(input.headers && { headers: input.headers }),
      ...(input.idempotencyKey && { idempotencyKey: input.idempotencyKey }),
    });
    return { delivered: false };
  }

  const res = await deps.fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(input.idempotencyKey && { "Idempotency-Key": input.idempotencyKey }),
    },
    body: JSON.stringify({
      from: deps.from(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
      ...(input.headers && { headers: input.headers }),
    }),
  });
  if (!res.ok) {
    // A rejected real send (unverified domain, bad key, provider error) — Better Auth swallows this
    // throw into a 200, so without a log line it's invisible here (only the Resend dashboard shows
    // it). Recipient masked (PII); status + provider dashboard pinpoint the cause.
    logger.warn("⚠️ Resend send rejected", { status: res.status, to: maskEmail(input.to) });
    throw new MailSendError(res.status);
  }
  return { delivered: true };
}

/** Log-safe address form — target addresses are PII and must not land in logs verbatim. */
export function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}
