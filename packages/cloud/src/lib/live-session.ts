/**
 * Live-session orchestration shared between the WebSocket DJ handlers and the
 * Track D server-side Spotify poller (the "virtual DJ").
 *
 * These are the context-free cores extracted from `handlers/dj.ts` so a producer
 * WITHOUT a WebSocket (the poller) can create a session and push tracks through the
 * exact same path — one source of truth for tempo handling, persistence and broadcast.
 *
 * Publishing is injected (`PublishFn`) so each caller keeps its own semantics:
 *  - WS handler: `rawWs.publish` (excludes the sender + honours backpressure)
 *  - poller:     `getBroadcaster().publish` (server-level, no socket)
 */

import { logger, type TrackInfo } from "@pika/shared";
import { persistSession } from "./persistence/sessions";
import {
  discardPendingTracks,
  flushPendingTracks,
  persistTempoVotes,
  persistTrack,
} from "./persistence/tracks";
import {
  getSession,
  getSessionBroadcastTopic,
  type LiveSession,
  setSession,
  updateSessionTrack,
} from "./sessions";
import { setStageActiveSession } from "./stages";
import { clearTempoVotes, getTempoFeedback } from "./tempo";

export interface CreateLiveSessionInput {
  sessionId: string;
  djName: string;
  djUserId: string | null;
  stageId?: string;
  stageName?: string;
  eventName?: string;
}

/**
 * Register a live session in memory + DB and flush any pre-session buffered plays.
 * Caller-agnostic: the WS handler adds socket concerns (state, subscribe) around it;
 * the poller calls it directly.
 */
export async function createLiveSession(
  input: CreateLiveSessionInput,
): Promise<{ session: LiveSession; persisted: boolean }> {
  const session: LiveSession = {
    sessionId: input.sessionId,
    djName: input.djName,
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
    ...(input.stageId && { stageId: input.stageId }),
    ...(input.stageName && { stageName: input.stageName }),
    ...(input.eventName && { eventName: input.eventName }),
  };

  setSession(input.sessionId, session);
  // Claim the stage so dancers already on it follow this DJ (and joiners sync to us).
  if (input.stageId) setStageActiveSession(input.stageId, input.sessionId);

  const persisted = await persistSession(
    input.sessionId,
    input.djName,
    input.djUserId,
    input.stageId ?? null,
  );

  // C3: flush any plays buffered before the session row landed (go-live race).
  if (persisted) {
    flushPendingTracks(input.sessionId).catch((e) =>
      logger.error("❌ Failed to flush buffered plays", e),
    );
  } else {
    discardPendingTracks(input.sessionId);
  }

  return { session, persisted };
}

/** Topic publisher injected by the caller (see file header). */
export type PublishFn = (topic: string, data: string) => void;

/**
 * Apply a now-playing track: persist tempo votes for the outgoing track on change,
 * update in-memory state, broadcast NOW_PLAYING (+ TEMPO_RESET on change), and persist
 * the play. Returns false if the session no longer exists.
 */
export function applyNowPlaying(sessionId: string, track: TrackInfo, publish: PublishFn): boolean {
  const session = getSession(sessionId);
  if (!session) return false;

  const topic = getSessionBroadcastTopic(sessionId);

  // Persist tempo votes for the PREVIOUS track when the track changes, then reset the UI.
  if (session.currentTrack) {
    const prev = session.currentTrack;
    const isNewTrack = prev.artist !== track.artist || prev.title !== track.title;
    if (isNewTrack) {
      const feedback = getTempoFeedback(sessionId);
      if (feedback.total > 0) {
        persistTempoVotes(sessionId, prev, {
          slower: feedback.slower,
          perfect: feedback.perfect,
          faster: feedback.faster,
        });
      }
      clearTempoVotes(sessionId);
      publish(topic, JSON.stringify({ type: "TEMPO_RESET", sessionId }));
    }
  }

  updateSessionTrack(sessionId, track);
  logger.info("🎵 Now playing", { artist: track.artist, title: track.title, sessionId });

  publish(topic, JSON.stringify({ type: "NOW_PLAYING", sessionId, djName: session.djName, track }));

  // Persist track (fire-and-forget, handled by the per-session queue).
  persistTrack(sessionId, track).catch((err) => {
    logger.error(`❌ DB Error: Failed to persist track for ${sessionId}`, err);
  });

  return true;
}
