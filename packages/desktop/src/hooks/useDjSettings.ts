/**
 * DJ Settings Hook
 * Manages DJ profile settings (name, env, token, etc.) persisted to localStorage
 *
 * Token Flow:
 * 1. DJ pastes token in Settings
 * 2. App validates token with /api/auth/me
 * 3. If valid → auto-set djName from registered displayName
 * 4. Token + DJ info persisted to localStorage
 * 5. Next app launch → token is still there, name is synced
 */

import { fetch } from "@tauri-apps/plugin-http"; // Use Tauri HTTP to bypass CORS
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "pika_dj_settings";

export type ServerEnv = "dev" | "prod" | "staging";

// Validated DJ info from token
export interface DjInfo {
  id: number;
  displayName: string;
  email: string;
  slug: string;
}

interface DjSettings {
  djName: string;
  serverEnv: ServerEnv;
  authToken: string; // DJ authentication token (pk_dj_...)
  djInfo: DjInfo | null; // Validated DJ info from token
}

const DEFAULT_SETTINGS: DjSettings = {
  djName: "",
  serverEnv: "prod", // Default to PROD for release builds!
  authToken: "",
  djInfo: null,
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

// Custom event to sync settings across hook instances
const SETTINGS_UPDATED_EVENT = "pika:settings-updated";

function dispatchSettingsUpdate() {
  window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));
}

function saveSettings(settings: DjSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    dispatchSettingsUpdate(); // Notify all listeners
  } catch (e) {
    console.error("Failed to save DJ settings:", e);
  }
}

/**
 * Get the API base URL based on current environment
 */
function getApiBaseUrl(): string {
  const settings = loadSettings();
  if (settings.serverEnv === "prod") {
    return "https://api.pika.stream";
  }
  if (settings.serverEnv === "staging") {
    return "https://staging-api.pika.stream";
  }
  return "http://localhost:3001";
}

/**
 * Validate a token with the server and return DJ info
 */
export async function validateTokenWithServer(token: string): Promise<DjInfo | null> {
  if (!token) return null;

  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Pika-Client": "pika-desktop", // CSRF protection
      },
    });

    if (!response.ok) {
      console.warn("[DJ Settings] Token validation failed:", response.status);
      return null;
    }

    const data = await response.json();
    if (data.success && data.user) {
      return {
        id: data.user.id,
        displayName: data.user.displayName,
        email: data.user.email,
        slug: data.user.slug,
      };
    }
    return null;
  } catch (e) {
    console.error("[DJ Settings] Token validation error:", e);
    return null;
  }
}

export function useDjSettings() {
  const [settings, setSettingsState] = useState<DjSettings>(loadSettings);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sync settings across hook instances (e.g. between App and LiveControl)
  useEffect(() => {
    const handleUpdate = () => {
      setSettingsState(loadSettings());
    };
    window.addEventListener(SETTINGS_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, handleUpdate);
  }, []);

  const setDjName = useCallback((djName: string) => {
    setSettingsState((prev) => {
      const newSettings = { ...prev, djName };
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  const setServerEnv = useCallback((serverEnv: ServerEnv) => {
    setSettingsState((prev) => {
      // Security: Clear auth data when switching environments to prevent
      // using a token from one env in another.
      const newSettings = {
        ...prev,
        serverEnv,
        authToken: "",
        djInfo: null,
        djName: "",
      };
      saveSettings(newSettings);
      saveSettings(newSettings);
      return newSettings;
    });
  }, []);

  /**
   * Set and validate auth token
   * If valid, auto-sync djName with registered displayName
   */
  const setAuthToken = useCallback(async (authToken: string): Promise<boolean> => {
    setValidationError(null);

    if (!authToken) {
      // Clear token and DJ info
      setSettingsState((prev) => {
        const newSettings = { ...prev, authToken: "", djInfo: null };
        saveSettings(newSettings);
        return newSettings;
      });
      return true;
    }

    setIsValidating(true);

    try {
      const djInfo = await validateTokenWithServer(authToken);

      if (djInfo) {
        // Token valid! Auto-sync DJ name
        setSettingsState((prev) => {
          const newSettings = {
            ...prev,
            authToken,
            djInfo,
            djName: djInfo.displayName, // Auto-sync!
          };
          saveSettings(newSettings);
          return newSettings;
        });
        console.log(`✅ Token validated. Logged in as: ${djInfo.displayName}`);
        return true;
      } else {
        // Token invalid
        setValidationError("Invalid token. Please check and try again.");
        setSettingsState((prev) => {
          const newSettings = { ...prev, authToken: "", djInfo: null };
          saveSettings(newSettings);
          return newSettings;
        });
        return false;
      }
    } finally {
      setIsValidating(false);
    }
  }, []);

  /**
   * Clear token and logout
   */
  const clearToken = useCallback(() => {
    setSettingsState((prev) => {
      const newSettings = { ...prev, authToken: "", djInfo: null, djName: "" };
      saveSettings(newSettings);
      return newSettings;
    });
    setValidationError(null);
  }, []);

  return {
    // Current state
    djName: settings.djName,
    serverEnv: settings.serverEnv,
    authToken: settings.authToken,
    djInfo: settings.djInfo,

    // Derived state
    hasSetDjName: settings.djName.length > 0,
    hasAuthToken: settings.authToken.length > 0,
    isAuthenticated: !!settings.djInfo,
    isValidating,
    validationError,

    // Actions
    setDjName,
    setServerEnv,
    setAuthToken,
    clearToken,
  };
}

// Singleton accessors for non-React code / config.ts
export function getStoredSettings(): DjSettings {
  return loadSettings();
}

export function getDjName(): string {
  const settings = loadSettings();
  // Prefer djInfo.displayName if available (authenticated)
  if (settings.djInfo?.displayName) {
    return settings.djInfo.displayName;
  }
  return settings.djName || "DJ";
}

export function getAuthToken(): string {
  return loadSettings().authToken || "";
}

export function getDjInfo(): DjInfo | null {
  return loadSettings().djInfo || null;
}

/**
 * Returns the configured Server URLs based on current settings
 */
export function getConfiguredUrls() {
  const settings = loadSettings();
  if (settings.serverEnv === "prod") {
    return {
      wsUrl: "wss://api.pika.stream/ws",
      webUrl: "https://pika.stream",
      apiUrl: "https://api.pika.stream",
    };
  }

  if (settings.serverEnv === "staging") {
    return {
      wsUrl: "wss://staging-api.pika.stream/ws",
      webUrl: "https://staging.pika.stream",
      apiUrl: "https://staging-api.pika.stream",
    };
  }

  // Dev overrides via env vars or default localhost
  return {
    wsUrl: import.meta.env.VITE_CLOUD_WS_URL || "ws://localhost:3001/ws",
    webUrl: import.meta.env.VITE_WEB_URL || "http://localhost:3002",
    apiUrl: "http://localhost:3001",
  };
}
