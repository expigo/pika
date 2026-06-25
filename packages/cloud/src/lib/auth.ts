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
  return session?.user ?? null;
}

/** Resolve a user from a raw bearer token (used by the WebSocket REGISTER_SESSION handler). */
export async function getUserFromToken(token: string): Promise<AuthUser | null> {
  const session = await auth.api.getSession({
    headers: new Headers({ Authorization: `Bearer ${token}` }),
  });
  return session?.user ?? null;
}

/** Require an authenticated, **approved** user (DJ or admin). */
export const requireDjAuth: MiddlewareHandler = async (c, next) => {
  const user = await resolveUser(c);
  if (!user) return c.json({ error: "Authentication required" }, 401);
  if (user.status !== "approved") return c.json({ error: "Account not approved" }, 403);
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
