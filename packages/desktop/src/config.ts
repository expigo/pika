/**
 * Pika! Desktop Configuration
 * Environment-based configuration for the desktop app.
 * NOW DYNAMIC based on User Settings (Dev/Prod).
 */

import { invoke } from "@tauri-apps/api/core";
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
        return `http://${localIp}:3002`; // Dev server port (see packages/web/package.json)
    }

    return WEB_CLIENT_URL;
}

/**
 * Generate the listener URL for a session
 * Uses /live/{sessionId} path which opens WebSocket to specific session
 * @param sessionId - The cloud session ID
 * @param djName - Optional DJ name (passed as query param for display)
 * @param localIp - Optional local IP to use for LAN access
 */
export function getListenerUrl(sessionId: string, djName?: string, localIp?: string | null): string {
    const baseUrl = getWebClientBaseUrl(localIp);
    const url = new URL(`${baseUrl}/live/${sessionId}`);
    if (djName) {
        url.searchParams.set("dj", djName);
    }
    return url.toString();
}

/**
 * Generate the recap URL for a completed session
 * @param sessionId - The cloud session ID
 * @param djName - Optional DJ name (passed as query param for display)
 * @param localIp - Optional local IP to use for LAN access
 */
export function getRecapUrl(sessionId: string, djName?: string, localIp?: string | null): string {
    const baseUrl = getWebClientBaseUrl(localIp);
    const url = new URL(`${baseUrl}/recap/${sessionId}`);
    if (djName) {
        url.searchParams.set("dj", djName);
    }
    return url.toString();
}
