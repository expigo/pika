import { getBaseApiUrl, getBaseWsUrl } from "@pika/shared";

/**
 * Get the base URL for REST API calls
 * Delegates to shared protocol logic with browser-specific context
 */
export function getApiBaseUrl(): string {
  return getBaseApiUrl({
    window: typeof window !== "undefined" ? window : undefined,
    env: {
      NEXT_PUBLIC_CLOUD_API_URL: process.env.NEXT_PUBLIC_CLOUD_API_URL,
    },
  });
}

/**
 * Get WebSocket URL for real-time connections
 * Delegates to shared protocol logic with browser-specific context
 */
export function getWebSocketUrl(): string {
  return getBaseWsUrl({
    window: typeof window !== "undefined" ? window : undefined,
    env: {
      NEXT_PUBLIC_CLOUD_WS_URL: process.env.NEXT_PUBLIC_CLOUD_WS_URL,
    },
  });
}
