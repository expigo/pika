/**
 * Marketing-email consent helpers (Slice C) — unsubscribe tokens + consent clearing.
 *
 * Token = base64url(userId|type) + "." + base64url(HMAC-SHA256(BETTER_AUTH_SECRET,
 * "pika-unsub-v1:" + payload)). Deliberately WITHOUT expiry: the token's only power is turning
 * one email type OFF for one account — a permanently valid opt-out link is the desired property
 * (RFC 8058 one-click unsubscribe must keep working from months-old emails).
 */

import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../../db";
import { emailPreferences } from "../../db/schema";

export type UnsubType = "recap" | "digest";

function hmacSecret(): string {
  const s = process.env["BETTER_AUTH_SECRET"];
  if (!s) throw new Error("BETTER_AUTH_SECRET is required to sign unsubscribe tokens");
  return s;
}

function signature(payload: string): Buffer {
  return createHmac("sha256", hmacSecret()).update(`pika-unsub-v1:${payload}`).digest();
}

export function signUnsubToken(userId: string, type: UnsubType): string {
  const payload = `${userId}|${type}`;
  const body = Buffer.from(payload, "utf8").toString("base64url");
  return `${body}.${signature(payload).toString("base64url")}`;
}

/** Constant-time verify. Returns null for anything malformed, tampered, or of unknown type. */
export function verifyUnsubToken(token: string): { userId: string; type: UnsubType } | null {
  const dot = token.indexOf(".");
  if (dot <= 0 || dot === token.length - 1 || token.length > 512) return null;
  const payload = Buffer.from(token.slice(0, dot), "base64url").toString("utf8");
  const [userId, type] = payload.split("|");
  if (!userId || (type !== "recap" && type !== "digest")) return null;
  const expected = signature(payload);
  const given = Buffer.from(token.slice(dot + 1), "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return { userId, type };
}

/** Idempotently clear one consent (the unsubscribe target). Unknown users are a no-op. */
export async function clearEmailConsent(userId: string, type: UnsubType): Promise<void> {
  await db
    .update(emailPreferences)
    .set(
      type === "recap"
        ? { recapOptInAt: null, updatedAt: new Date() }
        : { digestOptInAt: null, updatedAt: new Date() },
    )
    .where(eq(emailPreferences.userId, userId));
}
