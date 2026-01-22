import { getBaseApiUrl, getBaseWsUrl } from "@pika/shared";

/**
 * Get the base URL for REST API calls
 * Infers from window location if env var is missing (for LAN dev)
 */
export function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_CLOUD_API_URL) {
    return process.env.NEXT_PUBLIC_CLOUD_API_URL;
  }

  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    // LAN Dev fallback: If not localhost, assume API is on same host port 3001
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      return `${window.location.protocol}//${hostname}:3001`;
    }
  }

  return "http://localhost:3001";
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
    const hostname = window.location.hostname;
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";

    // LAN Dev fallback
    if (hostname !== "localhost" && hostname !== "127.0.0.1") {
      return `${protocol}//${hostname}:3001/ws`;
    }
  }

  return "ws://localhost:3001/ws";
}
