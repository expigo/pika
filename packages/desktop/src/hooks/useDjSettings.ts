import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { apiFetch } from "../services/apiClient";
import {
  type DjInfo,
  type DjSettings,
  getApiBaseUrl,
  loadSettings,
  SETTINGS_UPDATED_EVENT,
  type ServerEnv,
  saveSettings,
} from "../services/settingsService";
import { TOKEN_REVALIDATION_INTERVAL_MS } from "./live/constants";

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
    // Better Auth resolves the bearer (session) token via its get-session endpoint,
    // returning `{ session, user }` (or null/empty when the token is invalid/expired).
    const response = await apiFetch(`${baseUrl}/api/auth/get-session`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) return null;
    const data = await response.json();
    const user = data?.user;
    if (user?.id) {
      return {
        id: user.id,
        displayName: user.name, // Better Auth stores the display name as `name`
        email: user.email || "",
        slug: user.slug || "",
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Best-effort server-side revoke of the pasted session token (Better Auth sign-out). Called when
 * the DJ clears their token so the session dies on the server too — not just locally. Failures are
 * swallowed: the local clear must proceed regardless (e.g. offline, or an already-expired token).
 */
export async function revokeTokenOnServer(token: string): Promise<void> {
  if (!token) return;
  try {
    const baseUrl = getApiBaseUrl();
    await apiFetch(`${baseUrl}/api/auth/sign-out`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // best-effort
  }
}

export function useDjSettings() {
  const [settings, setSettingsState] = useState<DjSettings>(loadSettings);
  const [isValidating, setIsValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Mirror the latest committed settings so callbacks can read them synchronously
  // (without a functional updater). saveSettings() must run from the event handler,
  // NEVER inside a setState updater: React executes updaters during the render
  // phase, and saveSettings synchronously dispatches SETTINGS_UPDATED_EVENT, which
  // would setState sibling useDjSettings instances mid-render ("Cannot update a
  // component while rendering a different component").
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  // Apply a change locally, persist it, and broadcast to sibling instances — once,
  // from the caller's event handler rather than from inside an updater.
  const applySettings = useCallback((patch: (prev: DjSettings) => DjSettings) => {
    const next = patch(settingsRef.current);
    settingsRef.current = next;
    setSettingsState(next);
    saveSettings(next);
  }, []);

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
        applySettings((prev) => ({ ...prev, tokenValidatedAt: Date.now() }));
        return { valid: true, skipped: false };
      } else {
        toast.error("Session expired. Please re-authenticate.", { icon: "🔑" });
        applySettings((prev) => ({
          ...prev,
          authToken: "",
          djInfo: null,
          tokenValidatedAt: null,
          djName: "",
        }));
        return { valid: false, skipped: false };
      }
    } catch {
      return { valid: true, skipped: true };
    } finally {
      isRevalidatingRef.current = false;
      validationManager.setValidating(false);
    }
  }, [applySettings]);

  useEffect(() => {
    if (!settings.authToken) return;
    const intervalId = setInterval(() => {
      void revalidateToken();
    }, TOKEN_REVALIDATION_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [settings.authToken, revalidateToken]);

  const setDjName = useCallback(
    (djName: string) => {
      applySettings((prev) => ({ ...prev, djName }));
    },
    [applySettings],
  );

  const setServerEnv = useCallback(
    (serverEnv: ServerEnv) => {
      applySettings((prev) => ({
        ...prev,
        serverEnv,
        authToken: "",
        djInfo: null,
        djName: "",
        tokenValidatedAt: null,
      }));
    },
    [applySettings],
  );

  const setAuthToken = useCallback(
    async (authToken: string): Promise<boolean> => {
      setValidationError(null);
      if (!authToken) {
        // Clearing the token = logging out → revoke the session server-side too (best-effort),
        // not just locally, so a copied token can't keep being used.
        const prevToken = settingsRef.current.authToken;
        if (prevToken) void revokeTokenOnServer(prevToken);
        applySettings((prev) => ({ ...prev, authToken: "", djInfo: null, tokenValidatedAt: null }));
        return true;
      }
      setIsValidating(true);
      try {
        const djInfo = await validationManager.validate(authToken, validateTokenWithServer);
        if (djInfo) {
          applySettings((prev) => ({
            ...prev,
            authToken,
            djInfo,
            djName: djInfo.displayName,
            tokenValidatedAt: Date.now(),
          }));
          return true;
        } else {
          setValidationError("Invalid token.");
          return false;
        }
      } finally {
        setIsValidating(false);
      }
    },
    [applySettings],
  );

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
  getApiBaseUrl,
  getAuthToken,
  getConfiguredUrls,
  getDjInfo,
  getDjName,
  getStoredSettings,
} from "../services/settingsService";
