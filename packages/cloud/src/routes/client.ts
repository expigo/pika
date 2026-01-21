/**
 * Client Routes
 *
 * Handles client (dancer) API endpoints:
 * - GET /:clientId/likes - Get all likes for a specific client
 *
 * Extracted from index.ts for modularity.
 */
import { Hono } from "hono";
import { desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "../db";

const client = new Hono();

/**
 * GET /:clientId/likes
 * Get all likes for a specific client.
 * Returns likes grouped by session with DJ info.
 */
client.get("/:clientId/likes", async (c) => {
  const clientId = c.req.param("clientId");

  // Basic validation: client IDs have a specific format
  if (!clientId || !clientId.startsWith("client_")) {
    return c.json({ error: "Invalid client ID" }, 400);
  }

  try {
    console.log(`🔍 Fetching likes for client: ${clientId}`);
    // Get all likes for this client, ordered by most recent first
    const likes = await db
      .select({
        id: schema.likes.id,
        sessionId: schema.likes.sessionId,
        artist: schema.playedTracks.artist,
        title: schema.playedTracks.title,
        likedAt: schema.likes.createdAt,
      })
      .from(schema.likes)
      .innerJoin(schema.playedTracks, eq(schema.likes.playedTrackId, schema.playedTracks.id))
      .where(eq(schema.likes.clientId, clientId))
      .orderBy(desc(schema.likes.createdAt))
      .limit(100); // Reasonable limit

    // Get session info for each unique session in a single batch
    const sessionIds = [...new Set(likes.map((l) => l.sessionId).filter(Boolean))];
    const sessionsMap = new Map<string, { djName: string; startedAt: Date | null }>();

    console.log(`📊 Found ${likes.length} likes, unique sessions: ${sessionIds.length}`);

    if (sessionIds.length > 0) {
      console.log(`📦 Batch fetching sessions: ${sessionIds.join(", ")}`);
      const sessions = await db
        .select({
          id: schema.sessions.id,
          djName: schema.sessions.djName,
          startedAt: schema.sessions.startedAt,
        })
        .from(schema.sessions)
        .where(inArray(schema.sessions.id, sessionIds as string[]));

      for (const session of sessions) {
        sessionsMap.set(session.id, session);
      }
      console.log(`✅ Fetched ${sessions.length} session metadata records`);
    }

    // Enrich likes with session info
    const enrichedLikes = likes.map((like) => {
      if (like.sessionId) {
        const sessionInfo = sessionsMap.get(like.sessionId);
        if (sessionInfo) {
          return {
            ...like,
            djName: sessionInfo.djName,
            sessionDate: sessionInfo.startedAt,
          };
        }
      }
      return {
        ...like,
        djName: null,
        sessionDate: null,
      };
    });

    return c.json({
      clientId,
      totalLikes: enrichedLikes.length,
      likes: enrichedLikes,
    });
  } catch (error) {
    console.error("Failed to fetch client likes:", error);
    return c.json({ error: "Failed to fetch likes" }, 500);
  }
});

export { client };
