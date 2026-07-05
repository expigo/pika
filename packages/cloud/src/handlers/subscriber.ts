/**
 * Subscriber Message Handlers
 *
 * Handles WebSocket messages from clients joining a live audience:
 * - SUBSCRIBE        — join a single DJ session (legacy; by sessionId)
 * - SUBSCRIBE_STAGE  — join a persistent Stage (stays subscribed across DJ rotation)
 *
 * @file packages/cloud/src/handlers/subscriber.ts
 * @package @pika/cloud
 * @created 2026-01-21
 */

import { logger, SubscribeSchema, SubscribeStageSchema } from "@pika/shared";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../db";
import { stageSubscriptions, stages } from "../db/schema";
import { addListener, getListenerCount, removeListener } from "../lib/listeners";
import { getActivePoll, sessionActivePoll } from "../lib/polls";
import { parseMessage, sendAck, sendNack } from "../lib/protocol";
import {
  getAllSessions,
  getSession,
  getSessionAudienceKey,
  getSessionBroadcastTopic,
  type LiveSession,
} from "../lib/sessions";
import { getStageActiveSession } from "../lib/stages";
import { getEventTopic, getStageTopic } from "../lib/topics";
import type { WSContext } from "./ws-context";

type SocketSend = WSContext["ws"];

/**
 * Send a joining client the current session state (now-playing, active poll,
 * active announcement). Shared by SUBSCRIBE and SUBSCRIBE_STAGE.
 */
function syncSessionState(ws: SocketSend, session: LiveSession, clientId: string | null): void {
  if (session.currentTrack) {
    ws.send(
      JSON.stringify({
        type: "NOW_PLAYING",
        sessionId: session.sessionId,
        djName: session.djName || "DJ",
        track: session.currentTrack,
      }),
    );
  }

  const activePollId = sessionActivePoll.get(session.sessionId);
  if (activePollId) {
    const poll = getActivePoll(activePollId);
    if (poll) {
      const totalVotes = poll.votes.reduce((a, b) => a + b, 0);
      const votedOptionIndex = clientId ? poll.votedClients.get(clientId) : undefined;
      ws.send(
        JSON.stringify({
          type: "POLL_STARTED",
          pollId: poll.id,
          question: poll.question,
          options: poll.options,
          endsAt: poll.endsAt?.toISOString(),
          votes: poll.votes,
          totalVotes,
          hasVoted: votedOptionIndex !== undefined,
          votedOptionIndex,
        }),
      );
    }
  }

  if (session.activeAnnouncement) {
    ws.send(
      JSON.stringify({
        type: "ANNOUNCEMENT_RECEIVED",
        sessionId: session.sessionId,
        message: session.activeAnnouncement.message,
        djName: session.djName,
        timestamp: session.activeAnnouncement.timestamp,
        endsAt: session.activeAnnouncement.endsAt,
      }),
    );
  }
}

/** Leave whatever audience (stage or session) this connection was on. */
function leaveCurrentAudience(ctx: WSContext): void {
  const { rawWs, state } = ctx;
  if (!state.clientId) return;
  if (state.subscribedStageId) {
    rawWs.unsubscribe(getStageTopic(state.subscribedStageId));
    removeListener(getStageTopic(state.subscribedStageId), state.clientId);
    state.subscribedStageId = null;
  }
  if (state.subscribedSessionId) {
    rawWs.unsubscribe(getSessionBroadcastTopic(state.subscribedSessionId));
    removeListener(getSessionAudienceKey(state.subscribedSessionId), state.clientId);
    state.subscribedSessionId = null;
  }
  // Reset the once-per-connection listener guard so the NEW audience re-counts
  // this client (it was just decremented from the old one above).
  state.isListener = false;
}

/**
 * SUBSCRIBE: Client joins a single session and requests initial state.
 */
