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
import { TOKEN_FOCUS_REVALIDATION_MIN_MS, TOKEN_REVALIDATION_INTERVAL_MS } from "./live/constants";
import { PikaEnvironment, URLS } from "@pika/shared";

const STORAGE_KEY = "pika_dj_settings";

// 🛡️ R2 Fix: Module-level lock to prevent cross-instance validation races
// 🛡️ Issue 29 Fix: Deduplicate in-flight validation requests
class TokenValidationManager {
  private static instance: TokenValidationManager;
  private isGlobalValidating = false;
  private pendingRequests = new Map<string, Promise<DjInfo | null>>();

  private constructor() {}

  static getInstance(): TokenValidationManager {
    if (!TokenValidationManager.instance) {
      TokenValidationManager.instance = new TokenValidationManager();
    }
    return TokenValidationManager.instance;
  }

  isValidating(): boolean {
    return this.isGlobalValidating;
  }

  setValidating(validating: boolean) {
    this.isGlobalValidating = validating;
  }

  async validate(
    token: string,
    validator: (t: string) => Promise<DjInfo | null>,
  ): Promise<DjInfo | null> {
    if (this.pendingRequests.has(token)) {
      // Return existing promise (Deduplication)
      return this.pendingRequests.get(token)!;
    }

    const promise = validator(token).finally(() => {
      this.pendingRequests.delete(token);
    });

    this.pendingRequests.set(token, promise);
    return promise;
  }
}

const validationManager = TokenValidationManager.getInstance();

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

// Auto-detect environment: DEV mode in Vite dev server, PROD for release builds
const DEFAULT_SERVER_ENV: ServerEnv = import.meta.env.DEV ? "dev" : "prod";

const DEFAULT_SETTINGS: DjSettings = {
  djName: "",
  serverEnv: DEFAULT_SERVER_ENV,
  authToken: "",
  djInfo: null,
  tokenValidatedAt: null,
};

function loadSettings(): DjSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // S1.4.3: Safe JSON parsing (ensure object and not array/null)
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const settings = { ...DEFAULT_SETTINGS, ...parsed };
        // 🔧 Dev Mode Override: Force dev environment when running locally
        // Multiple detection methods for Tauri + Vite compatibility
        const isViteDev = import.meta.env.DEV;
        const isLocalhost =
          typeof window !== "undefined" &&
          (window.location.hostname === "localhost" ||
            window.location.hostname === "127.0.0.1" ||
            window.location.port === "5173" || // Vite default port
            window.location.protocol === "tauri:");

        if ((isViteDev || isLocalhost) && settings.serverEnv !== "dev") {
          console.log("[DJ Settings] Dev mode detected - but allowing manual override", {
            isViteDev,
            isLocalhost,
            currentEnv: settings.serverEnv,
          });
          // DISABLED FOR TESTING: settings.serverEnv = "dev";
        }
        return settings;
      }
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
 * Helper to map local ServerEnv to Shared PikaEnvironment
 */
function mapEnv(env: ServerEnv): PikaEnvironment {
  switch (env) {
    case "dev":
      return "development";
    case "staging":
      return "staging";
    case "prod":
      return "production";
    default:
      return "production";
  }
}

/**
 * Get the API base URL based on current environment
 */
function getApiBaseUrl(): string {
  const settings = loadSettings();
  return URLS.getApiUrl(mapEnv(settings.serverEnv));
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

    // S1.4.4: Response validation (manual type guards)
    if (
      data &&
      typeof data === "object" &&
      data.success === true &&
      data.user &&
      typeof data.user === "object" &&
      typeof data.user.id === "number" &&
      typeof data.user.displayName === "string"
    ) {
      return {
        id: data.user.id,
        displayName: data.user.displayName,
        email: data.user.email || "",
        slug: data.user.slug || "",
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
  const revalidateToken = useCallback(async (): Promise<{ valid: boolean; skipped?: boolean }> => {
    const currentSettings = loadSettings();
    if (
      !currentSettings.authToken ||
      isRevalidatingRef.current ||
      validationManager.isValidating()
    ) {
      return { valid: true, skipped: true }; // No token, already local revalidating, or global revalidating
    }

    isRevalidatingRef.current = true;
    validationManager.setValidating(true);

    try {
      // Issue 29 Fix: Deduplicate calls
      const djInfo = await validationManager.validate(
        currentSettings.authToken,
        validateTokenWithServer,
      );

      if (djInfo) {
        // Token still valid - update validation timestamp
        setSettingsState((prev) => {
          const newSettings = { ...prev, tokenValidatedAt: Date.now() };
          saveSettings(newSettings);
          return newSettings;
        });
        return { valid: true, skipped: false };
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
        return { valid: false, skipped: false };
      }
    } catch (e) {
      // Network error - don't clear token, just log
      console.warn("[DJ Settings] Token revalidation network error:", e);
      return { valid: true, skipped: true }; // Assume valid on network error (skipped validation)
    } finally {
      isRevalidatingRef.current = false;
      validationManager.setValidating(false);
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
        // Reset defaults
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
      const djInfo = await validationManager.validate(authToken, validateTokenWithServer);

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
      const newSettings = {
        ...prev,
        authToken: "",
        djInfo: null,
        djName: "",
        tokenValidatedAt: null,
      };
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
  const env = mapEnv(settings.serverEnv);

  if (env === "production" || env === "staging") {
    const wsUrl = URLS.getWsUrl(env);
    // Ensure WS URL ends with /ws for production/staging if that's the convention
    // Derived from original code: "wss://api.pika.stream/ws"
    // Shared returns: "wss://api.pika.stream"
    const finalWsUrl = wsUrl.endsWith("/ws") ? wsUrl : `${wsUrl}/ws`;

    return {
      wsUrl: finalWsUrl,
      webUrl: URLS.getWebUrl(env),
      apiUrl: URLS.getApiUrl(env),
    };
  }

  // Dev overrides via env vars (preserve original flexibility)
  return {
    wsUrl: import.meta.env.VITE_CLOUD_WS_URL || `${URLS.getWsUrl("development")}/ws`,
    webUrl: import.meta.env.VITE_WEB_URL || URLS.getWebUrl("development"),
    apiUrl: URLS.getApiUrl("development"),
  };
}
