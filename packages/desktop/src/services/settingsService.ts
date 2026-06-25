import { type PikaEnvironment, URLS } from "@pika/shared";

export type ServerEnv = "dev" | "prod" | "staging";

export interface DjInfo {
  id: string; // Better Auth user id (string, not the old integer serial)
  displayName: string;
  email: string;
  slug: string;
}

export interface DjSettings {
  djName: string;
  serverEnv: ServerEnv;
  authToken: string;
  djInfo: DjInfo | null;
  tokenValidatedAt: number | null;
}

const STORAGE_KEY = "pika_dj_settings";
export const SETTINGS_UPDATED_EVENT = "pika:settings-updated";

const isViteDev = typeof import.meta !== "undefined" && !!import.meta.env?.DEV;

const DEFAULT_SERVER_ENV: ServerEnv = isViteDev ? "dev" : "prod";

const DEFAULT_SETTINGS: DjSettings = {
  djName: "",
  serverEnv: DEFAULT_SERVER_ENV,
  authToken: "",
  djInfo: null,
  tokenValidatedAt: null,
};

let cachedSettings: DjSettings | null = null;

// Listen for updates from other parts of the app (e.g. via hooks)
if (typeof window !== "undefined") {
  window.addEventListener(SETTINGS_UPDATED_EVENT, () => {
    cachedSettings = null;
  });
}

export function loadSettings(): DjSettings {
  if (cachedSettings) return cachedSettings;

  let settings = DEFAULT_SETTINGS;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        settings = { ...DEFAULT_SETTINGS, ...parsed };
      }
    }
  } catch (e) {
    console.error("Failed to load DJ settings:", e);
  }
  cachedSettings = settings;
  return settings;
}

export function saveSettings(settings: DjSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    cachedSettings = settings;
    window.dispatchEvent(new Event(SETTINGS_UPDATED_EVENT));
  } catch (e) {
    console.error("Failed to save DJ settings:", e);
  }
}

export function getAuthToken(): string {
  return loadSettings().authToken || "";
}

export function getDjName(): string {
  const settings = loadSettings();
  return settings.djInfo?.displayName || settings.djName || "DJ";
}

export function getDjInfo(): DjInfo | null {
  return loadSettings().djInfo || null;
}

export function getStoredSettings(): DjSettings {
  return loadSettings();
}

/**
 * Maps our internal environment string to the PikaEnvironment type
 */
export function mapEnv(env: ServerEnv): PikaEnvironment {
  switch (env) {
    case "dev":
      return "development";
    case "staging":
      return "staging";
    case "prod":
    default:
      return "production";
  }
}

export function getApiBaseUrl(): string {
  const settings = loadSettings();
  return URLS.getApiUrl(mapEnv(settings.serverEnv));
}

export function getConfiguredUrls() {
  const settings = loadSettings();
  const env = mapEnv(settings.serverEnv);

  const wsUrl = URLS.getWsUrl(env);
  const finalWsUrl = wsUrl.endsWith("/ws") ? wsUrl : `${wsUrl}/ws`;

  return {
    apiUrl: URLS.getApiUrl(env),
    webUrl: URLS.getWebUrl(env),
    wsUrl: finalWsUrl,
    env,
  };
}
