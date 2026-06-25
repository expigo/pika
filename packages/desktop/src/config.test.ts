import { beforeEach, describe, expect, it, vi } from "vitest";

// config.ts computes URL bases from useDjSettings at module load, and getWebClientBaseUrl
// reads getStoredSettings() live. Mock the settings module so URL building is deterministic.
const { settings } = vi.hoisted(() => ({ settings: { serverEnv: "prod" as string } }));
vi.mock("./hooks/useDjSettings", () => ({
  getConfiguredUrls: () => ({
    wsUrl: "wss://api.pika.stream/ws",
    webUrl: "https://pika.stream",
    apiUrl: "https://api.pika.stream",
  }),
  getStoredSettings: () => settings,
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

import { getListenerUrl, getStageListenerUrl } from "./config";

describe("getStageListenerUrl", () => {
  beforeEach(() => {
    settings.serverEnv = "prod";
  });

  it("builds /stage/{id} on the public domain in prod", () => {
    expect(getStageListenerUrl("main-floor")).toBe("https://pika.stream/stage/main-floor");
  });

  it("ignores a LAN IP in prod (always the public domain)", () => {
    expect(getStageListenerUrl("main-floor", "192.168.1.5")).toBe(
      "https://pika.stream/stage/main-floor",
    );
  });

  it("uses the LAN IP + dev web port in development", () => {
    settings.serverEnv = "development";
    expect(getStageListenerUrl("main-floor", "192.168.1.5")).toBe(
      "http://192.168.1.5:3002/stage/main-floor",
    );
  });

  it("falls back to the public domain in dev without a LAN IP", () => {
    settings.serverEnv = "development";
    expect(getStageListenerUrl("main-floor")).toBe("https://pika.stream/stage/main-floor");
  });
});

describe("getListenerUrl (regression — session path unchanged)", () => {
  beforeEach(() => {
    settings.serverEnv = "prod";
  });

  it("builds /live/{id} with the DJ name query", () => {
    expect(getListenerUrl("sess-123", "DJ X")).toBe("https://pika.stream/live/sess-123?dj=DJ+X");
  });
});
