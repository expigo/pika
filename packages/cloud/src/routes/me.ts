/**
 * /api/me — the authenticated dancer/DJ account surface (Slice B).
 *
 * Everything here requires ONLY authentication (`requireAuth`, 401-only): dancers are
 * auto-approved and DJs may have journals too. State-changing routes additionally pass the
 * X-Pika-Client CSRF check applied at mount in index.ts.
 *
 *   POST   /api/me/journal/claim          → claim this device's clientId for the account
 *   GET    /api/me/journal                → union journal across claimed ids (de-duped)
 *   DELETE /api/me/journal/likes/:likeId  → account-scoped unlike (all claimed rows of the play)
 *   POST   /api/me/journal/playlist       → export/regenerate the account playlist (adopt-first)
 *   PUT    /api/me/follows/:slug          → follow a DJ (account-keyed edge; Slice C)
 *   DELETE /api/me/follows/:slug          → unfollow
 *   GET    /api/me/follows                → "Your DJs" list (+ each DJ's next gig)
 *   GET    /api/me/preferences            → marketing-email consents (recap / DJ digest)
 *   PUT    /api/me/preferences            → explicit consent writes (timestamps = GDPR proof)
 *
 * Composed (2026-07) from `./me/` submodules — journal.ts (Slice B) + relationship.ts
 * (Slices C/D; one file so they keep sharing the single relationshipLimiter budget).
 * Behavior-preserving: every path + method is unchanged, and the `requireAuth` guard lives
 * HERE, registered before the mounts, so every mounted route inherits it regardless of
 * submodule order.
 */

import { Hono } from "hono";
import { requireAuth } from "../lib/auth";
import { journalRoutes } from "./me/journal";
import { relationshipRoutes } from "./me/relationship";

const me = new Hono();

me.use("*", requireAuth);

me.route("/", journalRoutes);
me.route("/", relationshipRoutes);

export { me as meRoutes };
