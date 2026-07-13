/**
 * Session recap read-path assembly — moved verbatim (2026-07) from routes/sessions.ts (its
 * ~220-line buildRecap). Sole consumer: GET /api/session(s)/:sessionId/recap.
 *
 * The owner gate (raw Bearer token → getUserFromToken + hasDjAccess) lives INSIDE on purpose:
 * polls are owner-only and the check runs after the five parallel reads by design — resolving
 * auth in the route would reorder the DB calls. Track identity is the broadcast-time snapshot
 * (playedTracks.spotifyUrl/albumArtUrl), deliberately NOT the journal trust gate. The response
 * shape is a public contract (web recap + analytics SessionRecap types) — byte-identical.
 * Caching stays in the route. Distinct from recap.ts (the Night-Recap EMAIL sweep).
 * Covered by db.integration.test.ts (recap aggregates, snapshot identity, owner playlist-id).
 */

import { LIMITS } from "@pika/shared";
import { count, eq, sql } from "drizzle-orm";
import { db, schema } from "../../db";
import { getUserFromToken, hasDjAccess } from "../auth";

/**
 * Build the recap payload for a session. Returns null when the session does not
 * exist (→ 404). Poll data is included ONLY for the authenticated owner.
 *
 * The five independent reads (session, tracks, total likes, per-track likes,
 * tempo votes) run in parallel — previously six sequential awaits.
 */