export function handleSubscribe(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(SubscribeSchema, message, ws, messageId);
  if (!msg) return;
  const targetSession = msg.sessionId;

  const isNewSubscription = !state.isListener && state.clientId && targetSession;

  // Join the target session's audience topic (resolves to the stage topic if the
  // session runs under a stage). subscribe() is idempotent.
  if (targetSession && state.clientId) {
    if (state.subscribedSessionId && state.subscribedSessionId !== targetSession) {
      rawWs.unsubscribe(getSessionBroadcastTopic(state.subscribedSessionId));
      removeListener(getSessionAudienceKey(state.subscribedSessionId), state.clientId);
    }
    rawWs.subscribe(getSessionBroadcastTopic(targetSession));
    state.subscribedSessionId = targetSession;
  }

  const audienceKey = targetSession ? getSessionAudienceKey(targetSession) : "";

  if (isNewSubscription && targetSession && state.clientId) {
    state.isListener = true;
    const isNewUniqueClient = addListener(audienceKey, state.clientId);
    const count = getListenerCount(audienceKey);
    if (isNewUniqueClient) {
      rawWs.publish(
        getSessionBroadcastTopic(targetSession),
        JSON.stringify({ type: "LISTENER_COUNT", sessionId: targetSession, count }),
      );
    }
  }

  // Lean session listing + backpressure awareness.
  const leanSessions = getAllSessions().map((s) => ({
    sessionId: s.sessionId,
    djName: s.djName,
    ...(s.djSlug && { djSlug: s.djSlug }), // Booth path (Slice C) → Follow affordance
    currentTrack: s.currentTrack,
  }));
  if (rawWs.getBufferedAmount() < 1024 * 64) {
    ws.send(JSON.stringify({ type: "SESSIONS_LIST", sessions: leanSessions }));
  } else {
    logger.warn("⏳ Backpressure: Skipping SESSIONS_LIST for client (buffer full)", {
      clientId: state.clientId,
    });
  }

  if (targetSession) {
    ws.send(
      JSON.stringify({
        type: "LISTENER_COUNT",
        sessionId: targetSession,
        count: getListenerCount(audienceKey),
      }),
    );

    const session = getSession(targetSession);
    if (!session) {
      // Sleeping-phone: client woke and asked for a session that already ended.
      logger.info("💀 Subscriber requested dead/missing session", { sessionId: targetSession });
      ws.send(JSON.stringify({ type: "SESSION_ENDED", sessionId: targetSession }));
      if (messageId) sendAck(ws, messageId);
      return;
    }

    syncSessionState(ws, session, state.clientId);
  }

  if (messageId) sendAck(ws, messageId);
}

/**
 * SUBSCRIBE_STAGE: Client joins a persistent Stage. Stays subscribed across DJ
 * rotation — when the live session under the stage changes, the dancer keeps
 * receiving traffic on `stage:{id}` with no re-subscribe. Writes a durable
 * stage_subscriptions row that arms SCOPED push (see lib/persistence/push-targets.ts).
 */
export async function handleSubscribeStage(ctx: WSContext): Promise<void> {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(SubscribeStageSchema, message, ws, messageId);
  if (!msg) return;

  const stageId = msg.stageId;
  if (!state.clientId) {
    if (messageId) sendNack(ws, messageId, "clientId required to join a stage");
    return;
  }

  // Validate the stage + resolve its parent event (skipped in unit tests, which
  // have no DB — mirrors the persist* NODE_ENV short-circuit).
  let eventId: string | null = null;
  if (process.env.NODE_ENV !== "test") {
    const [stage] = await db
      .select({ id: stages.id, eventId: stages.eventId })
      .from(stages)
      .where(and(eq(stages.id, stageId), isNull(stages.archivedAt)));
    if (!stage) {
      if (messageId) sendNack(ws, messageId, "Stage not found");
      return;
    }
    eventId = stage.eventId;
  }

  // Leave any prior audience, then join the stage (+ parent event) topic.
  if (state.subscribedStageId !== stageId) leaveCurrentAudience(ctx);
  rawWs.subscribe(getStageTopic(stageId));
  if (eventId) rawWs.subscribe(getEventTopic(eventId));
  state.subscribedStageId = stageId;

  const stageKey = getStageTopic(stageId);
  if (!state.isListener) {
    state.isListener = true;
    const isNewUniqueClient = addListener(stageKey, state.clientId);
    if (isNewUniqueClient) {
      rawWs.publish(
        stageKey,
        JSON.stringify({
          type: "LISTENER_COUNT",
          sessionId: stageId,
          count: getListenerCount(stageKey),
        }),
      );
    }
  }

  // Durable membership row → arms scoped push for backgrounded devices.
  if (process.env.NODE_ENV !== "test") {
    db.insert(stageSubscriptions)
      .values({ stageId, clientId: state.clientId })
      .onConflictDoUpdate({
        target: [stageSubscriptions.stageId, stageSubscriptions.clientId],
        set: { lastSeenAt: new Date() },
      })
      .catch((e) => logger.error("Failed to record stage subscription", e));
  }

  // Sync the currently-live session on this stage (if a DJ is on).
  ws.send(
    JSON.stringify({
      type: "LISTENER_COUNT",
      sessionId: stageId,
      count: getListenerCount(stageKey),
    }),
  );
  const activeSessionId = getStageActiveSession(stageId);
  const session = activeSessionId ? getSession(activeSessionId) : undefined;
  if (session) syncSessionState(ws, session, state.clientId);

  if (messageId) sendAck(ws, messageId);
}
