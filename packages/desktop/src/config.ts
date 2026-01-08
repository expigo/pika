/**
 * Pika! Desktop Configuration
 * Environment-based configuration for the desktop app.
 * NOW DYNAMIC based on User Settings (Dev/Prod).
 */

import { invoke } from "@tauri-apps/api/core";
import { slugify } from "@pika/shared";
import { getConfiguredUrls, getStoredSettings } from "./hooks/useDjSettings";

// Load configuration relative to current environment setting (Dev/Prod)
const urls = getConfiguredUrls();

// Cloud server WebSocket URL
export const CLOUD_WS_URL = urls.wsUrl;

// Base Web URL (default)
export const WEB_CLIENT_URL = urls.webUrl;

// Cached local IP (fetched once on demand)
let cachedLocalIp: string | null = null;

/**
 * Get the local network IP address via Rust backend
 * This allows QR codes to work on phones/tablets on the same network
 */
export async function getLocalIp(): Promise<string | null> {
    if (cachedLocalIp) {
        return cachedLocalIp;
    }

    try {
        const ip = await invoke<string | null>("get_local_ip");
        if (ip) {
            cachedLocalIp = ip;
            console.log("[Config] Local network IP:", ip);
        }
        return ip;
    } catch (e) {
        console.warn("[Config] Failed to get local IP:", e);
        return null;
    }
}

/**
 * Get the web client base URL
 * For PROD: Always return https://pika.stream
 * For DEV: Try to use local IP for LAN access if available, else localhost
 */
export function getWebClientBaseUrl(localIp?: string | null): string {
    const settings = getStoredSettings();

    // In Production, ignore local IP, always use the public domain
    if (settings.serverEnv === "prod") {
        return WEB_CLIENT_URL;
    }

    // In Dev, support LAN IP
    if (localIp) {
        return `http://${localIp}:3000`; // Next.js default port
    }

    return WEB_CLIENT_URL;
}

/**
 * Generate the listener URL for a session
 * @param sessionId - The cloud session ID
 * @param djName - Optional DJ name for new URL format
 * @param localIp - Optional local IP to use for LAN access
 */
export function getListenerUrl(sessionId: string, djName?: string, localIp?: string | null): string {
    const baseUrl = getWebClientBaseUrl(localIp);
    if (djName) {
        const slug = slugify(djName);
        return `${baseUrl}/dj/${slug}/s/${sessionId}`;
    }
    // Fallback to old format for backwards compatibility
    return `${baseUrl}/s/${sessionId}`;
}

/**
 * Generate the recap URL for a completed session
 * @param sessionId - The cloud session ID
 * @param djName - Optional DJ name for new URL format
 * @param localIp - Optional local IP to use for LAN access
 */
export function getRecapUrl(sessionId: string, djName?: string, localIp?: string | null): string {
    const baseUrl = getWebClientBaseUrl(localIp);
    if (djName) {
        const slug = slugify(djName);
        return `${baseUrl}/dj/${slug}/recap/${sessionId}`;
    }
    // Fallback to old format for backwards compatibility
    return `${baseUrl}/recap/${sessionId}`;
}
