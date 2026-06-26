import { URLS } from "@pika/shared";

/**
 * Get the base URL for REST API calls
 * Infers from window location if env var is missing (for LAN dev)
 */
export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_CLOUD_API_URL) {
    return process.env.NEXT_PUBLIC_CLOUD_API_URL;
  }

  if (typeof window !== "undefined") {
    // Dev/LAN: derive the API from the *page* host (port 3001) so the Better Auth session
    // cookie (SameSite=Lax, host-only) stays same-site. A localhost↔127.0.0.1 mismatch is
    // cross-site, so the cookie is dropped on fetch and the DJ appears signed-out.
    return `${window.location.protocol}//${window.location.hostname}:3001`;
  }

  return URLS.getApiUrl("development"); // SSR fallback (no window)
}

/**
 * Get WebSocket URL for real-time connections
 * Infers from window location if env var is missing (for LAN dev)
 */
export function getWebSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_CLOUD_WS_URL) {
    return process.env.NEXT_PUBLIC_CLOUD_WS_URL;
  }

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // Dev/LAN: derive from the page host (see getApiBaseUrl — keeps the cookie same-site).
    return `${protocol}//${window.location.hostname}:3001/ws`;
  }

  return `${URLS.getWsUrl("development")}/ws`;
}
