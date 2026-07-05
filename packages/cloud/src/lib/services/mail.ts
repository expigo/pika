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
import { type EmailThrottle, mailThrottle, marketingMailThrottle } from "./email-throttle";

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

// ============================================================================
// Marketing email (Slice C) — Night Recap + DJ digest
// ============================================================================

/** User-sourced strings (DJ names, track titles) land in email HTML — escape them. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Marketing shell — same visual language as emailShell, but with the consent footer the law
 * requires (why you're getting this + an always-working unsubscribe) instead of the
 * transactional "if you didn't request this" line.
 */
function marketingShell(
  heading: string,
  body: string,
  centerpiece: string,
  reason: string,
  unsubUrl: string,
): string {
  return `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:420px;margin:0 auto;padding:24px">
<h2 style="margin:0 0 12px">${heading}</h2>
<p style="margin:0 0 20px;color:#334155">${body}</p>
${centerpiece}
<p style="margin:24px 0 0;color:#94a3b8;font-size:12px">${reason} <a href="${unsubUrl}" style="color:#64748b">Unsubscribe</a></p>
</div>`;
}

/** RFC 8058 one-click headers — on every marketing send; the token rides in the URL query. */
function unsubHeaders(unsubApiUrl: string): Record<string, string> {
  return {
    "List-Unsubscribe": `<${unsubApiUrl}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

export interface NightRecapEmailInput {
  to: string;
  djName: string;
  eventLabel: string | null;
  dateLabel: string;
  personalTracks: { artist: string; title: string }[];
  personalTotal: number;
  floorTop: { artist: string; title: string; likes: number }[];
  journalUrl: string;
  boothUrl: string | null;
  recapUrl: string;
  /** Human unsubscribe link (web confirm page). */
  unsubPageUrl: string;
  /** One-click POST target (cloud endpoint, token in query) — goes in the headers. */
  unsubApiUrl: string;
  idempotencyKey: string;
}

/** The dancer's morning-after Night Recap. */
export async function sendNightRecapEmail(
  input: NightRecapEmailInput,
  deps: MailDeps = defaultMailDeps,
): Promise<{ delivered: boolean }> {
  const dj = escapeHtml(input.djName);
  const where = input.eventLabel ? ` at ${escapeHtml(input.eventLabel)}` : "";
  const songWord = input.personalTotal === 1 ? "song" : "songs";
  const yourList = input.personalTracks
    .map(
      (t) =>
        `<li style="margin:0 0 6px">${escapeHtml(t.title)} — <span style="color:#64748b">${escapeHtml(t.artist)}</span></li>`,
    )
    .join("");
  const moreCount = input.personalTotal - input.personalTracks.length;
  const more =
    moreCount > 0
      ? `<p style="margin:4px 0 0;color:#64748b;font-size:13px">…and ${moreCount} more in your journal.</p>`
      : "";
  const floor =
    input.floorTop.length > 0
      ? `<p style="margin:20px 0 6px;font-weight:700">The floor's top ${input.floorTop.length}</p><ol style="margin:0;padding-left:20px">${input.floorTop
          .map(
            (t) =>
              `<li style="margin:0 0 6px">${escapeHtml(t.title)} — <span style="color:#64748b">${escapeHtml(t.artist)}</span> · ${t.likes} ❤️</li>`,
          )
          .join("")}</ol>`
      : "";
  const buttons = `<p style="margin:20px 0 0">${ctaButton(input.journalUrl, "Open your journal")}</p>
${input.boothUrl ? `<p style="margin:10px 0 0"><a href="${input.boothUrl}" style="color:#0f172a;font-weight:700">Visit ${dj}'s booth →</a></p>` : ""}
<p style="margin:10px 0 0"><a href="${input.recapUrl}" style="color:#0f172a;font-weight:700">Thank the DJ · full recap →</a></p>`;

  const text = [
    `Your night with ${input.djName}${input.eventLabel ? ` at ${input.eventLabel}` : ""} (${input.dateLabel})`,
    "",
    `You loved ${input.personalTotal} ${songWord}:`,
    ...input.personalTracks.map((t) => `  - ${t.title} — ${t.artist}`),
    ...(moreCount > 0 ? [`  …and ${moreCount} more in your journal.`] : []),
    ...(input.floorTop.length > 0
      ? [
          "",
          `The floor's top ${input.floorTop.length}:`,
          ...input.floorTop.map(
            (t, i) => `  ${i + 1}. ${t.title} — ${t.artist} (${t.likes} likes)`,
          ),
        ]
      : []),
    "",
    `Journal: ${input.journalUrl}`,
    ...(input.boothUrl ? [`Booth: ${input.boothUrl}`] : []),
    `Recap: ${input.recapUrl}`,
    "",
    `You asked Pika! for night recaps. Unsubscribe: ${input.unsubPageUrl}`,
  ].join("\n");

  return sendEmail(
    {
      to: input.to,
      subject: `Your night with ${input.djName} ⚡`,
      html: marketingShell(
        `Your night with ${dj}`,
        `${escapeHtml(input.dateLabel)}${where} — you loved ${input.personalTotal} ${songWord}.`,
        `<p style="margin:0 0 6px;font-weight:700">Your loved ${songWord}</p><ul style="margin:0;padding-left:20px">${yourList}</ul>${more}${floor}${buttons}`,
        "You asked Pika! to send your night recaps.",
        input.unsubPageUrl,
      ),
      text,
      headers: unsubHeaders(input.unsubApiUrl),
      idempotencyKey: input.idempotencyKey,
    },
    deps,
  );
}

