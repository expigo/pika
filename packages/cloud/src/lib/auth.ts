/**
 * Auth guards — thin middleware over Better Auth sessions (`lib/auth/server.ts`).
 *
 * Replaces the former custom token/cookie auth. Identity is resolved via
 * `auth.api.getSession({ headers })`, which works for both REST (Hono request headers,
 * incl. the bearer plugin for desktop) and the WebSocket handler (via {@link getUserFromToken}).
 */

import type { Context, MiddlewareHandler } from "hono";
import { auth } from "./auth/server";

/** The authenticated user shape (Better Auth user + `role`/`status` fields). */
export type AuthUser = typeof auth.$Infer.Session.user;

// Type the `user` context variable set by the guards across all Hono routers.
declare module "hono" {
  interface ContextVariableMap {
    user: AuthUser;
  }
}

/** Retrieve the user attached by a guard. Only valid downstream of one. */
export function getUser(c: Context): AuthUser {
  return c.get("user");
}

async function resolveUser(c: Context): Promise<AuthUser | null> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (session?.user) return session.user;
  // Fallback: validate the bearer token explicitly (mirrors getUserFromToken). The Tauri desktop
  // sends a valid `Authorization: Bearer` token, but getSession(rawHeaders) can fail to resolve it
  // when other request headers (Origin/cookie) are present — extract + validate it directly so the
  // REST guards accept exactly what the WS handler + sync-fingerprints already do.
  const authHeader = c.req.header("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  return token ? getUserFromToken(token) : null;
}

/** Resolve a user from a raw bearer token (used by the WebSocket REGISTER_SESSION handler). */
export async function getUserFromToken(token: string): Promise<AuthUser | null> {
  const session = await auth.api.getSession({
    headers: new Headers({ Authorization: `Bearer ${token}` }),
  });
  return session?.user ?? null;
}

/**
 * DJ-surface access: approved AND role dj/admin. Pure — unit-testable without a session.
 * A dancer account (Slice B) is auto-approved but must never pass a DJ surface, so the status
 * check alone is NOT sufficient anywhere DJ powers are granted.
 */
export function hasDjAccess(u: {
  role?: string | null | undefined;
  status?: string | null | undefined;
}): "ok" | "unapproved" | "forbidden" {
  if (u.status !== "approved") return "unapproved";
  return u.role === "dj" || u.role === "admin" ? "ok" : "forbidden";
}

/** Require an authenticated, **approved** user with a DJ-capable role (dj or admin). */
export const requireDjAuth: MiddlewareHandler = async (c, next) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ error: "Authentication required" }, 401);
  const access = hasDjAccess(user);
  if (access === "unapproved") return c.json({ error: "Account not approved" }, 403);
  if (access === "forbidden") return c.json({ error: "Forbidden" }, 403);
  c.set("user", user);
  await next();
  return;
};

/**
 * Require ANY authenticated user — role/status-agnostic (401 only). The /api/me journal surface:
 * dancers are auto-approved, and DJs (even pending ones) may have journals too.
 */
export const requireAuth: MiddlewareHandler = async (c, next) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ error: "Authentication required" }, 401);
  c.set("user", user);
  await next();
  return;
};

/**
 * Require a specific `role`. `hideExistence` returns 404 (not 403) on a mismatch so a
 * privileged surface (the admin panel) doesn't leak its existence.
 */
export function requireRole(
  role: string,
  opts: { hideExistence?: boolean } = {},
): MiddlewareHandler {
  return async (c, next) => {
    const user = await resolveUser(c);
    if (!user) return c.json({ error: "Authentication required" }, 401);
    if (user.role !== role) {
      return opts.hideExistence
        ? c.json({ error: "Not found" }, 404)
        : c.json({ error: "Forbidden" }, 403);
    }
    c.set("user", user);
    await next();
    return;
  };
}

/** Admin-only gate. Returns 404 to non-admins (existence not leaked). */
export const requireAdmin = requireRole("admin", { hideExistence: true });
