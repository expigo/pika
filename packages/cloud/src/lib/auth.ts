/**
 * Authentication Utilities
 *
 * Helper functions for DJ authentication
 */

import { logger } from "@pika/shared";
import { eq } from "drizzle-orm";
import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { db } from "../db";
import * as schema from "../db/schema";

/** Authenticated DJ resolved from a token (Bearer header or session cookie). */
export interface DjAuthUser {
  id: number;
  displayName: string;
  email: string;
  slug: string;
  status: string; // 'pending' | 'approved'
}

// Type the `djUser` context variable set by requireDjAuth across all Hono routers.
declare module "hono" {
  interface ContextVariableMap {
    djUser: DjAuthUser;
  }
}

/** httpOnly session cookie carrying the DJ's API token (web BFF, never readable by JS). */
export const SESSION_COOKIE = "pika_session";
const SESSION_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

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
 * Validate token and return DJ user (including approval status).
 */
export async function validateToken(token: string): Promise<DjAuthUser | null> {
  try {
    // Hash the incoming token to look it up in DB
    const tokenHash = await hashToken(token);

    const result = await db
      .select({
        id: schema.djUsers.id,
        displayName: schema.djUsers.displayName,
        email: schema.djUsers.email,
        slug: schema.djUsers.slug,
        status: schema.djUsers.status,
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

// ============================================================================
// Web session (httpOnly cookie) + auth middleware  (Track D)
// ============================================================================

/** Set the httpOnly session cookie after a successful web login. */
export function setSessionCookie(c: Context, token: string): void {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env["NODE_ENV"] === "production",
    sameSite: "Lax", // pika.stream ↔ api.pika.stream are same-site (shared registrable domain)
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

/** Clear the session cookie (logout). */
export function clearSessionCookie(c: Context): void {
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Read the bearer token from the Authorization header, if present. */
function bearerFromHeader(c: Context): string | undefined {
  const header = c.req.header("Authorization");
  return header?.startsWith("Bearer ") ? header.substring(7) : undefined;
}

/**
 * Hono middleware: authenticate a DJ from the Bearer header (desktop) OR the
 * `pika_session` cookie (web), reject unapproved accounts, and attach the user
 * to the context (`getDjUser(c)`). The first reusable DJ-auth middleware —
 * previously each route validated inline.
 */
export const requireDjAuth: MiddlewareHandler = async (c, next) => {
  const token = bearerFromHeader(c) ?? getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "Authentication required" }, 401);

  const user = await validateToken(token);
  if (!user) return c.json({ error: "Invalid or expired session" }, 401);
  if (user.status === "pending") return c.json({ error: "Account awaiting approval" }, 403);

  c.set("djUser", user);
  await next();
  return; // satisfy the non-Response return path
};

/** Retrieve the DJ attached by {@link requireDjAuth}. Only valid downstream of it. */
export function getDjUser(c: Context): DjAuthUser {
  return c.get("djUser");
}
