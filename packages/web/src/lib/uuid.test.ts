import { afterEach, describe, expect, test } from "bun:test";
import { safeRandomUUID } from "./uuid";

const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("safeRandomUUID", () => {
  const original = (globalThis.crypto as Crypto | undefined)?.randomUUID;
  afterEach(() => {
    if (globalThis.crypto && original) {
      (globalThis.crypto as { randomUUID: typeof original }).randomUUID = original;
    }
  });

  test("returns a v4 UUID and is unique across calls (secure-context path)", () => {
    const a = safeRandomUUID();
    const b = safeRandomUUID();
    expect(a).toMatch(V4);
    expect(b).toMatch(V4);
    expect(a).not.toBe(b);
  });

  test("falls back to a valid v4 when crypto.randomUUID is unavailable (http://LAN-IP)", () => {
    // Reproduce the insecure-context case: randomUUID gone, getRandomValues present.
    (globalThis.crypto as { randomUUID?: unknown }).randomUUID = undefined;
    const id = safeRandomUUID();
    expect(id).toMatch(V4);
    expect(id).not.toBe(safeRandomUUID()); // still unique
  });
});
