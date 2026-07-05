/**
 * Unsubscribe-token tests (Slice C) — sign/verify round trip and tamper resistance. The DB
 * side (clearEmailConsent) lives in the integration suite; these are pure-crypto contracts.
 */

import { beforeAll, describe, expect, test } from "bun:test";
import { signUnsubToken, verifyUnsubToken } from "./email-prefs";

beforeAll(() => {
  // hmacSecret() reads BETTER_AUTH_SECRET (always present in a running system).
  process.env["BETTER_AUTH_SECRET"] ??= "test-secret-for-unsub-tokens";
});

describe("unsubscribe tokens", () => {
  test("round-trips userId + type for both email types", () => {
    for (const type of ["recap", "digest"] as const) {
      const token = signUnsubToken("user_abc-123", type);
      expect(verifyUnsubToken(token)).toEqual({ userId: "user_abc-123", type });
    }
  });

  test("rejects tampered payloads (swapping the type invalidates the signature)", () => {
    const token = signUnsubToken("user_abc", "recap");
    const [, sig] = token.split(".");
    const forged = `${Buffer.from("user_abc|digest", "utf8").toString("base64url")}.${sig}`;
    expect(verifyUnsubToken(forged)).toBeNull();
  });

  test("rejects tampered signatures, garbage, unknown types, and empties", () => {
    const token = signUnsubToken("user_abc", "recap");
    expect(verifyUnsubToken(`${token.slice(0, -2)}xx`)).toBeNull();
    expect(verifyUnsubToken("not-a-token")).toBeNull();
    expect(verifyUnsubToken("")).toBeNull();
    expect(verifyUnsubToken(".")).toBeNull();
    const badType = `${Buffer.from("user_abc|newsletter", "utf8").toString("base64url")}.${token.split(".")[1]}`;
    expect(verifyUnsubToken(badType)).toBeNull();
  });

  test("caps token length (no unbounded HMAC input from the public endpoint)", () => {
    expect(verifyUnsubToken(`${"a".repeat(600)}.${"b".repeat(60)}`)).toBeNull();
  });
});
