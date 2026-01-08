/**
 * DJ Settings Hook
 * Manages DJ profile settings (name, env, token, etc.) persisted to localStorage
 */

import { useState, useCallback } from "react";

const STORAGE_KEY = "pika_dj_settings";

export type ServerEnv = "dev" | "prod";

interface DjSettings {
    djName: string;
    serverEnv: ServerEnv;
    authToken: string; // DJ authentication token (pk_dj_...)
}

const DEFAULT_SETTINGS: DjSettings = {
    djName: "",
    serverEnv: "prod", // Default to PROD for release builds!
    authToken: "",
};

function loadSettings(): DjSettings {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            // Merge with default to handle new fields
            return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
        }
    } catch (e) {
        console.error("Failed to load DJ settings:", e);
    }
    return DEFAULT_SETTINGS;
}

function saveSettings(settings: DjSettings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
        // Force reload page to apply config changes instantly if ENV changed
        // This is a brutal but effective way to ensure global config updates
    } catch (e) {
        console.error("Failed to save DJ settings:", e);
    }
}

export function useDjSettings() {
    const [settings, setSettingsState] = useState<DjSettings>(loadSettings);

    const setDjName = useCallback((djName: string) => {
        setSettingsState((prev) => {
            const newSettings = { ...prev, djName };
            saveSettings(newSettings);
            return newSettings;
        });
    }, []);

    const setServerEnv = useCallback((serverEnv: ServerEnv) => {
        setSettingsState((prev) => {
            const newSettings = { ...prev, serverEnv };
            saveSettings(newSettings);
            // Reload to ensure all socket connections reconnect to new URL
            window.location.reload();
            return newSettings;
        });
    }, []);

    const setAuthToken = useCallback((authToken: string) => {
        setSettingsState((prev) => {
            const newSettings = { ...prev, authToken };
            saveSettings(newSettings);
            return newSettings;
        });
    }, []);

    return {
        djName: settings.djName,
        serverEnv: settings.serverEnv,
        authToken: settings.authToken,
        setDjName,
        setServerEnv,
        setAuthToken,
        hasSetDjName: settings.djName.length > 0,
        hasAuthToken: settings.authToken.length > 0,
    };
}

// Singleton accessors for non-React code / config.ts
export function getStoredSettings(): DjSettings {
    return loadSettings();
}

export function getDjName(): string {
    return loadSettings().djName || "DJ";
}

export function getAuthToken(): string {
    return loadSettings().authToken || "";
}

/**
 * Returns the configured Server URLs based on current settings
 */
export function getConfiguredUrls() {
    const settings = loadSettings();
    if (settings.serverEnv === "prod") {
        return {
            wsUrl: "wss://api.pika.stream/ws",
            webUrl: "https://pika.stream"
        };
    }

    // Dev overrides via env vars or default localhost
    return {
        wsUrl: import.meta.env.VITE_CLOUD_WS_URL || "ws://localhost:3001/ws",
        webUrl: import.meta.env.VITE_WEB_URL || "http://localhost:3002" // 3002 is desktop dev, but QR should point to Next.js (3000) usually
    };
}
