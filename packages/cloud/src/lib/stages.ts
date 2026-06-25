/**
 * Stage runtime state (in-memory).
 *
 * Maps a Stage to the session currently live on it, so a dancer joining a stage
 * (SUBSCRIBE_STAGE) can be synced with the active DJ's now-playing, and so DJ
 * rotation on a stage is seamless: the dancer stays subscribed to `stage:{id}`
 * while the active session underneath changes.
 *
 * FUTURE: like sessions.ts, this Map swaps 1:1 onto a Redis hash if/when
 * multi-instance scaling lands.
 *
 * @file packages/cloud/src/lib/stages.ts
 * @package @pika/cloud
 */

import { logger } from "@pika/shared";

/** stageId -> the sessionId currently broadcasting on that stage. */
const stageActiveSession = new Map<string, string>();

/** Record that `sessionId` is now the live session on `stageId`. */
export function setStageActiveSession(stageId: string, sessionId: string): void {
  stageActiveSession.set(stageId, sessionId);
  logger.debug("🎭 [STAGES] active session set", { stageId, sessionId });
}

/** The session currently live on a stage, if any. */
export function getStageActiveSession(stageId: string): string | undefined {
  return stageActiveSession.get(stageId);
}

/**
 * Clear a stage's active session — but only if it still points at `sessionId`.
 * Guards against a rotation race where DJ B has already claimed the stage when
 * DJ A's teardown fires (we must not wipe B's mapping).
 */
export function clearStageActiveSession(stageId: string, sessionId: string): void {
  if (stageActiveSession.get(stageId) === sessionId) {
    stageActiveSession.delete(stageId);
    logger.debug("🎭 [STAGES] active session cleared", { stageId, sessionId });
  }
}
