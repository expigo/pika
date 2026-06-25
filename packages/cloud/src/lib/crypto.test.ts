import { beforeAll, describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { decryptSecret, encryptSecret } from "./crypto";

beforeAll(() => {
  // Deterministic 32-byte test key (base64) so the suite is self-contained.
  process.env["TOKEN_ENCRYPTION_KEY"] = randomBytes(32).toString("base64");
});

describe("crypto (AES-256-GCM secret storage)", () => {
  test("round-trips a secret", () => {
    const secret = "AQA-spotify-refresh-token-xyz_123";
    expect(decryptSecret(encryptSecret(secret))).toBe(secret);
  });

  test("round-trips unicode + empty string", () => {
    for (const s of ["", "café ☕ 日本語", "a".repeat(2000)]) {
      expect(decryptSecret(encryptSecret(s))).toBe(s);
    }
  });

  test("produces a fresh IV each call (ciphertext differs for same input)", () => {
    expect(encryptSecret("same")).not.toBe(encryptSecret("same"));
  });

  test("rejects a tampered ciphertext (auth tag)", () => {
    const [iv, tag, data] = encryptSecret("secret").split(":") as [string, string, string];
    const flipped = Buffer.from(data, "base64");
    flipped[0] = (flipped[0] ?? 0) ^ 0xff;
    const tampered = `${iv}:${tag}:${flipped.toString("base64")}`;
    expect(() => decryptSecret(tampered)).toThrow();
  });

  test("rejects malformed payloads", () => {
    expect(() => decryptSecret("not-a-valid-payload")).toThrow(/Malformed/);
  });

  test("fails when decrypting with a different key", () => {
    const enc = encryptSecret("secret");
    process.env["TOKEN_ENCRYPTION_KEY"] = randomBytes(32).toString("base64");
    expect(() => decryptSecret(enc)).toThrow();
  });

  test("rejects a key that is not 32 bytes", () => {
    const good = process.env["TOKEN_ENCRYPTION_KEY"];
    process.env["TOKEN_ENCRYPTION_KEY"] = Buffer.from("short").toString("base64");
    expect(() => encryptSecret("x")).toThrow(/32 bytes/);
    process.env["TOKEN_ENCRYPTION_KEY"] = good;
  });
});
