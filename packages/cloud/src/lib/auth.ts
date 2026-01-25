/**
 * Authentication Utilities
 *
 * Helper functions for DJ authentication
 */

import { eq } from "drizzle-orm";
import { db } from "../db";
import * as schema from "../db/schema";
import { logger } from "@pika/shared";

/**
 * Generate secure random token
 */
export function generateToken(): string {
  return `pk_dj_${crypto.randomUUID().replace(/-/g, "")}`;
}

/**
 * Hash password using Bun's built-in bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return await Bun.password.hash(password, {
    algorithm: "bcrypt",
    cost: 10,
  });
}

/**
 * Hash token for storage (fast SHA-256 for API tokens)
 * We use SHA-256 because API tokens are already high-entropy.
 * Bcrypt is too slow (100ms) for high-frequency API auth.
 */
export async function hashToken(token: string): Promise<string> {
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(token);
  return hash.digest("hex");
}

/**
 * Verify password against hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return await Bun.password.verify(password, hash);
}

/**
 * Validate token and return DJ user
 */
export async function validateToken(
  token: string,
): Promise<{ id: number; displayName: string; email: string; slug: string } | null> {
  try {
    // Hash the incoming token to look it up in DB
    const tokenHash = await hashToken(token);

    const result = await db
      .select({
        id: schema.djUsers.id,
        displayName: schema.djUsers.displayName,
        email: schema.djUsers.email,
        slug: schema.djUsers.slug,
      })
      .from(schema.djTokens)
      .innerJoin(schema.djUsers, eq(schema.djTokens.djUserId, schema.djUsers.id))
      .where(eq(schema.djTokens.token, tokenHash))
      .limit(1);

    if (result.length === 0) return null;

    const user = result[0];
    if (!user) return null;

    // Update last used timestamp (fire-and-forget)
    db.update(schema.djTokens)
      .set({ lastUsed: new Date() })
      .where(eq(schema.djTokens.token, tokenHash))
      .catch(() => {});

    return user;
  } catch (e) {
    logger.error("Token validation error", e);
    return null;
  }
}
