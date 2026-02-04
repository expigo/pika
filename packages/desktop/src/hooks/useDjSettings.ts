import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "../services/apiClient";
import { TOKEN_REVALIDATION_INTERVAL_MS } from "./live/constants";
import {
  type DjInfo,
  type DjSettings,
  type ServerEnv,
  getApiBaseUrl,
  loadSettings,
  saveSettings,
  SETTINGS_UPDATED_EVENT,
} from "../services/settingsService";

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
    const pending = this.pendingRequests.get(token);
    if (pending) return pending;

    const promise = validator(token).finally(() => {
      this.pendingRequests.delete(token);
    });

    this.pendingRequests.set(token, promise);
    return promise;
  }
}

const validationManager = TokenValidationManager.getInstance();

export async function validateTokenWithServer(token: string): Promise<DjInfo | null> {
  if (!token) return null;
  try {
    const baseUrl = getApiBaseUrl();
    const response = await apiFetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
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
  } catch {
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
    } catch {
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

// Re-export shared helper functions from settingsService
export {
  getStoredSettings,
  getDjName,
  getAuthToken,
  getDjInfo,
  getConfiguredUrls,
  getApiBaseUrl,
} from "../services/settingsService";
