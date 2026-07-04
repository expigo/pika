/**
 * Account↔device claim orchestration (Slice B).
 *
 * The account's HttpOnly session cookie is the durable (ITP-exempt) anchor; this module binds
 * the device's anonymous clientId to it. FIRST-CLAIM-WINS: a 409 means another account owns
 * this device's id (kiosk case) — the device rotates to a fresh id and claims that instead,
 * never reassigning. The live like pipeline is untouched: claims make a device's likes — past
 * AND future — reachable through the account union read.
 */

import { getApiBaseUrl } from "./api";
import { getOrCreateClientId, rotateIdentity } from "./client";
import { trackEvent } from "./events";

/**
 * Local hint that this browser has (or had) an account session — gates the fire-and-forget
 * auto-claim on /live so the 95%-anonymous case never pays a guaranteed-401 POST per visit.
 */
const HAS_ACCOUNT_KEY = "pika_has_account";

export function setAccountHint(): void {
  try {
    localStorage.setItem(HAS_ACCOUNT_KEY, "1");
  } catch {
    // Private modes may throw — the hint is an optimization, never load-bearing.
  }
}

export function clearAccountHint(): void {
  try {
    localStorage.removeItem(HAS_ACCOUNT_KEY);
  } catch {
    // ignore
  }
}

export function hasAccountHint(): boolean {
  try {
    return localStorage.getItem(HAS_ACCOUNT_KEY) === "1";
  } catch {
    return false;
  }
}

export type EnsureClaimResult =
  | "claimed"
  | "already_yours"
  | "rotated_and_claimed"
  | "no_session"
  | "error";

function postClaim(clientId: string): Promise<Response> {
  return fetch(`${getApiBaseUrl()}/api/me/journal/claim`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", "X-Pika-Client": "pika-web" },
    body: JSON.stringify({ clientId }),
  });
}

// Module-level in-flight promise dedupes concurrent calls (double-mount, journal + live).
let inFlight: Promise<EnsureClaimResult> | null = null;

/**
 * Ensure this device's clientId is claimed by the signed-in account. Minting here (via
 * getOrCreateClientId) IS the ITP-recovery path: the cookie survived, the id didn't — the fresh
 * id gets claimed and the old ids' likes come back through the account union read.
 */
export function ensureClientIdClaimed(): Promise<EnsureClaimResult> {
  if (inFlight) return inFlight;
  inFlight = (async (): Promise<EnsureClaimResult> => {
    try {
      const res = await postClaim(getOrCreateClientId());
      if (res.status === 401) return "no_session";
      if (res.ok) {
        setAccountHint();
        const body = (await res.json().catch(() => ({}))) as { status?: string };
        return body.status === "already_yours" ? "already_yours" : "claimed";
      }
      if (res.status === 409) {
        // Kiosk rule: this id belongs to another account — never reassign; mint fresh + re-claim.
        await rotateIdentity();
        const retry = await postClaim(getOrCreateClientId());
        if (retry.ok) {
          setAccountHint();
          trackEvent("account_claim_conflict", { recovered: true });
          return "rotated_and_claimed";
        }
        trackEvent("account_claim_conflict", { recovered: false });
        return "error";
      }
      return "error";
    } catch {
      return "error";
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}

/**
 * Claim-then-rotate logout: bank this device's likes to the account, kill the session (cookie +
 * server row), then mint a fresh anonymous id so a shared device stops feeding the account's
 * journal (rotation also repairs the push linkage). Next sign-in auto-claims the fresh id.
 */
export async function signOutAndRotate(): Promise<void> {
  await ensureClientIdClaimed().catch(() => {});
  try {
    // Dynamic import keeps this module loadable outside React (bun test runner).
    const { authClient } = await import("./authClient");
    await authClient.signOut();
  } catch {
    // Even if the network call fails, rotate locally — the caller navigates away regardless.
  }
  clearAccountHint();
  await rotateIdentity();
}
