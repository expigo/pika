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

/**
 * Uniquifier: Gmail collapses a byte-identical body in the same thread behind the three-dots
 * ("trimmed content") — a rapid second sign-in email looked EMPTY on staging. Seconds
 * granularity keeps even quick resends distinct.
 */
function requestedAtStamp(): string {
  return new Date().toUTCString();
}

/** Shared minimal branded shell — dancers read these on phones; keep it one glance. */
function emailShell(heading: string, body: string, centerpiece: string, stamp: string): string {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:420px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 12px">${heading}</h2>
<p style="margin:0 0 20px;color:#334155">${body}</p>
${centerpiece}
<p style="margin:24px 0 0;color:#94a3b8;font-size:12px">If you didn't request this, you can safely ignore this email.</p>
<p style="margin:8px 0 0;color:#cbd5e1;font-size:11px">Requested at ${stamp}</p>
</div>`;
}

function ctaButton(url: string, cta: string): string {
  return `<a href="${url}" style="display:inline-block;background:#0f172a;color:#fff;padding:12px 20px;border-radius:12px;text-decoration:none;font-weight:700">${cta}</a>`;
}

export async function sendMagicLinkEmail(
  { to, url }: { to: string; url: string },
  deps: MailDeps = defaultMailDeps,
): Promise<{ delivered: boolean }> {
  const stamp = requestedAtStamp();
  return sendEmail(
    {
      to,
      subject: "Your Pika! sign-in link",
      html: emailShell(
        "Sign in to Pika!",
        "Tap the button below on the device you want your Journal on. The link expires in 10 minutes.",
        ctaButton(url, "Sign in"),
        stamp,
      ),
      text: `Sign in to Pika!: ${url}\n\nOpen this link on the device you want your Journal on. It expires in 10 minutes. If you didn't request it, ignore this email.\nRequested at ${stamp}`,
    },
    deps,
  );
}

export async function sendAccountDeletionEmail(
  { to, url }: { to: string; url: string },
  deps: MailDeps = defaultMailDeps,
): Promise<{ delivered: boolean }> {
  const stamp = requestedAtStamp();
  return sendEmail(
    {
      to,
      subject: "Confirm deleting your Pika! account",
      html: emailShell(
        "Delete your Pika! account?",
        "This unlinks your devices from the account. Likes stay anonymous on each device; your email is erased.",
        ctaButton(url, "Confirm deletion"),
        stamp,
      ),
      text: `Confirm deleting your Pika! account: ${url}\n\nThis unlinks your devices; likes stay anonymous on each device and your email is erased. If you didn't request it, ignore this email.\nRequested at ${stamp}`,
    },
    deps,
  );
}

/**
 * Sign-in code for the installed PWA: iOS gives a home-screen app its own cookie jar, and mail
 * links always open in the browser — a link can never sign the PWA in. A code typed INSIDE the
 * app mints the session in the right jar.
 */
export async function sendSignInOtpEmail(
  { to, otp }: { to: string; otp: string },
  deps: MailDeps = defaultMailDeps,
): Promise<{ delivered: boolean }> {
  const stamp = requestedAtStamp();
  return sendEmail(
    {
      to,
      subject: "Your Pika! sign-in code",
      html: emailShell(
        "Your sign-in code",
        "Enter this code in the Pika! app on the device you want your Journal on. It expires in 5 minutes.",
        `<p style="margin:0;background:#0f172a;color:#fff;padding:14px 20px;border-radius:12px;display:inline-block;font-size:28px;font-weight:700;letter-spacing:6px;font-family:ui-monospace,monospace">${otp}</p>`,
        stamp,
      ),
      text: `Your Pika! sign-in code: ${otp}\n\nEnter it in the Pika! app on the device you want your Journal on. It expires in 5 minutes. If you didn't request it, ignore this email.\nRequested at ${stamp}`,
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
  sendOtp: typeof sendSignInOtpEmail;
  sendDeletion: typeof sendAccountDeletionEmail;
}

export const defaultAuthMailDeps: AuthMailDeps = {
  throttle: mailThrottle,
  sendMagicLink: sendMagicLinkEmail,
  sendOtp: sendSignInOtpEmail,
  sendDeletion: sendAccountDeletionEmail,
};

/**
 * Auth email sends behind the abuse throttle (the sign-in endpoints are PUBLIC — anyone can
 * make Pika email any address). Magic link and OTP share ONE "sign-in" per-address budget —
 * separate kinds would double an attacker's per-inbox allowance. Verdict handling is
 * deliberately asymmetric:
 *  - address_limited → skip silently ("skipped"): the endpoint still answers 200, so probing
 *    reveals nothing, and that inbox already received fresh links/codes moments ago.
 *  - daily_capped → throw: every auth email is dead until ops intervenes (raise MAIL_DAILY_CAP /
 *    upgrade Resend) — that must surface as errors, never as quietly missing email.
 * Note: Better Auth mints the verification token/code BEFORE this callback, so a skipped send
 * never strands a request mid-flow — it simply goes undelivered.
 */
async function sendThrottledAuthEmail(
  kind: "sign-in" | "account-deletion",
  email: string,
  send: () => Promise<{ delivered: boolean }>,
  throttle: EmailThrottle,
): Promise<"sent" | "skipped"> {
  const verdict = throttle.tryAcquire(kind, email);
  if (verdict === "daily_capped") {
    logger.error(`❌ Daily email fuse tripped — ${kind} sends are failing`, undefined, {
      to: maskEmail(email),
    });
    throw new MailThrottledError();
  }
  if (verdict === "address_limited") {
    logger.warn(`🛑 ${kind} send throttled for address`, { to: maskEmail(email) });
    return "skipped";
  }
  await send();
  return "sent";
}

export async function handleMagicLinkSend(
  args: { email: string; url: string },
  deps: AuthMailDeps = defaultAuthMailDeps,
): Promise<"sent" | "skipped"> {
  return sendThrottledAuthEmail(
    "sign-in",
    args.email,
    () => deps.sendMagicLink({ to: args.email, url: args.url }),
    deps.throttle,
  );
}

export async function handleOtpSend(
  args: { email: string; otp: string },
  deps: AuthMailDeps = defaultAuthMailDeps,
): Promise<"sent" | "skipped"> {
  return sendThrottledAuthEmail(
    "sign-in",
    args.email,
    () => deps.sendOtp({ to: args.email, otp: args.otp }),
    deps.throttle,
  );
}

export async function handleDeletionEmailSend(
  args: { email: string; url: string },
  deps: AuthMailDeps = defaultAuthMailDeps,
): Promise<"sent" | "skipped"> {
  return sendThrottledAuthEmail(
    "account-deletion",
    args.email,
    () => deps.sendDeletion({ to: args.email, url: args.url }),
    deps.throttle,
  );
}
