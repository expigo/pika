/**
 * Poll Persistence
 *
 * @file persistence/polls.ts
 * @package @pika/cloud
 * @created 2026-01-21
 *
 * PURPOSE:
 * Database operations for polls and votes.
 */

import { eq } from "drizzle-orm";
import type { TrackInfo } from "@pika/shared";
import { db, schema } from "../../db";
import { waitForSession, persistedSessions } from "./sessions";
import { logger } from "@pika/shared";

// ============================================================================
// Operations
// ============================================================================

/**
 * Create poll in database
 */
export async function createPollInDb(
  sessionId: string,
  question: string,
  options: string[],
  currentTrack?: TrackInfo | null,
): Promise<number | null> {
  // Wait for session to be persisted (event-based, with timeout)
  const sessionReady = await waitForSession(sessionId, 3000);
  if (!sessionReady) {
    logger.error("❌ Session not ready in time, cannot create poll", { sessionId });
    return null;
  }

  if (!persistedSessions.has(sessionId)) {
    logger.error("❌ Session not persisted in DB after wait, cannot create poll", { sessionId });
    return null;
  }

  try {
    const [newPoll] = await db
      .insert(schema.polls)
      .values({
        sessionId,
        question,
        options, // Drizzle handles JSON array automatically
        status: "active",
        currentTrackArtist: currentTrack?.artist ?? null,
        currentTrackTitle: currentTrack?.title ?? null,
      })
      .returning({ id: schema.polls.id });
    return newPoll?.id ?? null;
  } catch (e) {
    logger.error("❌ Failed to create poll", e);
    return null;
  }
}

/**
 * Close poll in database
 */
export async function closePollInDb(pollId: number): Promise<void> {
  try {
    await db
      .update(schema.polls)
      .set({ status: "closed", endedAt: new Date() })
      .where(eq(schema.polls.id, pollId));
  } catch (e) {
    logger.error("❌ Failed to close poll", e);
  }
}

/**
 * Record a poll vote in database
 */
export async function recordPollVoteInDb(
  pollId: number,
  clientId: string,
  optionIndex: number,
): Promise<void> {
  try {
    await db
      .insert(schema.pollVotes)
      .values({
        pollId,
        clientId,
        optionIndex,
      })
      .onConflictDoNothing();
  } catch (e) {
    logger.error("❌ Failed to persist vote", e);
  }
}
