/**
 * DJ Settings Hook
 * Manages DJ profile settings (name, etc.) persisted to localStorage
 */

import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "pika_dj_settings";

interface DjSettings {
    djName: string;
}

const DEFAULT_SETTINGS: DjSettings = {
    djName: "",
};

function loadSettings(): DjSettings {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
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
    } catch (e) {
        console.error("Failed to save DJ settings:", e);
    }
}

export function useDjSettings() {
    const [settings, setSettingsState] = useState<DjSettings>(loadSettings);

    // Sync with localStorage on mount
    useEffect(() => {
        const stored = loadSettings();
        setSettingsState(stored);
    }, []);

    const setDjName = useCallback((djName: string) => {
        setSettingsState((prev) => {
            const newSettings = { ...prev, djName };
            saveSettings(newSettings);
            return newSettings;
        });
    }, []);

    const hasSetDjName = settings.djName.length > 0;

    return {
        djName: settings.djName,
        setDjName,
        hasSetDjName,
    };
}

// Singleton accessor for non-React code
export function getDjName(): string {
    const settings = loadSettings();
    return settings.djName || "DJ";
}
