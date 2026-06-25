/**
 * Access-control roles for the Better Auth admin plugin.
 *
 * V1 roles: `dj` (default — no admin capabilities) and `admin` (full admin-plugin permissions).
 * Extensible to `organizer`/`dancer` later. Our own route guards only check `user.role`, so the
 * fine-grained permission API isn't used yet — this just registers the role names + admin caps.
 */

import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

export const ac = createAccessControl({ ...defaultStatements });

/** Ordinary DJ — no admin capabilities. */
export const dj = ac.newRole({});

/** Full admin — all default admin-plugin permissions (user management, etc.). */
export const admin = ac.newRole({ ...adminAc.statements });
