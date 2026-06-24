/**
 * Track Persistence
 *
 * @file persistence/tracks.ts
 * @package @pika/cloud
 * @created 2026-01-21
 *
 * PURPOSE:
 * Database operations for tracks, likes, and tempo votes.
 */

import type { TrackInfo } from "@pika/shared";
import { logger } from "@pika/shared";
import { and, desc, eq } from "drizzle-orm";
import { db, schema } from "../../db";
import { enqueuePersistence } from "./queue";
import { persistedSessions, waitForSession } from "./sessions";

// ============================================================================
// State
// ============================================================================

// Track last persisted track per session for deduplication
export const lastPersistedTrackKey = new Map<string, string>();

// C3: plays that arrived before their session row was persisted (the go-live race,
// where BROADCAST_TRACK is processed while REGISTER_SESSION's insert is still in
// flight). Buffered here instead of being silently dropped, then flushed once the
// session is ready. Normally empty — only used during that brief window.
const pendingTracksBuffer = new Map<string, TrackInfo[]>();
const MAX_PENDING_TRACKS = 200;

function bufferPendingTrack(sessionId: string, track: TrackInfo): void {
  const buf = pendingTracksBuffer.get(sessionId) ?? [];
  if (buf.length >= MAX_PENDING_TRACKS) {
    // Loud, not silent — a full buffer means the session never persisted.
    logger.error("❌ Pending-track buffer full; dropping oldest play", { sessionId });
    buf.shift();
  }
  buf.push(track);
  pendingTracksBuffer.set(sessionId, buf);
}

/**
 * Flush plays buffered before the session row existed. Called once persistSession
 * succeeds (REGISTER_SESSION handler). Re-runs persistTrack now that the session is
 * ready, so the normal insert + dedup path applies, in original play order.
 */
export async function flushPendingTracks(sessionId: string): Promise<void> {
  const buf = pendingTracksBuffer.get(sessionId);
  if (!buf || buf.length === 0) return;
  pendingTracksBuffer.delete(sessionId);
  logger.info("⏳→💾 Flushing buffered plays", { sessionId, count: buf.length });
  for (const track of buf) {
    await persistTrack(sessionId, track);
  }
}

/** Drop buffered plays for a session (session persist failed, or session ended). */
export function discardPendingTracks(sessionId: string): void {
  if (pendingTracksBuffer.delete(sessionId)) {
    logger.error("❌ Discarded buffered plays (session not persisted)", { sessionId });
  }
}

/** Test/observability: number of plays currently buffered for a session. */
export function getPendingTrackCount(sessionId: string): number {
  return pendingTracksBuffer.get(sessionId)?.length ?? 0;
}

// ============================================================================
// Operations
// ============================================================================

/**
 * Persist played track to database
 * Only persists if session already exists in DB
 * Stores BPM, key, and fingerprint for analytics visualizations
 */
export async function persistTrack(sessionId: string, track: TrackInfo): Promise<void> {
  // Wrap in serial queue to ensure order (Track -> Likes)
  return enqueuePersistence(sessionId, async () => {
    const trackKey = `${track.artist}:${track.title}`;

    // Wait for session to be persisted (event-based, with timeout)
    const sessionReady = await waitForSession(sessionId);
    if (!sessionReady || !persistedSessions.has(sessionId)) {
      // C3: don't silently drop the play — buffer it. flushPendingTracks() runs
      // once the session row is persisted (from the REGISTER_SESSION handler).
      bufferPendingTrack(sessionId, track);
      logger.warn("⏳ Session not ready; play buffered for flush", {
        sessionId,
        title: track.title,
      });
      return;
    }

    // Deduplication: Don't persist if it's the same song as last time for this session
    if (lastPersistedTrackKey.get(sessionId) === trackKey) {
      return;
    }

    try {
      if (process.env.NODE_ENV === "test") {
        logger.debug("🧪 TEST MODE: Mocking track persistence", { title: track.title });
        return;
      }

      const [inserted] = await db
        .insert(schema.playedTracks)
        .values({
          sessionId,
          artist: track.artist,
          title: track.title,
          // Core metrics
          bpm: track.bpm ? Math.round(track.bpm) : null,
          key: track.key ?? null,
          // Fingerprint metrics
          energy: track.energy ? Math.round(track.energy) : null,
          danceability: track.danceability ? Math.round(track.danceability) : null,
          brightness: track.brightness ? Math.round(track.brightness) : null,
          acousticness: track.acousticness ? Math.round(track.acousticness) : null,
          groove: track.groove ? Math.round(track.groove) : null,
        })
        .returning({ id: schema.playedTracks.id });

      if (inserted) {
        lastPersistedTrackKey.set(sessionId, trackKey);
        logger.info("💾 Track persisted", {
          artist: track.artist,
          title: track.title,
          id: inserted.id,
          bpm: track.bpm,
        });
      }
    } catch (e) {
      logger.error("❌ Failed to persist track", e);
    }
  });
}

