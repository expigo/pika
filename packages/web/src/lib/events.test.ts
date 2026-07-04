/**
 * trackEvent unit tests — run under BUN (`bun test`; the web dual-runner sends *.test.ts to bun
 * and *.rtl.tsx to vitest), so no `vi.*`: globals are saved/overridden/restored by hand. The env
 * var short-circuits getApiBaseUrl before it would touch window.location (absent under bun).
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { trackEvent } from "./events";

type MutableGlobal = typeof globalThis & {
  window?: unknown;
  localStorage?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
    clear(): void;
  };
};

const g = globalThis as MutableGlobal;
const originalFetch = globalThis.fetch;
const hadWindow = "window" in globalThis;
const hadLocalStorage = "localStorage" in globalThis;
const originalEnv = process.env["NEXT_PUBLIC_CLOUD_API_URL"];

let store: Map<string, string>;
let setItemCalls: number;
let calls: Array<{ url: string; init: RequestInit | undefined }>;

beforeEach(() => {
  store = new Map();
  setItemCalls = 0;
  calls = [];
  process.env["NEXT_PUBLIC_CLOUD_API_URL"] = "http://cloud.test";
  g.window = globalThis;
  g.localStorage = {
    getItem: (key) => store.get(key) ?? null,
    setItem: (key, value) => {
      setItemCalls++;
      store.set(key, value);
    },
    removeItem: (key) => {
      store.delete(key);
    },
    clear: () => store.clear(),
  };
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (!hadWindow) delete g.window;
  if (!hadLocalStorage) delete g.localStorage;
  if (originalEnv === undefined) {
    delete process.env["NEXT_PUBLIC_CLOUD_API_URL"];
  } else {
    process.env["NEXT_PUBLIC_CLOUD_API_URL"] = originalEnv;
  }
});

describe("trackEvent", () => {
  it("POSTs to /api/telemetry/events with keepalive and the CSRF header", () => {
    trackEvent("journal_opened", { totalLikes: 3 });
    expect(calls.length).toBe(1);
    const call = calls[0];
    expect(call?.url).toBe("http://cloud.test/api/telemetry/events");
    expect(call?.init?.method).toBe("POST");
    expect(call?.init?.keepalive).toBe(true);
    expect((call?.init?.headers as Record<string, string>)["X-Pika-Client"]).toBe("pika-web");
    const body = JSON.parse(String(call?.init?.body)) as Record<string, unknown>;
    expect(body).toEqual({ event: "journal_opened", props: { totalLikes: 3 } });
  });

  it("includes the clientId when one exists — and never mints one", () => {
    store.set("pika_client_id", "client_abc");
    trackEvent("journal_spotify_click");
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect(body).toEqual({ event: "journal_spotify_click", clientId: "client_abc" });
    expect(setItemCalls).toBe(0);
  });

  it("omits clientId when absent and never writes localStorage", () => {
    trackEvent("install_nudge_shown");
    const body = JSON.parse(String(calls[0]?.init?.body)) as Record<string, unknown>;
    expect("clientId" in body).toBe(false);
    expect(setItemCalls).toBe(0);
  });

  it("never throws — rejected fetch is swallowed", async () => {
    globalThis.fetch = (() => Promise.reject(new Error("offline"))) as typeof fetch;
    expect(() => trackEvent("journal_export_failed", { status: 503 })).not.toThrow();
    await Promise.resolve(); // drain the microtask queue — the .catch swallows the rejection
  });

  it("no-ops without a window (SSR guard)", () => {
    delete g.window;
    trackEvent("journal_opened");
    expect(calls.length).toBe(0);
  });
});
