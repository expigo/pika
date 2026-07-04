/**
 * Dancer identity seam (Slice B) — the lazy account↔device claim mapping.
 *
 * Possession of the 122-bit `client_*` id is the claim credential (same trust model as the
 * public journal read). FIRST-CLAIM-WINS: the `client_identities` PK makes concurrent claims
 * race-safe, and a claimed id is never reassigned — the losing device rotates to a fresh id
 * (kiosk rule, web-side). Claims are pure INSERTs: append-only likes make the whole seam
 * non-destructive and trivially reversible.
 */

import { asc, eq } from "drizzle-orm";
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

export interface ClaimDeps {
  /** INSERT ... ON CONFLICT DO NOTHING — true when the row was inserted. */
  insertClaim: (clientId: string, userId: string) => Promise<boolean>;
  /** Current owner of a clientId, or null when unclaimed. */
  getOwner: (clientId: string) => Promise<string | null>;
}

export const defaultClaimDeps: ClaimDeps = {
  insertClaim: async (clientId, userId) => {
    const inserted = await db
      .insert(clientIdentities)
      .values({ clientId, userId })
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
};

/**
 * Claim a clientId for an account. Idempotent; concurrent claims resolve to exactly one winner
 * (PK), and the loser's follow-up owner lookup sees the winner.
 */
export async function claimClientId(
  userId: string,
  clientId: string,
  deps: ClaimDeps = defaultClaimDeps,
): Promise<ClaimOutcome> {
  if (await deps.insertClaim(clientId, userId)) return "claimed";
  const owner = await deps.getOwner(clientId);
  return owner === userId ? "already_yours" : "conflict";
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
