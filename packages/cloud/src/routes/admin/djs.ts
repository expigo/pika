/**
 * Admin DJ management — list, approve/reject (audited), and manual DJ creation.
 * Split (2026-07) from routes/admin.ts, behavior-preserving.
 *
 * Auth: the composer (`../admin.ts`) applies adminLimiter + requireAdmin to every /api/admin
 * route BEFORE the mounts; CSRF (`X-Pika-Client`) is applied at the /api/admin mount in index.ts.
 */

import { logger } from "@pika/shared";
import { desc, eq, isNull, max, ne, or, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import { session, spotifyConnections, user } from "../../db/schema";
import { recordAdminAction } from "../../lib/admin-audit";
import { getUser } from "../../lib/auth";
import { auth } from "../../lib/auth/server";

export const djsRoutes = new Hono();

/** All DJ accounts with approval + Spotify-connection status (pending first). */
djsRoutes.get("/djs", async (c) => {
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      displayName: user.name,
      slug: user.slug,
      status: user.status,
      role: user.role,
      createdAt: user.createdAt,
      lastSeen: max(session.updatedAt), // most recent session activity
      spotifyStatus: spotifyConnections.status,
    })
    .from(user)
    .leftJoin(session, eq(session.userId, user.id))
    .leftJoin(spotifyConnections, eq(spotifyConnections.djUserId, user.id))
    // Slice B: dancer accounts are not DJs — keep them out of the approval queue.
    .where(or(isNull(user.role), ne(user.role, "dancer")))
    .groupBy(user.id, spotifyConnections.status)
    .orderBy(sql`(${user.status} = 'pending') desc`, desc(user.createdAt));
  return c.json({ djs: rows });
});

async function setDjStatus(c: Context, status: "approved" | "rejected", action: string) {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "Invalid id" }, 400);

  const [updated] = await db
    .update(user)
    .set({ status })
    .where(eq(user.id, id))
    .returning({ id: user.id });
  if (!updated) return c.json({ error: "DJ not found" }, 404);

  recordAdminAction(getUser(c).id, action, { type: "user", id });
  return c.json({ success: true });
}

djsRoutes.post("/djs/:id/approve", (c) => setDjStatus(c, "approved", "dj.approve"));
djsRoutes.post("/djs/:id/reject", (c) => setDjStatus(c, "rejected", "dj.reject"));

const CreateDjBody = z.object({
  email: z.string().trim().email().max(200),
  displayName: z.string().trim().min(1).max(100),
  password: z.string().min(8).max(200),
});

/**
 * Create a DJ account as an admin — via Better Auth's admin-plugin `createUser`, which does NOT
 * establish a session for the new user, so the admin stays logged in (unlike public sign-up). The
 * account is created `approved` (the admin vouched for it). Passing the admin's headers lets Better
 * Auth verify the `user:create` permission.
 */
djsRoutes.post("/djs", async (c) => {
  const parsed = CreateDjBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid DJ", issues: parsed.error.issues }, 400);
  const { email, displayName, password } = parsed.data;
  try {
    const res = await auth.api.createUser({
      body: { email, password, name: displayName, role: "dj" },
      headers: c.req.raw.headers,
    });
    // Guarantee the approval status regardless of the additionalField input rules.
    await db.update(user).set({ status: "approved" }).where(eq(user.id, res.user.id));
    recordAdminAction(getUser(c).id, "dj.create", { type: "user", id: res.user.id });
    return c.json({ success: true, id: res.user.id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    logger.warn("admin: createUser failed", { msg });
    return c.json(
      {
        error: /exist/i.test(msg) ? "A user with that email already exists" : "Failed to create DJ",
      },
      409,
    );
  }
});
