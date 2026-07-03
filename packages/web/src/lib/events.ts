/**
 * Product-event beacons (first product analytics in Pika).
 *
 * Fire-and-forget: never awaited, never throws, all failures swallowed. Uses
 * `fetch(..., { keepalive: true })` — NOT `navigator.sendBeacon` — because the cloud's csrfCheck
 * requires the `X-Pika-Client` header on POSTs and sendBeacon can't set headers. The clientId is
 * read from localStorage READ-ONLY: telemetry must never mint an identity.
 */

import { getApiBaseUrl } from "./api";

/** Keep in sync with PRODUCT_EVENTS in cloud routes/telemetry.ts (the server whitelists). */
export type ProductEvent =
  | "journal_opened"
  | "journal_spotify_click"
  | "journal_export_created"
  | "journal_export_updated"
  | "journal_export_failed"
  | "journal_load_more"
  | "journal_removed_like"
  | "install_nudge_shown";

export function trackEvent(event: ProductEvent, props?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  try {
    const clientId = localStorage.getItem("pika_client_id");
    fetch(`${getApiBaseUrl()}/api/telemetry/events`, {
      method: "POST",
      keepalive: true, // survives tab-away/page-hide (e.g. the Spotify click-out)
      headers: { "Content-Type": "application/json", "X-Pika-Client": "pika-web" },
      body: JSON.stringify({
        event,
        ...(clientId ? { clientId } : {}),
        ...(props ? { props } : {}),
      }),
    }).catch(() => {});
  } catch {
    // localStorage can throw in private modes — a beacon must never break the page.
  }
}
