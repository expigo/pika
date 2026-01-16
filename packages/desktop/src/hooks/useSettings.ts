/**
 * useSettings Hook
 * Provides reactive access to app settings with automatic persistence.
 */

import { useCallback, useEffect, useState } from "react";
import {
  type AppSettings,
  DEFAULT_SETTINGS,
  type SettingKey,
  settingsRepository,
} from "../db/repositories/settingsRepository";

export interface UseSettingsReturn {
  settings: AppSettings;
  isLoading: boolean;
  error: string | null;
  updateSetting: <K extends SettingKey>(key: K, value: AppSettings[K]) => Promise<void>;
  updateSettings: (updates: Partial<AppSettings>) => Promise<void>;
  resetSettings: () => Promise<void>;
  refreshSettings: () => Promise<void>;
}

export function useSettings(): UseSettingsReturn {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load settings on mount
  const loadSettings = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const loaded = await settingsRepository.getAll();
      setSettings(loaded);
    } catch (e) {
      console.error("[Settings] Failed to load:", e);
      setError(e instanceof Error ? e.message : "Failed to load settings");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Update a single setting
  const updateSetting = useCallback(async <K extends SettingKey>(key: K, value: AppSettings[K]) => {
    try {
      await settingsRepository.set(key, value);
      setSettings((prev) => ({ ...prev, [key]: value }));
    } catch (e) {
      console.error("[Settings] Failed to update:", key, e);
      throw e;
    }
  }, []);

  // Update multiple settings
  const updateSettings = useCallback(async (updates: Partial<AppSettings>) => {
    try {
      await settingsRepository.setMany(updates);
      setSettings((prev) => ({ ...prev, ...updates }));
    } catch (e) {
      console.error("[Settings] Failed to update many:", e);
      throw e;
    }
  }, []);

  // Reset all settings to defaults
  const resetSettings = useCallback(async () => {
    try {
      await settingsRepository.resetAll();
      setSettings(DEFAULT_SETTINGS);
    } catch (e) {
      console.error("[Settings] Failed to reset:", e);
      throw e;
    }
  }, []);

  // Refresh settings from database
  const refreshSettings = useCallback(async () => {
    await loadSettings();
  }, [loadSettings]);

  return {
    settings,
    isLoading,
    error,
    updateSetting,
    updateSettings,
    resetSettings,
    refreshSettings,
  };
}

// Re-export types for convenience
export type { AppSettings, SettingKey };
export { DEFAULT_SETTINGS };
