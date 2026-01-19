/**
 * Pika! Protocol Constants and Utilities
 * Centralizes URL generation for local, staging, and production environments.
 */

export const DEFAULT_WEB_PORT = 3000;
export const DEFAULT_CLOUD_PORT = 3001;

/**
 * Environments supported by the Pika! network
 */
export type PikaEnvironment = "development" | "staging" | "production" | "test";

/**
 * Options for generating API URLs
 */
export interface UrlOptions {
  window?: {
    location: {
      hostname: string;
      protocol: string;
    };
  };
  env?: {
    NEXT_PUBLIC_CLOUD_API_URL?: string;
    NEXT_PUBLIC_CLOUD_WS_URL?: string;
  };
  forcePort?: number;
}

/**
 * Normalizes and detects the base API URL
 * Logic:
 * 1. If env.NEXT_PUBLIC_CLOUD_API_URL exists, use it (Staging/Prod)
 * 2. If in browser:
 *    a. If hostname is localhost/LAN IP, use that hostname with the cloud port
 * 3. Fallback: http://localhost:3001
 */
export function getBaseApiUrl(options: UrlOptions = {}): string {
  // 1. Priority: Environment Variable (Production/Staging)
  if (options.env?.NEXT_PUBLIC_CLOUD_API_URL) {
    return options.env.NEXT_PUBLIC_CLOUD_API_URL;
  }

  // 2. Browser-side dynamic detection
  if (options.window) {
    const { hostname, protocol } = options.window.location;
    const port = options.forcePort || DEFAULT_CLOUD_PORT;

    const isLocalOrLan =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.");

    if (isLocalOrLan) {
      return `${protocol}//${hostname}:${port}`;
    }
  }

  // 3. Absolute Fallback
  return `http://localhost:${DEFAULT_CLOUD_PORT}`;
}

/**
 * Generates the WebSocket URL
 */
export function getBaseWsUrl(options: UrlOptions = {}): string {
  // 1. Priority: Environment Variable
  if (options.env?.NEXT_PUBLIC_CLOUD_WS_URL) {
    return options.env.NEXT_PUBLIC_CLOUD_WS_URL;
  }

  // 2. Browser-side dynamic detection
  if (options.window) {
    const { hostname, protocol } = options.window.location;
    const wsProtocol = protocol === "https:" ? "wss:" : "ws:";
    const port = options.forcePort || DEFAULT_CLOUD_PORT;

    const isLocalOrLan =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("10.") ||
      hostname.startsWith("172.");

    if (isLocalOrLan) {
      return `${wsProtocol}//${hostname}:${port}/ws`;
    }

    // Production: use api subdomain
    const domain = hostname.replace("www.", "");
    return `${wsProtocol}//api.${domain}/ws`;
  }

  // 3. Absolute Fallback
  return `ws://localhost:${DEFAULT_CLOUD_PORT}/ws`;
}
