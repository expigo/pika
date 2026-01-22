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
 * 6. Periodic revalidation ensures token is still valid (U1 fix)
 */

import { fetch } from "@tauri-apps/plugin-http"; // Use Tauri HTTP to bypass CORS
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  TOKEN_FOCUS_REVALIDATION_MIN_MS,
  TOKEN_REVALIDATION_INTERVAL_MS,
} from "./live/constants";

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
  tokenValidatedAt: number | null; // Timestamp of last successful validation (U1 fix)
}

const DEFAULT_SETTINGS: DjSettings = {
  djName: "",
  serverEnv: "prod", // Default to PROD for release builds!
  authToken: "",
  djInfo: null,
  tokenValidatedAt: null,
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

  // Track if revalidation is in progress to avoid concurrent revalidations
  const isRevalidatingRef = useRef(false);

  /**
   * Revalidate the current token silently
   * U1 fix: Ensures revoked tokens are detected
   */
  const revalidateToken = useCallback(async (): Promise<boolean> => {
    const currentSettings = loadSettings();
    if (!currentSettings.authToken || isRevalidatingRef.current) {
      return true; // No token to revalidate or already revalidating
    }

    isRevalidatingRef.current = true;

    try {
      const djInfo = await validateTokenWithServer(currentSettings.authToken);

      if (djInfo) {
        // Token still valid - update validation timestamp
        setSettingsState((prev) => {
          const newSettings = { ...prev, tokenValidatedAt: Date.now() };
          saveSettings(newSettings);
          return newSettings;
        });
        return true;
      } else {
        // Token revoked or expired - clear auth state
        console.warn("[DJ Settings] Token revalidation failed - token may be revoked");
        toast.error("Session expired. Please re-authenticate.", { icon: "🔑" });
        setSettingsState((prev) => {
          const newSettings = {
            ...prev,
            authToken: "",
            djInfo: null,
            tokenValidatedAt: null,
            djName: "",
          };
          saveSettings(newSettings);
          return newSettings;
        });
        return false;
      }
    } catch (e) {
      // Network error - don't clear token, just log
      console.warn("[DJ Settings] Token revalidation network error:", e);
      return true; // Assume valid on network error
    } finally {
      isRevalidatingRef.current = false;
    }
  }, []);

  // Periodic token revalidation (U1 fix)
  useEffect(() => {
    if (!settings.authToken) return;

    const intervalId = setInterval(() => {
      void revalidateToken();
    }, TOKEN_REVALIDATION_INTERVAL_MS);

    return () => clearInterval(intervalId);
  }, [settings.authToken, revalidateToken]);

  // Revalidate on app focus/visibility change (U1 fix)
  useEffect(() => {
    if (!settings.authToken) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const currentSettings = loadSettings();
        const lastValidated = currentSettings.tokenValidatedAt || 0;
        const timeSinceValidation = Date.now() - lastValidated;

        // Only revalidate if enough time has passed since last validation
        if (timeSinceValidation >= TOKEN_FOCUS_REVALIDATION_MIN_MS) {
          void revalidateToken();
        }
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [settings.authToken, revalidateToken]);

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
        tokenValidatedAt: null,
      };
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
        const newSettings = { ...prev, authToken: "", djInfo: null, tokenValidatedAt: null };
        saveSettings(newSettings);
        return newSettings;
      });
      return true;
    }

    setIsValidating(true);

    try {
      const djInfo = await validateTokenWithServer(authToken);

      if (djInfo) {
        // Token valid! Auto-sync DJ name and record validation time
        setSettingsState((prev) => {
          const newSettings = {
            ...prev,
            authToken,
            djInfo,
            djName: djInfo.displayName, // Auto-sync!
            tokenValidatedAt: Date.now(), // U1 fix: track validation time
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
          const newSettings = { ...prev, authToken: "", djInfo: null, tokenValidatedAt: null };
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
      const newSettings = { ...prev, authToken: "", djInfo: null, djName: "", tokenValidatedAt: null };
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
