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

import { and, desc, eq } from "drizzle-orm";
import type { TrackInfo } from "@pika/shared";
import { db, schema } from "../../db";
import { waitForSession, persistedSessions } from "./sessions";
import { enqueuePersistence } from "./queue";

// ============================================================================
// State
// ============================================================================

// Track last persisted track per session for deduplication
export const lastPersistedTrackKey = new Map<string, string>();

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
    if (!sessionReady) {
      console.warn(`⚠️ Session ${sessionId} not ready in time, skipping track persistence`);
      return;
    }

    if (!persistedSessions.has(sessionId)) {
      console.warn(`⚠️ Session ${sessionId} not found in DB, skipping track persistence`);
      return;
    }

    // Deduplication: Don't persist if it's the same song as last time for this session
    if (lastPersistedTrackKey.get(sessionId) === trackKey) {
      return;
    }

    try {
      if (process.env.NODE_ENV === "test") {
        console.log(`🧪 TEST MODE: Mocking track persistence for ${track.title}`);
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
        const bpmInfo = track.bpm ? ` (${track.bpm} BPM)` : "";
        console.log(
          `💾 Track persisted: ${track.artist} - ${track.title} (ID: ${inserted.id})${bpmInfo}`,
        );
      }
    } catch (e) {
      console.error("❌ Failed to persist track:", e);
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
        // 2. Insert the like with strict Foreign Key
        await db.insert(schema.likes).values({
          sessionId: sessionId,
          clientId: clientId ?? null,
          playedTrackId: playedTrack.id,
        });
        console.log(`💾 Like persisted: ${track.title} (client: ${clientId?.substring(0, 8)})`);
      } else {
        // Fallback: This shouldn't happen often thanks to the queue,
        // but could happen if persistTrack failed or track doesn't match exactly.
        console.warn(
          `⚠️ Like orphan (track not found): "${track.title}" - persistence queue failed to sync order?`,
        );
      }
    } catch (e) {
      console.error("❌ Failed to persist like:", e);
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
      console.log(
        `🎚️ Tempo votes persisted: ${track.title} (🐢${votes.slower} ✅${votes.perfect} 🐇${votes.faster})`,
      );
    } catch (e) {
      console.error("❌ Failed to persist tempo votes:", e);
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
}
