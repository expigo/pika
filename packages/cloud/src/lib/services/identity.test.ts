/**
 * Identity claim outcome mapping — DI only (injected insert/owner fns; never mock.module).
 * Real-Postgres claim behavior (PK races, cascade) lives in the gated integration suite.
 */

import { describe, expect, test } from "bun:test";
import { CLIENT_ID_REGEX, type ClaimDeps, claimClientId, maskClientId } from "./identity";

function makeDeps(overrides: Partial<ClaimDeps> = {}): ClaimDeps {
  return {
    insertClaim: async () => true,
    getOwner: async () => null,
    ...overrides,
  };
}

describe("maskClientId", () => {
  test("keeps the correlation prefix, drops the credential entropy", () => {
    const masked = maskClientId("client_1767210922083_w3xhs6skmrh");
    expect(masked).toBe("client_17672109…");
    expect(masked).not.toContain("w3xhs6skmrh");
  });
});

describe("claimClientId", () => {
  test("fresh id → claimed", async () => {
    expect(await claimClientId("user_a", "client_x", makeDeps())).toBe("claimed");
  });

  test("already claimed by me → already_yours (idempotent)", async () => {
    const deps = makeDeps({ insertClaim: async () => false, getOwner: async () => "user_a" });
    expect(await claimClientId("user_a", "client_x", deps)).toBe("already_yours");
  });

  test("claimed by another account → conflict (first-claim-wins)", async () => {
    const deps = makeDeps({ insertClaim: async () => false, getOwner: async () => "user_b" });
    expect(await claimClientId("user_a", "client_x", deps)).toBe("conflict");
  });

  test("insert lost a race and the winner was someone else → conflict", async () => {
    // onConflictDoNothing returned no row; the follow-up owner lookup decides.
    const deps = makeDeps({ insertClaim: async () => false, getOwner: async () => "user_c" });
    expect(await claimClientId("user_a", "client_x", deps)).toBe("conflict");
  });
});

describe("CLIENT_ID_REGEX", () => {
  test("accepts browser-minted ids, rejects garbage", () => {
    expect(CLIENT_ID_REGEX.test("client_9f3a2c1e-aaaa-bbbb-cccc-1234567890ab")).toBe(true);
    expect(CLIENT_ID_REGEX.test("client_mr6imzxz_abc123")).toBe(true);
    expect(CLIENT_ID_REGEX.test("user_123")).toBe(false);
    expect(CLIENT_ID_REGEX.test("client_$bad")).toBe(false);
    expect(CLIENT_ID_REGEX.test("")).toBe(false);
  });
});
