/**
 * Access-control roles for the Better Auth admin plugin.
 *
 * Roles: `dj` (default — no admin capabilities), `admin` (full admin-plugin permissions), and
 * `dancer` (Slice B — journal accounts; auto-approved, zero DJ/admin capabilities). Extensible to
 * `organizer` later. Our own route guards only check `user.role`, so the fine-grained permission
 * API isn't used yet — this just registers the role names + admin caps.
 */

import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

export const ac = createAccessControl({ ...defaultStatements });

/** Ordinary DJ — no admin capabilities. */
export const dj = ac.newRole({});

/** Full admin — all default admin-plugin permissions (user management, etc.). */
export const admin = ac.newRole({ ...adminAc.statements });

/** Dancer (journal account) — no capabilities; every DJ/admin surface treats it as an outsider. */
export const dancer = ac.newRole({});