/**
 * Bulk persist tracks to database (for history import)
 */
export async function persistTracksBulk(sessionId: string, tracks: TrackInfo[]): Promise<void> {
  if (tracks.length === 0) return;

  // Wrap in serial queue to ensure order
  return enqueuePersistence(sessionId, async () => {
    // Wait for session to be persisted (event-based, with timeout)
    const sessionReady = await waitForSession(sessionId);
    if (!sessionReady || !persistedSessions.has(sessionId)) {
      // C3: buffer the batch instead of dropping it; flushed on session-ready.
      for (const track of tracks) bufferPendingTrack(sessionId, track);
      logger.warn("⏳ Session not ready; buffered plays for flush", {
        sessionId,
        count: tracks.length,
      });
      return;
    }

    try {
      if (process.env.NODE_ENV === "test") {
        logger.debug("🧪 TEST MODE: Mocking bulk track persistence", { count: tracks.length });
        return;
      }

      // Map tracks to DB values
      // Note: We use existing passed timestamp if available?
      // Current TrackInfoSchema doesn't have timestamp.
      // The DB will use defaultNow() (which is now).
      // Ideally, history import should preserver timestamps.
      // But TrackInfo is just metadata.
      // For now, they will appear as "played just now" in strict DB terms if we don't pass timestamp.
      // However, `playedTracks` has a `playedAt` defaultNow().
      // If we want accurate history, we need to pass timestamps.
      // But `TrackInfo` doesn't have it.
      // This is a trade-off. They will appear in order, but with concurrent timestamps.
      // This is acceptable for MVP "list of songs played".

      const values = tracks.map((track) => ({
        sessionId,
        artist: track.artist,
        title: track.title,
        bpm: track.bpm ? Math.round(track.bpm) : null,
        key: track.key ?? null,
        energy: track.energy ? Math.round(track.energy) : null,
        danceability: track.danceability ? Math.round(track.danceability) : null,
        brightness: track.brightness ? Math.round(track.brightness) : null,
        acousticness: track.acousticness ? Math.round(track.acousticness) : null,
        groove: track.groove ? Math.round(track.groove) : null,
      }));

      await db.insert(schema.playedTracks).values(values);

      logger.info("💾 Bulk tracks persisted", {
        sessionId,
        count: tracks.length,
      });

      // Update last persisted track key to the last one in the list
      // to prevents immediate dedup if the DJ plays the last imported song again
      const lastTrack = tracks[tracks.length - 1];
      if (lastTrack) {
        const trackKey = `${lastTrack.artist}:${lastTrack.title}`;
        lastPersistedTrackKey.set(sessionId, trackKey);
      }
    } catch (e) {
      logger.error("❌ Failed to persist bulk tracks", e);
    }
  });
}

/**
 * Persist like to database with retry logic
 * Handles race condition where like arrives before track is persisted
 */
