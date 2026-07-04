/**
 * Dancer identity seam (Slice B) — the lazy account↔device claim mapping.
 *
 * Possession of the 122-bit `client_*` id is the claim credential (same trust model as the
 * public journal read). FIRST-CLAIM-WINS: the `client_identities` PK makes concurrent claims
 * race-safe, and a claimed id is never reassigned — the losing device rotates to a fresh id
 * (kiosk rule, web-side). Claims are pure INSERTs: append-only likes make the whole seam
 * non-destructive and trivially reversible.
 */

import { and, asc, eq } from "drizzle-orm";
import { db } from "../../db";
import { clientIdentities } from "../../db/schema";

/**
 * Client IDs must match client_{uuid} or client_{timestamp}_{random} format — both strict UUIDs
 * and the browser-generated generic IDs. Single source of truth (routes/client.ts + /api/me).
 */
export const CLIENT_ID_REGEX = /^client_[a-zA-Z0-9_-]+$/i;

/**
 * Log-safe clientId form. The full id is a bearer credential (read + claim), so logs are the one
 * realistic leak channel — keep the prefix for correlation, drop the entropy.
 */
export function maskClientId(id: string): string {
  return `${id.slice(0, 15)}…`;
}

export type ClaimOutcome = "claimed" | "already_yours" | "conflict";

/**
 * UA → human device name for the account card ("iPhone · Safari"). Deliberately tiny and
 * dependency-free: it only needs to tell a dancer's own devices apart, not fingerprint.
 */
export function deriveDeviceLabel(ua: string | undefined): string | null {
  if (!ua) return null;
  const os = /iPhone|iPod/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /Windows/.test(ua)
          ? "Windows"
          : /Macintosh|Mac OS X/.test(ua)
            ? "Mac"
            : /Linux/.test(ua)
              ? "Linux"
              : null;
  // Order matters: Edge and Chrome both say "Chrome"; Chrome and Safari both say "Safari".
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\/|CriOS\//.test(ua)
        ? "Chrome"
        : /Firefox\/|FxiOS\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  if (!os && !browser) return null;
  return [os, browser].filter(Boolean).join(" · ");
}

export interface ClaimDeps {
  /** INSERT ... ON CONFLICT DO NOTHING — true when the row was inserted. */
  insertClaim: (clientId: string, userId: string, label: string | null) => Promise<boolean>;
  /** Current owner of a clientId, or null when unclaimed. */
  getOwner: (clientId: string) => Promise<string | null>;
  /** Refresh the label on an already-owned claim (journal visits keep names current). */
  setLabel: (clientId: string, userId: string, label: string) => Promise<void>;
}

export const defaultClaimDeps: ClaimDeps = {
  insertClaim: async (clientId, userId, label) => {
    const inserted = await db
      .insert(clientIdentities)
      .values({ clientId, userId, label })
      .onConflictDoNothing()
      .returning({ clientId: clientIdentities.clientId });
    return inserted.length > 0;
  },
  getOwner: async (clientId) => {
    const [row] = await db
      .select({ userId: clientIdentities.userId })
      .from(clientIdentities)
      .where(eq(clientIdentities.clientId, clientId))
      .limit(1);
    return row?.userId ?? null;
  },
  setLabel: async (clientId, userId, label) => {
    await db
      .update(clientIdentities)
      .set({ label })
      .where(and(eq(clientIdentities.clientId, clientId), eq(clientIdentities.userId, userId)));
  },
};

/**
 * Claim a clientId for an account. Idempotent; concurrent claims resolve to exactly one winner
 * (PK), and the loser's follow-up owner lookup sees the winner.
 */
export async function claimClientId(
  userId: string,
  clientId: string,
  label: string | null = null,
  deps: ClaimDeps = defaultClaimDeps,
): Promise<ClaimOutcome> {
  if (await deps.insertClaim(clientId, userId, label)) return "claimed";
  const owner = await deps.getOwner(clientId);
  if (owner !== userId) return "conflict";
  if (label) await deps.setLabel(clientId, userId, label);
  return "already_yours";
}

/** All clientIds claimed by an account, ordered claimed_at ASC — the adopt-first tiebreak. */
export async function getClaimedClientIds(userId: string): Promise<string[]> {
  const rows = await db
    .select({ clientId: clientIdentities.clientId })
    .from(clientIdentities)
    .where(eq(clientIdentities.userId, userId))
    .orderBy(asc(clientIdentities.claimedAt));
  return rows.map((r) => r.clientId);
}

export interface ClaimedDevice {
  clientId: string;
  label: string | null;
  claimedAt: Date;
}

/** The account's devices for the card (claimed_at ASC — stable, oldest first). */
export async function getClaimedDevices(userId: string): Promise<ClaimedDevice[]> {
  return db
    .select({
      clientId: clientIdentities.clientId,
      label: clientIdentities.label,
      claimedAt: clientIdentities.claimedAt,
    })
    .from(clientIdentities)
    .where(eq(clientIdentities.userId, userId))
    .orderBy(asc(clientIdentities.claimedAt));
}

/** Unlink one device from an account (owner-scoped). True when a row was deleted. */
export async function unlinkDevice(userId: string, clientId: string): Promise<boolean> {
  const deleted = await db
    .delete(clientIdentities)
    .where(and(eq(clientIdentities.clientId, clientId), eq(clientIdentities.userId, userId)))
    .returning({ clientId: clientIdentities.clientId });
  return deleted.length > 0;
}
