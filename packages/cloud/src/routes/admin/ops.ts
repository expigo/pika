/**
 * Admin ops triggers — manual recap sweep + playlist-title backfill (audited).
 * Split (2026-07) from routes/admin.ts, behavior-preserving.
 *
 * Auth: the composer (`../admin.ts`) applies adminLimiter + requireAdmin to every /api/admin
 * route BEFORE the mounts; CSRF (`X-Pika-Client`) is applied at the /api/admin mount in index.ts.
 */

import { and, eq, inArray, isNotNull, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../../db";
import { djPlaylists, user } from "../../db/schema";
import { recordAdminAction } from "../../lib/admin-audit";
import { getUser } from "../../lib/auth";
import { invalidateCache } from "../../lib/cache";
import { sweepRecaps } from "../../lib/services/recap";
import { fetchSpotifyOembedTitle } from "../../lib/services/spotifyOembed";

export const opsRoutes = new Hono();

/**
 * POST /api/admin/recap/sweep — run one Night-Recap sweep tick on demand, bypassing the
 * send-window gate (zombie-close + claims + sends). Makes the staging smoke deterministic.
 */
opsRoutes.post("/recap/sweep", async (c) => {
  const result = await sweepRecaps(undefined, { ignoreWindow: true });
  recordAdminAction(getUser(c).id, "recap.sweep", undefined, result);
  return c.json({ success: true, ...result });
});

const BackfillTitlesBody = z.object({ limit: z.number().int().min(1).max(200).optional() });

/**
 * POST /api/admin/playlists/backfill-titles — fill oEmbed titles onto pre-D.1 embed rows
 * (title IS NULL). Sequential + bounded per call; idempotent — re-run until scanned = 0.
 */
opsRoutes.post("/playlists/backfill-titles", async (c) => {
  const parsed = BackfillTitlesBody.safeParse(await c.req.json().catch(() => ({})));
  const limit = parsed.success ? (parsed.data.limit ?? 100) : 100;

  const rows = await db
    .select({
      id: djPlaylists.id,
      spotifyPlaylistId: djPlaylists.spotifyPlaylistId,
      djUserId: djPlaylists.djUserId,
    })
    .from(djPlaylists)
    .where(and(isNull(djPlaylists.title), isNotNull(djPlaylists.spotifyPlaylistId)))
    .limit(limit);

  let updated = 0;
  const affectedDjIds = new Set<string>();
  for (const row of rows) {
    if (!row.spotifyPlaylistId) continue;
    const title = await fetchSpotifyOembedTitle(row.spotifyPlaylistId);
    if (!title) continue;
    await db.update(djPlaylists).set({ title }).where(eq(djPlaylists.id, row.id));
    updated++;
    affectedDjIds.add(row.djUserId);
  }

  if (affectedDjIds.size > 0) {
    const slugRows = await db
      .select({ slug: user.slug })
      .from(user)
      .where(inArray(user.id, [...affectedDjIds]));
    for (const r of slugRows) if (r.slug) invalidateCache(`dj-profile:${r.slug}`);
  }

  const result = { scanned: rows.length, updated, failed: rows.length - updated };
  recordAdminAction(getUser(c).id, "playlists.backfillTitles", undefined, result);
  return c.json({ success: true, ...result });
});