export async function persistLike(
  track: TrackInfo,
  sessionId?: string,
  clientId?: string,
): Promise<void> {
  if (!sessionId) return;

  // Enqueue ensures this runs AFTER persistTrack for the same session
  return enqueuePersistence(sessionId, async () => {
    try {
      // 1. Find the specific "play instance" of this track in this session.
      const [playedTrack] = await db
        .select({ id: schema.playedTracks.id })
        .from(schema.playedTracks)
        .where(
          and(
            eq(schema.playedTracks.sessionId, sessionId),
            eq(schema.playedTracks.artist, track.artist),
            eq(schema.playedTracks.title, track.title),
          ),
        )
        .orderBy(desc(schema.playedTracks.playedAt))
        .limit(1);

      if (playedTrack) {
        // 2. Insert the like with strict Foreign Key.
        // onConflictDoNothing leans on the unique_like_idempotency constraint to
        // swallow duplicate (session, client, track) likes durably — across server
        // restarts and bulk/offline flush, where the in-memory likes.ts guard can't.
        await db
          .insert(schema.likes)
          .values({
            sessionId: sessionId,
            clientId: clientId ?? null,
            playedTrackId: playedTrack.id,
          })
          .onConflictDoNothing();
        logger.info("💾 Like persisted", {
          title: track.title,
          clientId: clientId?.substring(0, 8),
        });
      } else {
        // Summerizes persistence queue failure
        logger.warn("⚠️ Like orphan (track not found)", { title: track.title, sessionId });
      }
    } catch (e) {
      logger.error("❌ Failed to persist like", e);
    }
  });
}

/**
 * Remove persisted like from database
 */
export async function deletePersistedLike(
  track: TrackInfo,
  sessionId?: string,
  clientId?: string,
): Promise<void> {
  if (!sessionId || !clientId) return;

  return enqueuePersistence(sessionId, async () => {
    try {
      // 1. Find the played track ID
      const [playedTrack] = await db
        .select({ id: schema.playedTracks.id })
        .from(schema.playedTracks)
        .where(
          and(
            eq(schema.playedTracks.sessionId, sessionId),
            eq(schema.playedTracks.artist, track.artist),
            eq(schema.playedTracks.title, track.title),
          ),
        )
        .orderBy(desc(schema.playedTracks.playedAt))
        .limit(1);

      if (playedTrack) {
        // 2. Delete the like entry
        await db
          .delete(schema.likes)
          .where(
            and(
              eq(schema.likes.sessionId, sessionId),
              eq(schema.likes.clientId, clientId),
              eq(schema.likes.playedTrackId, playedTrack.id),
            ),
          );
        logger.info("💾 Like removed from database", {
          title: track.title,
          clientId: clientId.substring(0, 8),
        });
      }
    } catch (e) {
      logger.error("❌ Failed to delete persisted like", e);
    }
  });
}

/**
 * Persist tempo votes for a track (called when track changes)
 */
export async function persistTempoVotes(
  sessionId: string,
  track: TrackInfo,
  votes: { slower: number; perfect: number; faster: number },
): Promise<void> {
  // Only persist if there were any votes
  if (votes.slower === 0 && votes.perfect === 0 && votes.faster === 0) {
    return;
  }

  // Wrap in queue to prevent race conditions
  return enqueuePersistence(sessionId, async () => {
    try {
      await db.insert(schema.tempoVotes).values({
        sessionId,
        trackArtist: track.artist,
        trackTitle: track.title,
        slowerCount: votes.slower,
        perfectCount: votes.perfect,
        fasterCount: votes.faster,
      });
      logger.info("🎚️ Tempo votes persisted", {
        title: track.title,
        ...votes,
      });
    } catch (e) {
      logger.error("❌ Failed to persist tempo votes", e);
    }
  });
}

/**
 * Cleanup function for memory management (M1)
 */
export function clearLastPersistedTrackKey(sessionId: string): void {
  if (lastPersistedTrackKey.has(sessionId)) {
    lastPersistedTrackKey.delete(sessionId);
  }
  // C3: also drop any plays still buffered for this session so they can't leak.
  pendingTracksBuffer.delete(sessionId);
}
