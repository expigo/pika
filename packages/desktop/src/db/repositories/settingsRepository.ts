/**
 * Settings Repository
 * Handles persistence of app settings to SQLite.
 */

import { eq } from "drizzle-orm";
import { db } from "..";
import { settings } from "../schema";

// ============================================================================
// Types
// ============================================================================

export interface AppSettings {
  // Analysis settings
  "analysis.onTheFly": boolean;
  "analysis.afterSession": boolean;
  "analysis.cpuPriority": "low" | "normal" | "high";

  // Library settings
  "library.vdjPath": string;
  "library.bpmThresholds": {
    slow: number;
    medium: number;
  };

  // Display settings
  "display.advancedMetrics": boolean;
  "display.showTooltips": boolean;
  "display.profile": "high-contrast" | "midnight" | "stealth";

  // Network settings
  "network.apiUrl": string;
}

export type SettingKey = keyof AppSettings;

// Default values for all settings
export const DEFAULT_SETTINGS: AppSettings = {
  "analysis.onTheFly": false,
  "analysis.afterSession": true,
  "analysis.cpuPriority": "low",
  "library.vdjPath": "auto",
  "library.bpmThresholds": {
    slow: 85,
    medium: 115,
  },
  "display.advancedMetrics": false,
  "display.showTooltips": true,
  "display.profile": "high-contrast",
  "network.apiUrl": "https://api.pika.stream",
};

// ============================================================================
// Repository
// ============================================================================

export const settingsRepository = {
  /**
   * Get a single setting value
   */
  async get<K extends SettingKey>(key: K): Promise<AppSettings[K]> {
    const result = await db.select().from(settings).where(eq(settings.key, key));

    if (result.length === 0) {
      return DEFAULT_SETTINGS[key];
    }

    try {
      return JSON.parse(result[0].value) as AppSettings[K];
    } catch {
      return DEFAULT_SETTINGS[key];
    }
  },

  /**
   * Set a single setting value
   */
  async set<K extends SettingKey>(key: K, value: AppSettings[K]): Promise<void> {
    const jsonValue = JSON.stringify(value);
    const now = Math.floor(Date.now() / 1000);

    await db
      .insert(settings)
      .values({
        key,
        value: jsonValue,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: settings.key,
        set: {
          value: jsonValue,
          updatedAt: now,
        },
      });
  },

  /**
   * Get all settings, merging with defaults
   */
  async getAll(): Promise<AppSettings> {
    const result = await db.select().from(settings);

    const loaded: Partial<AppSettings> = {};
    for (const row of result) {
      try {
        loaded[row.key as SettingKey] = JSON.parse(row.value);
      } catch {
        // Skip invalid JSON
      }
    }

    return {
      ...DEFAULT_SETTINGS,
      ...loaded,
    };
  },

  /**
   * Set multiple settings at once
   */
  async setMany(updates: Partial<AppSettings>): Promise<void> {
    const now = Math.floor(Date.now() / 1000);

    for (const [key, value] of Object.entries(updates)) {
      await db
        .insert(settings)
        .values({
          key,
          value: JSON.stringify(value),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: settings.key,
          set: {
            value: JSON.stringify(value),
            updatedAt: now,
          },
        });
    }
  },

  /**
   * Reset a setting to its default value
   */
  async reset<K extends SettingKey>(key: K): Promise<void> {
    await this.set(key, DEFAULT_SETTINGS[key]);
  },

  /**
   * Reset all settings to defaults
   */
  async resetAll(): Promise<void> {
    await db.delete(settings);
  },
};
