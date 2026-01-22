/**
 * Session Routes
 *
 * Handles all session-related REST API endpoints:
 * - GET /sessions - List active sessions
 * - GET /active - Active sessions for landing page
 * - GET /:sessionId/history - Track history
 * - GET /:sessionId/recap - Full session recap
 * - GET /recent - Recent completed sessions
 * - POST /:sessionId/sync-fingerprints - Sync analysis data
 *
 * Extracted from index.ts for modularity.
 */
import { Hono } from "hono";
import { and, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { db, schema } from "../db";
import { getAllSessions } from "../lib/sessions";
import { getListenerCount } from "../lib/listeners";
import { withCache } from "../lib/cache";
import { validateToken } from "../lib/auth";

const sessions = new Hono();

// ============================================================================
// Active Sessions
// ============================================================================

/**
 * GET /sessions
 * Get all active sessions (simple list)
 */
sessions.get("/", (c) => {
  const sessionsList = getAllSessions();
  return c.json(sessionsList);
});

/**
 * GET /active
 * Get active sessions for landing page (lightweight check, no WebSocket needed)
 */
sessions.get("/active", (c) => {
  try {
    const sessionsList = getAllSessions();

    if (sessionsList.length === 0) {
      return c.json({
        live: false,
        sessions: [],
      });
    }

    // Return active sessions with basic info
    const activeSummary = sessionsList.map((session) => ({
      sessionId: session.sessionId,
      djName: session.djName,
      startedAt: session.startedAt,
      currentTrack: session.currentTrack
        ? {
            title: session.currentTrack.title,
            artist: session.currentTrack.artist,
            bpm: session.currentTrack.bpm,
          }
        : null,
      listenerCount: getListenerCount(session.sessionId),
      // Calculate Vibe Momentum (0.0 to 1.0)
      // Formula: (Listeners * 0.4) + (RecentLikes * 0.6) - normalized
      momentum: Math.min(
        1,
        getListenerCount(session.sessionId) * 0.05 + 0, // RecentLikes removed (was broken/encapsulated)
      ),
    }));

    return c.json({
      live: true,
      count: sessionsList.length,
      sessions: activeSummary,
    });
  } catch (e) {
    console.error("Failed to fetch active sessions:", e);
    return c.json({ error: "Internal Server Error" }, 500);
  }
});

/**
 * GET /recent
 * Get recent completed sessions
 */
sessions.get("/recent", async (c) => {
  try {
    const recentSessions = await withCache("recent-sessions", 5 * 60 * 1000, async () => {
      return await db
        .select({
          id: schema.sessions.id,
          djName: schema.sessions.djName,
          startedAt: schema.sessions.startedAt,
          endedAt: schema.sessions.endedAt,
        })
        .from(schema.sessions)
        .where(isNotNull(schema.sessions.endedAt))
        .orderBy(desc(schema.sessions.endedAt))
        .limit(5);
    });

    return c.json(recentSessions);
  } catch (e) {
    console.error("Failed to fetch recent sessions:", e);
    return c.json([], 500);
  }
});

// ============================================================================
// Session Details
// ============================================================================

/**
 * GET /:sessionId/history
 * Get session track history (last 5 tracks)
 */
sessions.get("/:sessionId/history", async (c) => {
  const sessionId = c.req.param("sessionId");

  try {
    const tracks = await db
      .select({
        id: schema.playedTracks.id,
        artist: schema.playedTracks.artist,
        title: schema.playedTracks.title,
        playedAt: schema.playedTracks.playedAt,
      })
      .from(schema.playedTracks)
      .where(eq(schema.playedTracks.sessionId, sessionId))
      .orderBy(desc(schema.playedTracks.playedAt))
      .limit(5);

    return c.json(tracks);
  } catch (e) {
    console.error("Failed to fetch history:", e);
    return c.json([], 500);
  }
});

/**
 * GET /:sessionId/recap
 * Get full session recap (all tracks + metadata)
 */
sessions.get("/:sessionId/recap", async (c) => {
  const sessionId = c.req.param("sessionId");

  try {
    // Get session metadata from database (activeSessions is cleared when session ends)
    const sessionData = await db
      .select({
        id: schema.sessions.id,
        djUserId: schema.sessions.djUserId,
        djName: schema.sessions.djName,
        startedAt: schema.sessions.startedAt,
        endedAt: schema.sessions.endedAt,
      })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sessionId))
      .limit(1);

    const dbSession = sessionData[0];

    // Get all tracks for this session (including fingerprint for analytics)
    const tracks = await db
      .select({
        id: schema.playedTracks.id,
        artist: schema.playedTracks.artist,
        title: schema.playedTracks.title,
        bpm: schema.playedTracks.bpm,
        key: schema.playedTracks.key,
        energy: schema.playedTracks.energy,
        danceability: schema.playedTracks.danceability,
        brightness: schema.playedTracks.brightness,
        acousticness: schema.playedTracks.acousticness,
        groove: schema.playedTracks.groove,
        playedAt: schema.playedTracks.playedAt,
      })
      .from(schema.playedTracks)
      .where(eq(schema.playedTracks.sessionId, sessionId))
      .orderBy(schema.playedTracks.playedAt)
      .limit(500); // 🛡️ S1.1.4: Limit cap for safety

    if (!dbSession) {
      console.log(`📭 Recap not found for session: ${sessionId} (session not in DB)`);
      return c.json({ error: "Session not found" }, 404);
    }

    // Get total likes count for this session
    const likesResult = await db
      .select({ count: count() })
      .from(schema.likes)
      .where(eq(schema.likes.sessionId, sessionId));

    const totalLikes = likesResult[0]?.count || 0;

    // Get per-track like counts (Batched query to avoid N+1)
    const trackLikesData = await db
      .select({
        playedTrackId: schema.likes.playedTrackId,
        count: count(),
      })
      .from(schema.likes)
      .where(eq(schema.likes.sessionId, sessionId))
      .groupBy(schema.likes.playedTrackId);

    const trackLikeCounts = new Map<number, number>();
    for (const item of trackLikesData) {
      if (item.playedTrackId) {
        trackLikeCounts.set(item.playedTrackId, item.count);
      }
    }

    // Get per-track tempo votes
    const tempoVotesData = await db
      .select({
        trackArtist: schema.tempoVotes.trackArtist,
        trackTitle: schema.tempoVotes.trackTitle,
        slowerCount: schema.tempoVotes.slowerCount,
        perfectCount: schema.tempoVotes.perfectCount,
        fasterCount: schema.tempoVotes.fasterCount,
      })
      .from(schema.tempoVotes)
      .where(eq(schema.tempoVotes.sessionId, sessionId));

    const trackTempoVotes = new Map<string, { slower: number; perfect: number; faster: number }>();
    for (const tv of tempoVotesData) {
      trackTempoVotes.set(`${tv.trackArtist}:${tv.trackTitle}`, {
        slower: tv.slowerCount,
        perfect: tv.perfectCount,
        faster: tv.fasterCount,
      });
    }

    // Verify auth token (Conditional Access)
    // If DJ is authenticated, they get full data including polls/votes.
    // If Public/Unauthenticated, they get track list but NO poll data (privacy).
    const authHeader = c.req.header("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    let isAuthenticated = false;

    if (token) {
      const user = await validateToken(token);
      // Only allow if this user OWNS the session or is an admin?
      // For now, simpler check: is a valid DJ.
      // Ideally we check user.id === dbSession.djUserId, but dbSession might be null if not loaded yet.
      // We'll check ownership after loading session.
      if (user) {
        // Enforce ownership: Authenticated user must equal the session creator
        if (dbSession.djUserId === user.id) {
          isAuthenticated = true;
        }
      }
    }

    // Get polls for this session (only if authenticated)
    let pollsWithResults: any[] = [];
    if (isAuthenticated) {
      const pollsData = await db
        .select({
          id: schema.polls.id,
          question: schema.polls.question,
          options: schema.polls.options,
          status: schema.polls.status,
          startedAt: schema.polls.startedAt,
          endedAt: schema.polls.endedAt,
          currentTrackArtist: schema.polls.currentTrackArtist,
          currentTrackTitle: schema.polls.currentTrackTitle,
        })
        .from(schema.polls)
        .where(eq(schema.polls.sessionId, sessionId));

      // Get vote counts for each poll
      pollsWithResults = await Promise.all(
        pollsData.map(async (poll) => {
          const votes = await db
            .select({
              optionIndex: schema.pollVotes.optionIndex,
              count: count(),
            })
            .from(schema.pollVotes)
            .where(eq(schema.pollVotes.pollId, poll.id))
            .groupBy(schema.pollVotes.optionIndex);

          const options = poll.options as string[];
          const voteCounts = new Array(options.length).fill(0) as number[];

          for (const v of votes) {
            if (v.optionIndex >= 0 && v.optionIndex < voteCounts.length) {
              voteCounts[v.optionIndex] = v.count;
            }
          }

          const totalVotes = voteCounts.reduce((a, b) => a + b, 0);
          const winnerIndex = totalVotes > 0 ? voteCounts.indexOf(Math.max(...voteCounts)) : -1;

          return {
            id: poll.id,
            question: poll.question,
            options,
            votes: voteCounts,
            totalVotes,
            winnerIndex,
            winner: winnerIndex >= 0 ? options[winnerIndex] : null,
            startedAt: poll.startedAt,
            endedAt: poll.endedAt,
            // Track context: what was playing when poll was created
            currentTrack:
              poll.currentTrackArtist && poll.currentTrackTitle
                ? { artist: poll.currentTrackArtist, title: poll.currentTrackTitle }
                : null,
          };
        }),
      );
    }

    // Calculate session stats
    const lastTrack = tracks[tracks.length - 1];
    const startTime = dbSession.startedAt;

    // Calculate effective end time to prevent "zombie sessions" (forgotten open sessions)
    // If session is ended in DB, use that.
    // If not ended: use last track time + 5 minutes (padding).
    // Fallback to current time only if no tracks exist.
    let endTime: Date;
    if (dbSession.endedAt) {
      endTime = dbSession.endedAt;
    } else if (lastTrack) {
      // For active/forgotten sessions:
      // Cap duration at 5 mins after last track start to handle forgotten sessions.
      // But if current time is BEFORE that cap (i.e. truly active), use current time.
      const cap = new Date(new Date(lastTrack.playedAt).getTime() + 5 * 60 * 1000);
      const now = new Date();
      endTime = now < cap ? now : cap;
    } else {
      endTime = new Date();
    }

    // Response object
    const response: any = {
      sessionId,
      djName: dbSession?.djName || "DJ",
      startedAt: startTime?.toISOString(),
      endedAt: endTime?.toISOString(),
      trackCount: tracks.length,
      totalLikes,
      tracks: tracks.map((t, index) => {
        const tempoData = trackTempoVotes.get(`${t.artist}:${t.title}`);
        return {
          position: index + 1,
          artist: t.artist,
          title: t.title,
          bpm: t.bpm,
          key: t.key,
          // Fingerprint data
          energy: t.energy,
          danceability: t.danceability,
          brightness: t.brightness,
          acousticness: t.acousticness,
          groove: t.groove,
          playedAt: t.playedAt,
          likes: trackLikeCounts.get(t.id) || 0,
          tempo: tempoData
            ? {
                slower: tempoData.slower,
                perfect: tempoData.perfect,
                faster: tempoData.faster,
              }
            : null,
        };
      }),
    };

    // Only include polls if authenticated
    if (isAuthenticated) {
      response.polls = pollsWithResults;
      response.totalPolls = pollsWithResults.length;
      response.totalPollVotes = pollsWithResults.reduce((sum, p) => sum + p.totalVotes, 0);
    }

    return c.json(response);
  } catch (e) {
    console.error("Failed to fetch recap:", e);
    return c.json({ error: "Failed to fetch recap" }, 500);
  }
});

