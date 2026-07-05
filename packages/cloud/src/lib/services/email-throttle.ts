/**
 * Send-side throttle for transactional email (magic links, deletion confirmations).
 *
 * Two layers, keyed on what an attacker controls:
 *  - per-address sliding window (scoped by `kind`) — bounds spam to any one inbox. Callers skip
 *    the send SILENTLY on this verdict: a visible 429 would confirm "someone recently requested
 *    links for this address" (enumeration), and the inbox already holds live links.
 *  - global daily fuse — bounds total sends/day (sender reputation + provider quota). Callers
 *    fail LOUDLY on this verdict: a silent fuse would strand every signup invisibly.
 *
 * Per-IP limiting deliberately does NOT live here — Better Auth's own limiter covers the
 * /api/auth/* paths (customRules in lib/auth/server.ts), keyed on CF-Connecting-IP.
 *
 * Memory is bounded without a sweeper: only ACCEPTED sends are recorded, so the map never holds
 * more than one day's cap worth of keys; timestamps prune on access and everything resets on the
 * UTC day rollover. In-memory by design (single-process server per documented architecture —
 * same posture as the journal-export daily budget).
 */

import { LIMITS } from "@pika/shared";

export type EmailThrottleVerdict = "ok" | "address_limited" | "daily_capped";

export interface EmailThrottleConfig {
  perAddressMax: number;
  perAddressWindowMs: number;
  dailyCap: number;
}

export interface EmailThrottle {
  /** Check-and-record atomically; only "ok" consumes budget. */
  tryAcquire(kind: string, email: string): EmailThrottleVerdict;
}

export function createEmailThrottle(
  config: EmailThrottleConfig,
  now: () => number = Date.now,
): EmailThrottle {
  const sent = new Map<string, number[]>();
  let day = "";
  let sentToday = 0;

  return {
    tryAcquire(kind: string, email: string): EmailThrottleVerdict {
      const ts = now();
      const d = new Date(ts).toISOString().slice(0, 10);
      if (d !== day) {
        day = d;
        sentToday = 0;
        sent.clear();
      }
      if (sentToday >= config.dailyCap) return "daily_capped";

      const key = `${kind}:${email.trim().toLowerCase()}`;
      const recent = (sent.get(key) ?? []).filter((t) => ts - t < config.perAddressWindowMs);
      if (recent.length >= config.perAddressMax) {
        sent.set(key, recent);
        return "address_limited";
      }
      recent.push(ts);
      sent.set(key, recent);
      sentToday += 1;
      return "ok";
    },
  };
}

function dailyCap(): number {
  const raw = Number.parseInt(process.env["MAIL_DAILY_CAP"] ?? "", 10);
  return Number.isNaN(raw) || raw <= 0 ? LIMITS.MAIL_GLOBAL_DAILY_MAX : raw;
}

/** Process-wide singleton behind the auth mail callbacks. */
export const mailThrottle: EmailThrottle = createEmailThrottle({
  perAddressMax: LIMITS.MAIL_PER_ADDRESS_MAX,
  perAddressWindowMs: LIMITS.MAIL_PER_ADDRESS_WINDOW,
  dailyCap: dailyCap(),
});

function marketingDailyCap(): number {
  const raw = Number.parseInt(process.env["MARKETING_MAIL_DAILY_CAP"] ?? "", 10);
  return Number.isNaN(raw) || raw <= 0 ? LIMITS.MARKETING_MAIL_GLOBAL_DAILY_MAX : raw;
}

/**
 * Marketing sends (Night Recap, DJ digest — Slice C) — a fully SEPARATE instance. Budgets are
 * per-instance, so recap volume can never consume the transactional budget above: the
 * transactional fuse alert means "sign-ins are failing" and must keep meaning exactly that.
 */
export const marketingMailThrottle: EmailThrottle = createEmailThrottle({
  perAddressMax: LIMITS.MARKETING_MAIL_PER_ADDRESS_MAX,
  perAddressWindowMs: LIMITS.MARKETING_MAIL_PER_ADDRESS_WINDOW,
  dailyCap: marketingDailyCap(),
});