export interface DjDigestEmailInput {
  to: string;
  djName: string;
  eventLabel: string | null;
  dateLabel: string;
  trackCount: number;
  totalLikes: number;
  uniqueDancers: number;
  thanksCount: number;
  newFollowers: number;
  topTracks: { artist: string; title: string; likes: number }[];
  recapUrl: string;
  unsubPageUrl: string;
  unsubApiUrl: string;
  idempotencyKey: string;
}

/** The DJ's morning-after set digest — the "why keep broadcasting" email. */
export async function sendDjDigestEmail(
  input: DjDigestEmailInput,
  deps: MailDeps = defaultMailDeps,
): Promise<{ delivered: boolean }> {
  const statRow = (label: string, value: string | number) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#64748b">${label}</td><td style="padding:4px 0;font-weight:700">${value}</td></tr>`;
  const top =
    input.topTracks.length > 0
      ? `<p style="margin:16px 0 6px;font-weight:700">Most loved</p><ol style="margin:0;padding-left:20px">${input.topTracks
          .map(
            (t) =>
              `<li style="margin:0 0 6px">${escapeHtml(t.title)} — <span style="color:#64748b">${escapeHtml(t.artist)}</span> · ${t.likes} ❤️</li>`,
          )
          .join("")}</ol>`
      : "";
  const centerpiece = `<table style="border-collapse:collapse">${statRow("Tracks played", input.trackCount)}${statRow("Likes", input.totalLikes)}${statRow("Dancers who liked", input.uniqueDancers)}${statRow("Thank-yous", input.thanksCount)}${statRow("New followers", input.newFollowers)}</table>${top}<p style="margin:20px 0 0">${ctaButton(input.recapUrl, "Open the set recap")}</p>`;

  const text = [
    `Your set digest — ${input.dateLabel}${input.eventLabel ? ` at ${input.eventLabel}` : ""}`,
    "",
    `Tracks played: ${input.trackCount}`,
    `Likes: ${input.totalLikes}`,
    `Dancers who liked: ${input.uniqueDancers}`,
    `Thank-yous: ${input.thanksCount}`,
    `New followers: ${input.newFollowers}`,
    ...(input.topTracks.length > 0
      ? [
          "",
          "Most loved:",
          ...input.topTracks.map(
            (t, i) => `  ${i + 1}. ${t.title} — ${t.artist} (${t.likes} likes)`,
          ),
        ]
      : []),
    "",
    `Recap: ${input.recapUrl}`,
    "",
    `You turned on set digests in your Booth. Unsubscribe: ${input.unsubPageUrl}`,
  ].join("\n");

  return sendEmail(
    {
      to: input.to,
      subject: `Your set digest — ${input.dateLabel}`,
      html: marketingShell(
        "Last night, by the numbers",
        `${escapeHtml(input.dateLabel)}${input.eventLabel ? ` at ${escapeHtml(input.eventLabel)}` : ""} — how the floor answered your set.`,
        centerpiece,
        "You turned on set digests in your Booth.",
        input.unsubPageUrl,
      ),
      text,
      headers: unsubHeaders(input.unsubApiUrl),
      idempotencyKey: input.idempotencyKey,
    },
    deps,
  );
}

/**
 * Marketing sends behind their OWN throttle — and never throwing (the recap sweep is
 * best-effort): address_limited skips this recipient; daily_capped logs loudly and tells the
 * caller to stop the batch (every further marketing send today would fail identically).
 */
export async function sendThrottledMarketingEmail(
  kind: "recap" | "digest",
  email: string,
  send: () => Promise<{ delivered: boolean }>,
  throttle: EmailThrottle = marketingMailThrottle,
): Promise<"sent" | "skipped" | "capped"> {
  const verdict = throttle.tryAcquire(kind, email);
  if (verdict === "daily_capped") {
    logger.error(
      "❌ Daily MARKETING email budget exhausted — recap/digest batch stopping",
      undefined,
      {
        to: maskEmail(email),
      },
    );
    return "capped";
  }
  if (verdict === "address_limited") {
    logger.warn(`🛑 ${kind} send throttled for address`, { to: maskEmail(email) });
    return "skipped";
  }
  await send();
  return "sent";
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
