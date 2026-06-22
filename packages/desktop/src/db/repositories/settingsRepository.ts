/**
 * Settings Repository
 * Handles persistence of app settings to SQLite.
 */

import { type Settings, SettingsSchema } from "@pika/shared";
import { eq } from "drizzle-orm";
import { db } from "..";
import { settings } from "../schema";

// ============================================================================
// Types & Defaults
// ============================================================================

export type AppSettings = Settings;
export type SettingKey = keyof AppSettings;

// Derive defaults from Zod schema
export const DEFAULT_SETTINGS: AppSettings = SettingsSchema.parse({});

// ============================================================================
// Repository
// ============================================================================

export const settingsRepository = {
  /**
   * Get a single setting value with type safety
   */
  async get<K extends SettingKey>(key: K): Promise<AppSettings[K]> {
    const result = await db.select().from(settings).where(eq(settings.key, key));

    if (result.length === 0) {
      return DEFAULT_SETTINGS[key];
    }

    try {
      const parsedJson = JSON.parse(result[0].value);
      // Validate against the specific key's schema
      const fieldSchema = SettingsSchema.shape[key];
      const validation = fieldSchema.safeParse(parsedJson);

      if (validation.success) {
        return validation.data as AppSettings[K];
      }

      console.warn(`Settings validation failed for ${key}:`, validation.error);
      return DEFAULT_SETTINGS[key];
    } catch (e) {
      console.warn(`Settings parse error for ${key}:`, e);
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
      const key = row.key as SettingKey;
      // Skip if key doesn't exist in our schema (legacy data cleanup)
      if (!(key in SettingsSchema.shape)) continue;

      try {
        const parsed = JSON.parse(row.value);
        const fieldSchema = SettingsSchema.shape[key];
        const validation = fieldSchema.safeParse(parsed);

        if (validation.success) {
          // Cast via a writable record: TS can't prove a union-keyed write is safe,
          // but we've just validated the value against this key's schema.
          (loaded as Record<string, unknown>)[key] = validation.data;
        } else {
          console.warn(`Settings validation failed for ${key} in getAll:`, validation.error);
        }
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

    // Sequential idempotent upserts. We deliberately avoid db.transaction(): over
    // the Tauri sqlx pool a proxy BEGIN/COMMIT can span different connections, so it
    // provides no real atomicity. Settings keys are independent and each upsert is
    // individually atomic — a partial write is safely re-applied on the next save.
    for (const [key, value] of Object.entries(updates)) {
      const jsonValue = JSON.stringify(value);
      await db
        .insert(settings)
        .values({ key, value: jsonValue, updatedAt: now })
        .onConflictDoUpdate({
          target: settings.key,
          set: { value: jsonValue, updatedAt: now },
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
