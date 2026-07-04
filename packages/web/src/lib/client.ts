/**
 * Client identity management for anonymous dancers
 * Persists client ID in localStorage for session continuity
 */

import { safeRandomUUID } from "./uuid";

export const CLIENT_ID_KEY = "pika_client_id";

/** Installed-PWA check (guarded for happy-dom + older Safari's legacy flag). */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const viaMediaQuery =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const viaLegacyFlag = (navigator as unknown as { standalone?: boolean }).standalone === true;
  return viaMediaQuery || viaLegacyFlag;
}

/**
 * Get or create a persistent client ID
 * Used for anonymous dancer identity (likes, votes, etc.)
 */
export function getOrCreateClientId(): string {
  if (typeof window === "undefined") {
    return `server_${Date.now()}`;
  }

  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    // Collision-resistant identity. safeRandomUUID works over http://<LAN-IP>
    // (insecure context), where crypto.randomUUID is unavailable.
    clientId = `client_${safeRandomUUID()}`;
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

/**
 * Clear client ID (for testing or privacy reset)
 */
export function clearClientId(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(CLIENT_ID_KEY);
  }
}

/**
 * Mint a FRESH identity, overwriting the stored one (Slice B kiosk rule / logout rotation).
 * A claimed clientId is never reassigned server-side — rotation is how a device stops writing
 * into someone else's journal. Returns the new id.
 */
export function rotateClientId(): string {
  const clientId = `client_${safeRandomUUID()}`;
  if (typeof window !== "undefined") {
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

/**
 * Best-effort: re-point this device's EXISTING push endpoint at the CURRENT clientId. Stage push
 * targeting joins push_subscriptions ↔ stage_subscriptions on client_id, so a rotation without
 * this re-POST silently kills stage push for the device (the server also carries the old id's
 * stage follows over to the new id on this call). No-ops when the device never subscribed;
 * never throws. Key encoding mirrors usePushNotifications' subscribe() — the same endpoint row
 * must keep an identical encoding.
 */
export async function resubscribePush(): Promise<boolean> {
  try {
    if (
      typeof window === "undefined" ||
      !("serviceWorker" in navigator) ||
      !("PushManager" in window)
    ) {
      return false;
    }
    // getRegistration (NOT .ready — must not hang when no SW is registered)
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return false;

    const encodeKey = (name: PushEncryptionKeyName): string =>
      btoa(
        String.fromCharCode.apply(
          null,
          Array.from(new Uint8Array(subscription.getKey(name) || new ArrayBuffer(0))),
        ),
      );

    const { getApiBaseUrl } = await import("./api");
    const response = await fetch(`${getApiBaseUrl()}/api/push/subscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Pika-Client": "pika-web" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        keys: { p256dh: encodeKey("p256dh"), auth: encodeKey("auth") },
        clientId: getOrCreateClientId(),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

/** Rotate the identity AND repair the push linkage for this device. Returns the new id. */
export async function rotateIdentity(): Promise<string> {
  const id = rotateClientId();
  await resubscribePush();
  return id;
}
