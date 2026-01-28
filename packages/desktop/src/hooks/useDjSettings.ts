/**
 * DJ Settings Hook
 * Manages DJ profile settings (name, env, token, etc.) persisted to localStorage
 */

import { fetch } from "@tauri-apps/plugin-http"; // Use Tauri HTTP to bypass CORS
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { TOKEN_FOCUS_REVALIDATION_MIN_MS, TOKEN_REVALIDATION_INTERVAL_MS } from "./live/constants";
import { PikaEnvironment, URLS } from "@pika/shared";

const STORAGE_KEY = "pika_dj_settings";

// 🛡️ Deduplicate in-flight validation requests
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

export interface DjInfo {
  id: number;
  displayName: string;
  email: string;
  slug: string;
}

interface DjSettings {
  djName: string;
  serverEnv: ServerEnv;
  authToken: string;
  djInfo: DjInfo | null;
  tokenValidatedAt: number | null;
}

// Environment Detection (Computed Once outside of render)
const isViteDev = typeof import.meta !== "undefined" && !!import.meta.env?.DEV;
const isLocalhost =
  typeof window !== "undefined" &&
  (window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1" ||
    window.location.port === "5173" ||
    window.location.protocol === "tauri:");

const DEFAULT_SERVER_ENV: ServerEnv = isViteDev ? "dev" : "prod";

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
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ...DEFAULT_SETTINGS, ...parsed };
      }
    }
  } catch (e) {
    console.error("Failed to load DJ settings:", e);
  }
  return DEFAULT_SETTINGS;
}

const SETTINGS_UPDATED_EVENT = "pika:settings-updated";

function dispatchSettingsUpdate() {
  window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));
}

function saveSettings(settings: DjSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    dispatchSettingsUpdate();
  } catch (e) {
    console.error("Failed to save DJ settings:", e);
  }
}

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

function getApiBaseUrl(): string {
  const settings = loadSettings();
  return URLS.getApiUrl(mapEnv(settings.serverEnv));
}

export async function validateTokenWithServer(token: string): Promise<DjInfo | null> {
  if (!token) return null;
  try {
    const baseUrl = getApiBaseUrl();
    const response = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "X-Pika-Client": "pika-desktop",
      },
    });

    if (!response.ok) return null;
    const data = await response.json();
    if (data?.success === true && data.user) {
      return {
        id: data.user.id,
        displayName: data.user.displayName,
        email: data.user.email || "",
        slug: data.user.slug || "",
      };
    }
    return null;
  } catch (e) {
    return null;
  }
}

export function useDjSettings() {
  const [settings, setSettingsState] = useState<DjSettings>(loadSettings);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    const handleUpdate = () => {
      const fresh = loadSettings();
      setSettingsState((prev) => {
        if (JSON.stringify(prev) === JSON.stringify(fresh)) return prev;
        return fresh;
      });
    };
    window.addEventListener(SETTINGS_UPDATED_EVENT, handleUpdate);
    return () => window.removeEventListener(SETTINGS_UPDATED_EVENT, handleUpdate);
  }, []);

  const isRevalidatingRef = useRef(false);

  const revalidateToken = useCallback(async (): Promise<{ valid: boolean; skipped?: boolean }> => {
    const currentSettings = loadSettings();
    if (
      !currentSettings.authToken ||
      isRevalidatingRef.current ||
      validationManager.isValidating()
    ) {
      return { valid: true, skipped: true };
    }

    isRevalidatingRef.current = true;
    validationManager.setValidating(true);

    try {
      const djInfo = await validationManager.validate(
        currentSettings.authToken,
        validateTokenWithServer,
      );
      if (djInfo) {
        setSettingsState((prev) => {
          const newSettings = { ...prev, tokenValidatedAt: Date.now() };
          saveSettings(newSettings);
          return newSettings;
        });
        return { valid: true, skipped: false };
      } else {
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
      return { valid: true, skipped: true };
    } finally {
      isRevalidatingRef.current = false;
      validationManager.setValidating(false);
    }
  }, []);

  useEffect(() => {
    if (!settings.authToken) return;
    const intervalId = setInterval(() => {
      void revalidateToken();
    }, TOKEN_REVALIDATION_INTERVAL_MS);
    return () => clearInterval(intervalId);
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

  const setAuthToken = useCallback(async (authToken: string): Promise<boolean> => {
    setValidationError(null);
    if (!authToken) {
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
        setSettingsState((prev) => {
          const newSettings = {
            ...prev,
            authToken,
            djInfo,
            djName: djInfo.displayName,
            tokenValidatedAt: Date.now(),
          };
          saveSettings(newSettings);
          return newSettings;
        });
        return true;
      } else {
        setValidationError("Invalid token.");
        return false;
      }
    } finally {
      setIsValidating(false);
    }
  }, []);

  return {
    djName: settings.djName,
    serverEnv: settings.serverEnv,
    authToken: settings.authToken,
    djInfo: settings.djInfo,
    hasSetDjName: settings.djName.length > 0,
    hasAuthToken: settings.authToken.length > 0,
    isAuthenticated: !!settings.djInfo,
    isValidating,
    validationError,
    setDjName,
    setServerEnv,
    setAuthToken,
    clearToken: () => setAuthToken(""),
  };
}

export function getStoredSettings(): DjSettings {
  return loadSettings();
}
export function getDjName(): string {
  const settings = loadSettings();
  return settings.djInfo?.displayName || settings.djName || "DJ";
}
export function getAuthToken(): string {
  return loadSettings().authToken || "";
}
export function getDjInfo(): DjInfo | null {
  return loadSettings().djInfo || null;
}

export function getConfiguredUrls() {
  const settings = loadSettings();
  const env = mapEnv(settings.serverEnv);
  const wsUrl = URLS.getWsUrl(env);
  const finalWsUrl = wsUrl.endsWith("/ws") ? wsUrl : `${wsUrl}/ws`;
  return { wsUrl: finalWsUrl, webUrl: URLS.getWebUrl(env), apiUrl: URLS.getApiUrl(env) };
}
