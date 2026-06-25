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
  status: string; // 'pending' | 'approved' | 'rejected'
  role: string; // 'dj' | 'admin' (extensible: 'organizer' | 'dancer')
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
        role: schema.djUsers.role,
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
    // biome-ignore lint/complexity/useLiteralKeys: process.env requires brackets in strict TS
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

/** Resolve the DJ from the Bearer header (desktop) OR the `pika_session` cookie (web). */
async function resolveDjUser(c: Context): Promise<DjAuthUser | null> {
  const token = bearerFromHeader(c) ?? getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return validateToken(token);
}

/**
 * Hono middleware: authenticate an **approved** DJ (Bearer header or `pika_session`
 * cookie) and attach the user to the context (`getDjUser(c)`). The first reusable
 * DJ-auth middleware — previously each route validated inline.
 */
export const requireDjAuth: MiddlewareHandler = async (c, next) => {
  const user = await resolveDjUser(c);
  if (!user) return c.json({ error: "Authentication required" }, 401);
  if (user.status !== "approved") return c.json({ error: "Account not approved" }, 403);

  c.set("djUser", user);
  await next();
  return; // satisfy the non-Response return path
};

/**
 * Hono middleware factory: require the authenticated user to hold `role`. Attaches the user
 * (`getDjUser(c)`). `hideExistence` returns 404 instead of 403 on a role mismatch so a
 * privileged surface (the admin panel) doesn't leak its existence. Forward-compatible with the
 * coming `organizer`/`dancer` roles.
 */
export function requireRole(
  role: string,
  opts: { hideExistence?: boolean } = {},
): MiddlewareHandler {
  return async (c, next) => {
    const user = await resolveDjUser(c);
    if (!user) return c.json({ error: "Authentication required" }, 401);
    if (user.role !== role) {
      return opts.hideExistence
        ? c.json({ error: "Not found" }, 404)
        : c.json({ error: "Forbidden" }, 403);
    }
    c.set("djUser", user);
    await next();
    return;
  };
}

/** Admin-only gate. Returns 404 to non-admins (existence not leaked). */
export const requireAdmin = requireRole("admin", { hideExistence: true });

/** Retrieve the DJ attached by {@link requireDjAuth}/{@link requireRole}. Only valid downstream. */
export function getDjUser(c: Context): DjAuthUser {
  return c.get("djUser");
}