export async function buildSessionRecap(
  sessionId: string,
  token: string | null,
): Promise<Record<string, unknown> | null> {
  const [sessionData, tracks, likesResult, trackLikesData, tempoVotesData] = await Promise.all([
    db
      .select({
        id: schema.sessions.id,
        djUserId: schema.sessions.djUserId,
        djName: schema.sessions.djName,
        // Booth path (Slice C) — recap Follow button + recap-email booth links.
        djSlug: schema.user.slug,
        startedAt: schema.sessions.startedAt,
        endedAt: schema.sessions.endedAt,
        spotifyPlaylistId: schema.sessions.spotifyPlaylistId,
      })
      .from(schema.sessions)
      .leftJoin(schema.user, eq(schema.sessions.djUserId, schema.user.id))
      .where(eq(schema.sessions.id, sessionId))
      .limit(1),
    db
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
        albumArtUrl: schema.playedTracks.albumArtUrl,
        spotifyUrl: schema.playedTracks.spotifyUrl,
        playedAt: schema.playedTracks.playedAt,
      })
      .from(schema.playedTracks)
      .where(eq(schema.playedTracks.sessionId, sessionId))
      .orderBy(schema.playedTracks.playedAt)
      .limit(LIMITS.MAX_RECAP_ITEMS), // L7: Standardized cap
    db.select({ count: count() }).from(schema.likes).where(eq(schema.likes.sessionId, sessionId)),
    db
      .select({ playedTrackId: schema.likes.playedTrackId, count: count() })
      .from(schema.likes)
      .where(eq(schema.likes.sessionId, sessionId))
      .groupBy(schema.likes.playedTrackId),
    db
      .select({
        trackArtist: schema.tempoVotes.trackArtist,
        trackTitle: schema.tempoVotes.trackTitle,
        slowerCount: schema.tempoVotes.slowerCount,
        perfectCount: schema.tempoVotes.perfectCount,
        fasterCount: schema.tempoVotes.fasterCount,
      })
      .from(schema.tempoVotes)
      .where(eq(schema.tempoVotes.sessionId, sessionId)),
  ]);

  const dbSession = sessionData[0];
  if (!dbSession) return null;

  const totalLikes = likesResult[0]?.count || 0;

  const trackLikeCounts = new Map<number, number>();
  for (const item of trackLikesData) {
    if (item.playedTrackId) trackLikeCounts.set(item.playedTrackId, item.count);
  }

  const trackTempoVotes = new Map<string, { slower: number; perfect: number; faster: number }>();
  for (const tv of tempoVotesData) {
    trackTempoVotes.set(`${tv.trackArtist}:${tv.trackTitle}`, {
      slower: tv.slowerCount,
      perfect: tv.perfectCount,
      faster: tv.fasterCount,
    });
  }

  // Conditional access: only the session OWNER gets poll data (privacy). Role check is defense
  // in depth — post-tightening a dancer can never own a session, but the check is free.
  let isAuthenticated = false;
  if (token) {
    const user = await getUserFromToken(token);
    if (user && dbSession.djUserId === user.id && hasDjAccess(user) === "ok") {
      isAuthenticated = true;
    }
  }

  let pollsWithResults: unknown[] = [];
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

    // 🛡️ P0 Fix: Single batched query for all poll vote counts (eliminates N+1)
    const pollIds = pollsData.map((p) => p.id);
    let allVotes: { pollId: number; optionIndex: number; count: number }[] = [];

    if (pollIds.length > 0) {
      allVotes = await db
        .select({
          pollId: schema.pollVotes.pollId,
          optionIndex: schema.pollVotes.optionIndex,
          count: count(),
        })
        .from(schema.pollVotes)
        .where(
          sql`${schema.pollVotes.pollId} IN (${sql.join(
            pollIds.map((id) => sql`${id}`),
            sql`, `,
          )})`,
        )
        .groupBy(schema.pollVotes.pollId, schema.pollVotes.optionIndex);
    }

    // Build vote counts map: pollId -> optionIndex -> count
    const votesByPoll = new Map<number, Map<number, number>>();
    for (const v of allVotes) {
      let optionCounts = votesByPoll.get(v.pollId);
      if (!optionCounts) {
        optionCounts = new Map();
        votesByPoll.set(v.pollId, optionCounts);
      }
      optionCounts.set(v.optionIndex, v.count);
    }

    pollsWithResults = pollsData.map((poll) => {
      const options = (poll.options as string[]) || [];
      const pollVotes = votesByPoll.get(poll.id) || new Map();
      const voteCounts = options.map((_, idx) => pollVotes.get(idx) || 0);

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
        currentTrack:
          poll.currentTrackArtist && poll.currentTrackTitle
            ? { artist: poll.currentTrackArtist, title: poll.currentTrackTitle }
            : null,
      };
    });
  }

  // Effective end time prevents "zombie sessions" (forgotten open sessions).
  const lastTrack = tracks[tracks.length - 1];
  let endTime: Date;
  if (dbSession.endedAt) {
    endTime = dbSession.endedAt;
  } else if (lastTrack) {
    const cap = new Date(new Date(lastTrack.playedAt).getTime() + 5 * 60 * 1000);
    const now = new Date();
    endTime = now < cap ? now : cap;
  } else {
    endTime = new Date();
  }

  const response: Record<string, unknown> = {
    sessionId,
    djName: dbSession.djName || "DJ",
    djSlug: dbSession.djSlug ?? null,
    startedAt: dbSession.startedAt?.toISOString(),
    endedAt: endTime?.toISOString(),
    trackCount: tracks.length,
    totalLikes,
    // Playlist sync: the set's synced Spotify playlist → embedded on the recap. Null if not shared.
    spotifyPlaylistId: dbSession.spotifyPlaylistId ?? null,
    tracks: tracks.map((t, index) => {
      const tempoData = trackTempoVotes.get(`${t.artist}:${t.title}`);
      return {
        position: index + 1,
        artist: t.artist,
        title: t.title,
        bpm: t.bpm,
        key: t.key,
        energy: t.energy,
        danceability: t.danceability,
        brightness: t.brightness,
        acousticness: t.acousticness,
        groove: t.groove,
        albumArtUrl: t.albumArtUrl,
        spotifyUrl: t.spotifyUrl,
        playedAt: t.playedAt,
        likes: trackLikeCounts.get(t.id) || 0,
        tempo: tempoData
          ? { slower: tempoData.slower, perfect: tempoData.perfect, faster: tempoData.faster }
          : null,
      };
    }),
  };

  if (isAuthenticated) {
    response["polls"] = pollsWithResults;
    response["totalPolls"] = pollsWithResults.length;
    response["totalPollVotes"] = (pollsWithResults as { totalVotes: number }[]).reduce(
      (sum, p) => sum + p.totalVotes,
      0,
    );
  }

  return response;
}
