/**
 * Transactional email (Resend) — dancer magic links + account-deletion confirmations.
 *
 * DI-style like journal.ts (tests inject deps; never mock.module). Keyless behavior is
 * environment-aware: outside production the message is LOGGED instead of sent — the magic-link
 * URL lives in `text`, so local dev and the integration suite read it from the log line (or the
 * `verification` table) without any email provider. In production a missing key throws loudly:
 * an unconfigured mailer must never become a silent dead sign-in flow.
 */

import { logger } from "@pika/shared";
import { type EmailThrottle, mailThrottle } from "./email-throttle";

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
    });
    return { delivered: false };
  }

  const res = await deps.fetchImpl("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: deps.from(),
      to: input.to,
      subject: input.subject,
      html: input.html,
      text: input.text,
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

/** Shared minimal branded shell — dancers read these on phones; keep it one glance. */
function emailShell(heading: string, body: string, url: string, cta: string): string {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:420px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 12px">${heading}</h2>
<p style="margin:0 0 20px;color:#334155">${body}</p>
<a href="${url}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700">${cta}</a>
<p style="margin:24px 0 0;color:#94a3b8;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
</div>`;
}

export async function sendMagicLinkEmail(
  { to, url }: { to: string; url: string },
  deps: MailDeps = defaultMailDeps,
): Promise<{ delivered: boolean }> {
  return sendEmail(
    {
      to,
      subject: "Your Pika! sign-in link",
      html: emailShell(
        "Sign in to Pika!",
        "Tap the button below on the device you want your Journal on. The link expires in 10 minutes.",
        url,
        "Sign in",
      ),
      text: `Sign in to Pika!: ${url}\n\nOpen this link on the device you want your Journal on. It expires in 10 minutes. If you didn't request it, ignore this email.`,
    },
    deps,
  );
}

export async function sendAccountDeletionEmail(
  { to, url }: { to: string; url: string },
  deps: MailDeps = defaultMailDeps,
): Promise<{ delivered: boolean }> {
  return sendEmail(
    {
      to,
      subject: "Confirm deleting your Pika! account",
      html: emailShell(
        "Delete your Pika! account?",
        "This unlinks your devices from the account. Likes stay anonymous on each device; your email is erased.",
        url,
        "Confirm deletion",
      ),
      text: `Confirm deleting your Pika! account: ${url}\n\nThis unlinks your devices; likes stay anonymous on each device and your email is erased. If you didn't request it, ignore this email.`,
    },
    deps,
  );
}

/** Log-safe address form — target addresses are PII and must not land in logs verbatim. */
function maskEmail(email: string): string {
  const [local = "", domain = ""] = email.split("@");
  return `${local.slice(0, 1)}***@${domain}`;
}

export interface AuthMailDeps {
  throttle: EmailThrottle;
  sendMagicLink: typeof sendMagicLinkEmail;
  sendDeletion: typeof sendAccountDeletionEmail;
}

export const defaultAuthMailDeps: AuthMailDeps = {
  throttle: mailThrottle,
  sendMagicLink: sendMagicLinkEmail,
  sendDeletion: sendAccountDeletionEmail,
};

/**
 * Auth email sends behind the abuse throttle (the magic-link endpoint is PUBLIC — anyone can
 * make Pika email any address). Verdict handling is deliberately asymmetric:
 *  - address_limited → skip silently ("skipped"): the endpoint still answers 200, so probing
 *    reveals nothing, and that inbox already received fresh links moments ago.
 *  - daily_capped → throw: every auth email is dead until ops intervenes (raise MAIL_DAILY_CAP /
 *    upgrade Resend) — that must surface as errors, never as quietly missing email.
 * Note: Better Auth mints the verification token BEFORE this callback, so a skipped send never
 * strands a request mid-flow — the token simply goes undelivered.
 */
async function sendThrottledAuthEmail(
  kind: "magic-link" | "account-deletion",
  args: { email: string; url: string },
  send: (input: { to: string; url: string }) => Promise<{ delivered: boolean }>,
  throttle: EmailThrottle,
): Promise<"sent" | "skipped"> {
  const verdict = throttle.tryAcquire(kind, args.email);
  if (verdict === "daily_capped") {
    logger.error(`❌ Daily email fuse tripped — ${kind} sends are failing`, undefined, {
      to: maskEmail(args.email),
    });
    throw new MailThrottledError();
  }
  if (verdict === "address_limited") {
    logger.warn(`🛑 ${kind} send throttled for address`, { to: maskEmail(args.email) });
    return "skipped";
  }
  await send({ to: args.email, url: args.url });
  return "sent";
}

export async function handleMagicLinkSend(
  args: { email: string; url: string },
  deps: AuthMailDeps = defaultAuthMailDeps,
): Promise<"sent" | "skipped"> {
  return sendThrottledAuthEmail("magic-link", args, deps.sendMagicLink, deps.throttle);
}

export async function handleDeletionEmailSend(
  args: { email: string; url: string },
  deps: AuthMailDeps = defaultAuthMailDeps,
): Promise<"sent" | "skipped"> {
  return sendThrottledAuthEmail("account-deletion", args, deps.sendDeletion, deps.throttle);
}
