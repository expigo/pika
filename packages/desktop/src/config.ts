/**
 * Pika! Desktop Configuration
 * Environment-based configuration for the desktop app.
 */

import { invoke } from "@tauri-apps/api/core";
import { slugify } from "@pika/shared";

// Web client URL for QR codes
export const WEB_CLIENT_URL = import.meta.env.VITE_WEB_URL || "http://localhost:3002";

// Cloud server WebSocket URL
export const CLOUD_WS_URL = import.meta.env.VITE_CLOUD_WS_URL || "ws://localhost:3001/ws";

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
 * Get the web client base URL, using local IP for LAN access
 * @param localIp - Optional local IP to use (from getLocalIp)
 */
export function getWebClientBaseUrl(localIp?: string | null): string {
    if (localIp) {
        return `http://${localIp}:3002`;
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
