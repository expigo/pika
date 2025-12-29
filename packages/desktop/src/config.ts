/**
 * Pika! Desktop Configuration
 * Environment-based configuration for the desktop app.
 */

// Web client URL for QR codes
export const WEB_CLIENT_URL = import.meta.env.VITE_WEB_URL || "http://localhost:3002";

// Cloud server WebSocket URL
export const CLOUD_WS_URL = import.meta.env.VITE_CLOUD_WS_URL || "ws://localhost:3001/ws";

/**
 * Generate the listener URL for a session
 */
export function getListenerUrl(sessionId: string): string {
    return `${WEB_CLIENT_URL}/s/${sessionId}`;
}
