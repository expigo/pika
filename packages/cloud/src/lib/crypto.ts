/**
 * Symmetric secret encryption (AES-256-GCM).
 *
 * Used to encrypt the Spotify OAuth **refresh token** at rest (Track D). The token is the
 * crown-jewel secret — it grants access to a DJ's account — so it is never stored in plaintext
 * and never sent to the browser. Authenticated encryption (GCM) also detects tampering.
 *
 * Key: `TOKEN_ENCRYPTION_KEY` env var, a 32-byte key base64-encoded. Generate with:
 *   `openssl rand -base64 32`
 * Treat it like `DATABASE_URL` — losing/rotating it invalidates all stored connections.
 *
 * Wire format (single string, colon-delimited base64): `iv:authTag:ciphertext`.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce, the GCM standard

function getKey(): Buffer {
  const raw = process.env["TOKEN_ENCRYPTION_KEY"];
  if (!raw) {
    throw new Error("TOKEN_ENCRYPTION_KEY is not set (32-byte base64 required for secret storage)");
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(`TOKEN_ENCRYPTION_KEY must decode to 32 bytes, got ${key.length}`);
  }
  return key;
}

/** Encrypt a UTF-8 secret. Returns `iv:authTag:ciphertext` (all base64). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
}

/** Decrypt a payload produced by {@link encryptSecret}. Throws if tampered or malformed. */
export function decryptSecret(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Malformed encrypted payload (expected iv:authTag:ciphertext)");
  }
  const [ivB64, tagB64, dataB64] = parts as [string, string, string];
  const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
