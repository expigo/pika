/**
 * Claim orchestration tests — run under BUN (web dual-runner: *.test.ts → bun). Globals are
 * saved/overridden/restored by hand (no vi.*). The env var short-circuits getApiBaseUrl before
 * it would touch window.location.
 */

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { CLIENT_ID_KEY, rotateClientId } from "./client";
import {
  clearAccountHint,
  ensureClientIdClaimed,
  hasAccountHint,
  setAccountHint,
} from "./identity";

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
let responses: Array<{ status: number; body?: unknown }>;
let calls: Array<{ url: string; body: unknown }>;

beforeEach(() => {
  store = new Map();
  responses = [];
  calls = [];
  process.env["NEXT_PUBLIC_CLOUD_API_URL"] = "http://cloud.test";
  g.window = globalThis;
  g.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => {
      store.set(k, v);
    },
    removeItem: (k) => {
      store.delete(k);
    },
    clear: () => store.clear(),
  };
  globalThis.fetch = ((url: string | URL, init?: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) });
    const next = responses.shift() ?? { status: 200, body: { status: "claimed" } };
    return Promise.resolve(
      new Response(next.body === undefined ? null : JSON.stringify(next.body), {
        status: next.status,
      }),
    );
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

describe("account hint flag", () => {
  it("set / has / clear round-trip", () => {
    expect(hasAccountHint()).toBe(false);
    setAccountHint();
    expect(hasAccountHint()).toBe(true);
    clearAccountHint();
    expect(hasAccountHint()).toBe(false);
  });
});

describe("rotateClientId", () => {
  it("overwrites the stored id with a fresh client_ id", () => {
    store.set(CLIENT_ID_KEY, "client_old");
    const next = rotateClientId();
    expect(next.startsWith("client_")).toBe(true);
    expect(next).not.toBe("client_old");
    expect(store.get(CLIENT_ID_KEY)).toBe(next);
  });
});

describe("ensureClientIdClaimed", () => {
  it("mints an id when absent, claims it, and sets the hint (ITP recovery path)", async () => {
    responses.push({ status: 200, body: { status: "claimed" } });
    const result = await ensureClientIdClaimed();
    expect(result).toBe("claimed");
    expect(store.get(CLIENT_ID_KEY)?.startsWith("client_")).toBe(true);
    expect(hasAccountHint()).toBe(true);
    expect(calls[0]?.url).toBe("http://cloud.test/api/me/journal/claim");
    expect((calls[0]?.body as { clientId?: string }).clientId).toBe(store.get(CLIENT_ID_KEY));
  });

  it("401 → no_session (anonymous visitor), no hint set", async () => {
    responses.push({ status: 401, body: { error: "Authentication required" } });
    expect(await ensureClientIdClaimed()).toBe("no_session");
    expect(hasAccountHint()).toBe(false);
  });

  it("409 → rotates the id (kiosk rule) and re-claims the FRESH id", async () => {
    store.set(CLIENT_ID_KEY, "client_someone_elses");
    responses.push({ status: 409, body: { error: "claimed_by_another_account" } });
    responses.push({ status: 200, body: { status: "claimed" } });

    const result = await ensureClientIdClaimed();
    expect(result).toBe("rotated_and_claimed");
    const rotated = store.get(CLIENT_ID_KEY);
    expect(rotated).not.toBe("client_someone_elses");
    // Second claim carried the rotated id (calls: claim, [no push sub → no re-POST], claim).
    const claimCalls = calls.filter((c) => c.url.includes("/journal/claim"));
    expect(claimCalls.length).toBe(2);
    expect((claimCalls[1]?.body as { clientId?: string }).clientId).toBe(rotated);
  });

  it("dedupes concurrent calls into one request", async () => {
    responses.push({ status: 200, body: { status: "claimed" } });
    const [a, b] = await Promise.all([ensureClientIdClaimed(), ensureClientIdClaimed()]);
    expect(a).toBe("claimed");
    expect(b).toBe("claimed");
    expect(calls.filter((c) => c.url.includes("/journal/claim")).length).toBe(1);
  });
});
