/**
 * Identity claim outcome mapping — DI only (injected insert/owner fns; never mock.module).
 * Real-Postgres claim behavior (PK races, cascade) lives in the gated integration suite.
 */

import { describe, expect, test } from "bun:test";
import {
  CLIENT_ID_REGEX,
  type ClaimDeps,
  claimClientId,
  deriveDeviceLabel,
  maskClientId,
} from "./identity";

function makeDeps(overrides: Partial<ClaimDeps> = {}): ClaimDeps {
  return {
    insertClaim: async () => true,
    getOwner: async () => null,
    setLabel: async () => {},
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
  test("fresh id → claimed, label passed to the insert", async () => {
    const inserts: (string | null)[] = [];
    const deps = makeDeps({
      insertClaim: async (_c, _u, label) => {
        inserts.push(label);
        return true;
      },
    });
    expect(await claimClientId("user_a", "client_x", "iPhone · Safari", deps)).toBe("claimed");
    expect(inserts).toEqual(["iPhone · Safari"]);
  });

  test("already claimed by me → already_yours + label refreshed", async () => {
    const refreshed: string[] = [];
    const deps = makeDeps({
      insertClaim: async () => false,
      getOwner: async () => "user_a",
      setLabel: async (_c, _u, label) => {
        refreshed.push(label);
      },
    });
    expect(await claimClientId("user_a", "client_x", "Mac · Firefox", deps)).toBe("already_yours");
    expect(refreshed).toEqual(["Mac · Firefox"]);
  });

  test("already_yours without a derivable label leaves the stored label alone", async () => {
    let touched = false;
    const deps = makeDeps({
      insertClaim: async () => false,
      getOwner: async () => "user_a",
      setLabel: async () => {
        touched = true;
      },
    });
    expect(await claimClientId("user_a", "client_x", null, deps)).toBe("already_yours");
    expect(touched).toBe(false);
  });

  test("claimed by another account → conflict (first-claim-wins), no label write", async () => {
    let touched = false;
    const deps = makeDeps({
      insertClaim: async () => false,
      getOwner: async () => "user_b",
      setLabel: async () => {
        touched = true;
      },
    });
    expect(await claimClientId("user_a", "client_x", "iPhone · Safari", deps)).toBe("conflict");
    expect(touched).toBe(false);
  });

  test("insert lost a race and the winner was someone else → conflict", async () => {
    // onConflictDoNothing returned no row; the follow-up owner lookup decides.
    const deps = makeDeps({ insertClaim: async () => false, getOwner: async () => "user_c" });
    expect(await claimClientId("user_a", "client_x", null, deps)).toBe("conflict");
  });
});

describe("deriveDeviceLabel", () => {
  test("classifies the common OS · browser pairs", () => {
    expect(
      deriveDeviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("iPhone · Safari");
    expect(
      deriveDeviceLabel(
        "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe("Android · Chrome");
    expect(
      deriveDeviceLabel(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:126.0) Gecko/20100101 Firefox/126.0",
      ),
    ).toBe("Mac · Firefox");
    expect(
      deriveDeviceLabel(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36 Edg/125.0.0.0",
      ),
    ).toBe("Windows · Edge");
    // Chrome on iOS ships a CriOS token, not Chrome/.
    expect(
      deriveDeviceLabel(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/125.0.0.0 Mobile/15E148 Safari/604.1",
      ),
    ).toBe("iPhone · Chrome");
  });

  test("unrecognizable or missing UA → null (never a garbage label)", () => {
    expect(deriveDeviceLabel(undefined)).toBeNull();
    expect(deriveDeviceLabel("")).toBeNull();
    expect(deriveDeviceLabel("curl/8.6.0")).toBeNull();
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
