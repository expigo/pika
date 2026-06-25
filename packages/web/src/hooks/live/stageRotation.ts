/**
 * Pure stage-mode message transitions for a listener on a persistent Stage.
 *
 * Extracted from useLiveListener so the seamless-rotation behavior is unit-
 * testable without React or a WebSocket. The dancer subscribes once to
 * `stage:{id}` and FOLLOWS whichever DJ is live:
 *   - NOW_PLAYING reveals the current DJ (no SESSION_STARTED when joining mid-set)
 *   - SESSION_STARTED(stageId) swaps DJ seamlessly (reset track/history/poll)
 *   - SESSION_ENDED(stageId) → "waiting for next DJ" (NOT "over"); the stage persists
 *
 * Each function takes an {@link StageRotationActions} of plain callbacks so the
 * caller wires them to React state setters (and tests pass spies).
 *
 * @file packages/web/src/hooks/live/stageRotation.ts
 */

export interface StageRotationActions {
  setSessionId(id: string | null): void;
  setDjName(name: string | null): void;
  clearCurrentTrack(): void;
  clearHistory(): void;
  resetPoll(): void;
  resetTempoVote(): void;
  resetLikes(): void;
  setSessionEnded(value: boolean): void;
  fetchHistory(sessionId: string): void;
}

/**
 * NOW_PLAYING peek: learn the live DJ/session on the stage. `lastSession` is the
 * session we last synced history for; returns the new value so the caller can
 * dedup history fetches across repeated NOW_PLAYING for the same session.
 */
export function applyStageNowPlaying(
  msg: { sessionId?: string; djName?: string },
  lastSession: string | null,
  a: StageRotationActions,
): string | null {
  if (msg.djName) a.setDjName(msg.djName);
  let next = lastSession;
  if (msg.sessionId) {
    a.setSessionId(msg.sessionId);
    if (lastSession !== msg.sessionId) {
      next = msg.sessionId;
      a.fetchHistory(msg.sessionId);
    }
  }
  a.setSessionEnded(false);
  return next;
}

/**
 * SESSION_STARTED in stage mode. Returns true if it targeted THIS stage (a DJ
 * swap was applied); false if it's for another stage and should be ignored.
 */
export function applyStageSessionStarted(
  msg: { sessionId: string; djName: string; stageId?: string },
  targetStageId: string,
  a: StageRotationActions,
): boolean {
  if (msg.stageId !== targetStageId) return false;
  a.setSessionId(msg.sessionId);
  a.setDjName(msg.djName);
  a.clearCurrentTrack();
  a.clearHistory();
  a.resetPoll();
  a.resetTempoVote();
  a.setSessionEnded(false);
  a.fetchHistory(msg.sessionId);
  return true;
}

/**
 * SESSION_ENDED in stage mode. Returns true if it targeted THIS stage (the
 * "waiting for next DJ" state was applied). Deliberately does NOT call
 * setSessionEnded(true): the stage persists, so this is a lull, not an end.
 */
export function applyStageSessionEnded(
  msg: { sessionId: string; stageId?: string },
  targetStageId: string,
  a: StageRotationActions,
): boolean {
  if (msg.stageId !== targetStageId) return false;
  a.setSessionId(null);
  a.setDjName(null);
  a.clearCurrentTrack();
  a.clearHistory();
  a.resetLikes();
  a.resetTempoVote();
  a.resetPoll();
  return true;
}
