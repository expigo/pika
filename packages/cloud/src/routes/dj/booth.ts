/**
 * Authed Booth management (Slice C) — `/api/dj/me/booth` + `/api/dj/me/gigs*`.
 *
 * Bio, the public follower-count / signature toggles, and upcoming-gig CRUD. Ownership is in the
 * WHERE; CSRF at the mount. The owner ALWAYS sees their own follower count + Signature preview
 * (the toggles only gate the PUBLIC slug payload in profile.ts).
 */

import { and, asc, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db, schema } from "../../db";
import { getUser, requireDjAuth } from "../../lib/auth";
import { invalidateCache } from "../../lib/cache";
import { computeSignatureWithProgress } from "../../lib/services/signature";
import { MAX_DJ_GIGS } from "./constants";

export const boothRoutes = new Hono();

/** My Booth content for the editor: bio, toggles, ALL gigs (incl. past), own follower count,
 * and the private Signature preview (computed regardless of the public toggle — the DJ sees
 * the card before dancers do) plus its floors progress. Progress is OWNER-ONLY: it must never
 * enter the slug-cached public payload (below-floors numbers don't ship publicly). */
boothRoutes.get("/me/booth", requireDjAuth, async (c) => {
  const me = getUser(c);
  const [[row], gigs, [tally], signatureWithProgress] = await Promise.all([
    db
      .select({
        bio: schema.user.bio,
        showFollowerCount: schema.user.showFollowerCount,
        showSignature: schema.user.showSignature,
      })
      .from(schema.user)
      .where(eq(schema.user.id, me.id))
      .limit(1),
    db
      .select({
        id: schema.djGigs.id,
        date: schema.djGigs.gigDate,
        title: schema.djGigs.title,
        city: schema.djGigs.city,
        url: schema.djGigs.url,
      })
      .from(schema.djGigs)
      .where(eq(schema.djGigs.djUserId, me.id))
      .orderBy(asc(schema.djGigs.gigDate)),
    db.select({ n: count() }).from(schema.djFollows).where(eq(schema.djFollows.djUserId, me.id)),
    computeSignatureWithProgress(me.id),
  ]);
  return c.json({
    bio: row?.bio ?? null,
    showFollowerCount: row?.showFollowerCount ?? false,
    showSignature: row?.showSignature ?? true,
    // The owner ALWAYS sees their count; the toggle only gates the public payload.
    followerCount: tally?.n ?? 0,
    gigs,
    signaturePreview: signatureWithProgress.signature,
    signatureProgress: signatureWithProgress.progress,
  });
});

const BoothBody = z
  .object({
    bio: z.string().trim().max(500).optional(),
    showFollowerCount: z.boolean().optional(),
    showSignature: z.boolean().optional(),
  })
  .refine(
    (b) =>
      b.bio !== undefined || b.showFollowerCount !== undefined || b.showSignature !== undefined,
    { message: "Nothing to update" },
  );

/** Update my Booth (bio and/or the public toggles). Plain text only. */
boothRoutes.patch("/me/booth", requireDjAuth, async (c) => {
  const me = getUser(c);
  const parsed = BoothBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);
  const set: { bio?: string | null; showFollowerCount?: boolean; showSignature?: boolean } = {};
  if (parsed.data.bio !== undefined) set.bio = parsed.data.bio.length > 0 ? parsed.data.bio : null;
  if (parsed.data.showFollowerCount !== undefined)
    set.showFollowerCount = parsed.data.showFollowerCount;
  if (parsed.data.showSignature !== undefined) set.showSignature = parsed.data.showSignature;
  await db.update(schema.user).set(set).where(eq(schema.user.id, me.id));
  if (me.slug) invalidateCache(`dj-profile:${me.slug}`);
  return c.json({ success: true });
});

const GigBody = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date"),
  title: z.string().trim().min(1).max(120),
  city: z.string().trim().max(80).optional(),
  // Bare domains ("budafest.com") get an https:// prefix so DJs don't have to type it; anything
  // already carrying a scheme is left as-is, so a non-web scheme (javascript:, data:) still fails
  // the http(s) regex rather than being silently rewritten into a valid-looking link.
  url: z.preprocess(
    (v) => {
      if (typeof v !== "string") return v;
      const t = v.trim();
      if (t === "") return undefined;
      if (/^https?:\/\//i.test(t)) return t;
      if (/^[a-z][a-z0-9+.-]*:/i.test(t)) return t; // has some other scheme → keep, regex rejects it
      return `https://${t}`;
    },
    z
      .string()
      .max(300)
      .regex(/^https?:\/\//i, "Enter a valid web address")
      .optional(),
  ),
});

/** Add an upcoming gig to my Booth ("I'll be at Budafest, Jan 15"). */
boothRoutes.post("/me/gigs", requireDjAuth, async (c) => {
  const me = getUser(c);
  const parsed = GigBody.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success)
    return c.json({ error: parsed.error.issues[0]?.message ?? "Invalid body" }, 400);

  const [tally] = await db
    .select({ n: count() })
    .from(schema.djGigs)
    .where(eq(schema.djGigs.djUserId, me.id));
  if ((tally?.n ?? 0) >= MAX_DJ_GIGS) return c.json({ error: "Gig limit reached" }, 409);

  const [gig] = await db
    .insert(schema.djGigs)
    .values({
      djUserId: me.id,
      gigDate: parsed.data.date,
      title: parsed.data.title,
      city: parsed.data.city?.length ? parsed.data.city : null,
      url: parsed.data.url?.length ? parsed.data.url : null,
    })
    .returning({ id: schema.djGigs.id });
  if (me.slug) invalidateCache(`dj-profile:${me.slug}`);
  return c.json({ success: true, id: gig?.id });
});

/** Remove one of my gigs. Ownership lives in the WHERE (not-found == not-yours). */
boothRoutes.delete("/me/gigs/:id", requireDjAuth, async (c) => {
  const me = getUser(c);
  const gid = Number(c.req.param("id"));
  if (!Number.isInteger(gid)) return c.json({ error: "Invalid id" }, 400);
  const deleted = await db
    .delete(schema.djGigs)
    .where(and(eq(schema.djGigs.id, gid), eq(schema.djGigs.djUserId, me.id)))
    .returning({ id: schema.djGigs.id });
  if (deleted.length === 0) return c.json({ error: "Gig not found" }, 404);
  if (me.slug) invalidateCache(`dj-profile:${me.slug}`);
  return c.json({ success: true });
});