// ============================================================================
// Fingerprint Sync
// ============================================================================

/**
 * POST /:sessionId/sync-fingerprints
 * Sync fingerprint/analysis data for tracks in a session.
 * Called by desktop at session end to update played_tracks with BPM, energy, etc.
 */
sessions.post("/:sessionId/sync-fingerprints", async (c) => {
  const sessionId = c.req.param("sessionId");

  const body = await c.req.json<{
    tracks: Array<{
      artist: string;
      title: string;
      bpm?: number | null;
      key?: string | null;
      energy?: number | null;
      danceability?: number | null;
      brightness?: number | null;
      acousticness?: number | null;
      groove?: number | null;
    }>;
  }>();

  if (!body.tracks || !Array.isArray(body.tracks)) {
    return c.json({ error: "Invalid request: tracks array required" }, 400);
  }

  console.log(`🔄 Syncing fingerprints for session ${sessionId}: ${body.tracks.length} tracks`);

  try {
    let updated = 0;

    for (const track of body.tracks) {
      // Skip tracks without data
      if (!track.bpm && !track.key && !track.energy) {
        continue;
      }

      // Build update object with only non-null values
      const updateData: Record<string, unknown> = {};
      if (track.bpm != null) updateData["bpm"] = Math.round(track.bpm);
      if (track.key != null) updateData["key"] = track.key;
      if (track.energy != null) updateData["energy"] = Math.round(track.energy);
      if (track.danceability != null) updateData["danceability"] = Math.round(track.danceability);
      if (track.brightness != null) updateData["brightness"] = Math.round(track.brightness);
      if (track.acousticness != null) updateData["acousticness"] = Math.round(track.acousticness);
      if (track.groove != null) updateData["groove"] = Math.round(track.groove);

      if (Object.keys(updateData).length === 0) {
        continue;
      }

      // Update by sessionId + artist + title match
      const result = await db
        .update(schema.playedTracks)
        .set(updateData)
        .where(
          and(
            eq(schema.playedTracks.sessionId, sessionId),
            eq(schema.playedTracks.artist, track.artist),
            eq(schema.playedTracks.title, track.title),
          ),
        )
        .returning({ id: schema.playedTracks.id });

      if (result.length > 0) {
        updated++;
      }
    }

    console.log(`✅ Synced ${updated}/${body.tracks.length} tracks for session ${sessionId}`);

    return c.json({
      synced: updated,
      total: body.tracks.length,
      sessionId,
    });
  } catch (e) {
    console.error("Failed to sync fingerprints:", e);
    return c.json({ error: "Failed to sync fingerprints" }, 500);
  }
});

export { sessions };
