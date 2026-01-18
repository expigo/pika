/**
 * Shared API utilities for the Pika! web app
 * Consolidates URL generation logic from multiple files
 */

/**
 * Get the base URL for REST API calls
 * Handles: production (env var), local dev (localhost), LAN dev (192.168.x.x)
 */
export function getApiBaseUrl(): string {
  // Server-side: use env var or empty
  if (typeof window === "undefined") {
    return process.env.NEXT_PUBLIC_CLOUD_API_URL || "";
  }

  // Check env var first (production/staging)
  if (process.env.NEXT_PUBLIC_CLOUD_API_URL) {
    return process.env.NEXT_PUBLIC_CLOUD_API_URL;
  }

  // Development: detect local or LAN
  const hostname = window.location.hostname;
  const isLocalOrLan =
    hostname === "localhost" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.");

  if (isLocalOrLan) {
    return `${window.location.protocol}//${hostname}:3001`;
  }

  // Fallback
  return "http://localhost:3001";
}

/**
 * Get WebSocket URL for real-time connections
 * Handles protocol switching (ws/wss) based on current page
 */
export function getWebSocketUrl(): string {
  // Check env var first
  if (process.env.NEXT_PUBLIC_CLOUD_WS_URL) {
    return process.env.NEXT_PUBLIC_CLOUD_WS_URL;
  }

  // Server-side fallback
  if (typeof window === "undefined") {
    return "ws://localhost:3001/ws";
  }

  // Dynamic URL based on current location
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const hostname = window.location.hostname;

  // Local/LAN development
  const isLocalOrLan =
    hostname === "localhost" ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("172.");

  if (isLocalOrLan) {
    return `${protocol}//${hostname}:3001/ws`;
  }

  // Production: use same hostname with api subdomain
  return `${protocol}//api.${hostname.replace("www.", "")}/ws`;
}
