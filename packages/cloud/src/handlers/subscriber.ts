/**
 * Subscriber Message Handlers
 *
 * Handles WebSocket messages from all clients interested in session list
 * or specific session updates:
 * - SUBSCRIBE
 *
 * @file packages/cloud/src/handlers/subscriber.ts
 * @package @pika/cloud
 * @created 2026-01-21
 */

import { logger, SubscribeSchema } from "@pika/shared";
import { addListener, getListenerCount, removeListener } from "../lib/listeners";
import { getActivePoll, sessionActivePoll } from "../lib/polls";
import { parseMessage, sendAck } from "../lib/protocol";
import { getAllSessions, getSession } from "../lib/sessions";
import { getSessionTopic } from "../lib/topics";
import type { WSContext } from "./ws-context";

/**
 * SUBSCRIBE: Client joins a session and requests initial state
 */
export function handleSubscribe(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(SubscribeSchema, message, ws, messageId);
  if (!msg) return;
  const targetSession = msg.sessionId;

  const allSessions = getAllSessions();
  logger.debug("🔍 [SUBSCRIBE] Request received", {
    targetSession: targetSession || "NONE",
    clientId: state.clientId || "UNKNOWN",
    currentSessionCount: allSessions.length,
    availableSessions: allSessions.map((s) => ({ id: s.sessionId, dj: s.djName })),
  });

  // Determine "new listener" BEFORE mutating state.isListener below, so the
  // once-per-connection listener accounting stays correct.
  const isNewSubscription = !state.isListener && state.clientId && targetSession;
  if (isNewSubscription) {
    logger.info("👀 New listener for session", { sessionId: targetSession });
  }

  // 🔀 Join the target session's per-session topic so this connection receives
  // ONLY that session's high-frequency traffic. subscribe() is idempotent (Bun
  // subscriptions are a set), so this is safe on repeat SUBSCRIBE / reconnect.
  // If this same connection was on a different session, leave it first.
  if (targetSession && state.clientId) {
    if (state.subscribedSessionId && state.subscribedSessionId !== targetSession) {
      rawWs.unsubscribe(getSessionTopic(state.subscribedSessionId));
      removeListener(state.subscribedSessionId, state.clientId);
    }
    rawWs.subscribe(getSessionTopic(targetSession));
    state.subscribedSessionId = targetSession;
  }

  // Mark this connection as a listener and count it exactly once per connection.
  if (isNewSubscription && targetSession && state.clientId) {
    state.isListener = true;
    const isNewUniqueClient = addListener(targetSession, state.clientId);

    const count = getListenerCount(targetSession);
    logger.debug(`👥 Listener count for ${targetSession}: ${count}`);

    // Only broadcast if unique client count changed. Published to the session
    // topic; the new joiner gets its own count via the direct send below.
    if (isNewUniqueClient) {
      rawWs.publish(
        getSessionTopic(targetSession),
        JSON.stringify({
          type: "LISTENER_COUNT",
          sessionId: targetSession,
          count,
        }),
      );
    }
  }

  // 🚀 Performance: Lean session listing & backpressure awareness
  const leanSessions = getAllSessions().map((s) => ({
    sessionId: s.sessionId,
    djName: s.djName,
    currentTrack: s.currentTrack,
  }));

  if (rawWs.getBufferedAmount() < 1024 * 64) {
    // Only send if buffered amount is < 64KB
    ws.send(
      JSON.stringify({
        type: "SESSIONS_LIST",
        sessions: leanSessions,
      }),
    );
  } else {
    logger.warn("⏳ Backpressure: Skipping SESSIONS_LIST for client (buffer full)", {
      clientId: state.clientId,
    });
  }

  // Send current listener count for the target session
  if (targetSession) {
    ws.send(
      JSON.stringify({
        type: "LISTENER_COUNT",
        sessionId: targetSession,
        count: getListenerCount(targetSession),
      }),
    );

    const session = getSession(targetSession);

    if (!session) {
      // 🛡️ Issue 48 Fix: If client wakes up and requests a dead session, tell them it's over.
      // This handles the "Sleeping Phone" scenario where the session ended while they were backgrounded.
      logger.info("💀 Subscriber requested dead/missing session", { sessionId: targetSession });
      ws.send(
        JSON.stringify({
          type: "SESSION_ENDED",
          sessionId: targetSession,
        }),
      );
      // Don't send other updates if session is dead
      if (messageId) sendAck(ws, messageId);
      return;
    }

    // Send current track to new subscriber if there is one playing
    if (session.currentTrack) {
      ws.send(
        JSON.stringify({
          type: "NOW_PLAYING",
          sessionId: targetSession,
          djName: session.djName || "DJ",
          track: session.currentTrack,
        }),
      );
      logger.debug("🎵 Sent current track to new subscriber", {
        artist: session.currentTrack.artist,
        title: session.currentTrack.title,
      });
    }

    // If there's an active poll for this session, send it to the new subscriber
    const activePollId = sessionActivePoll.get(targetSession);
    if (activePollId) {
      const poll = getActivePoll(activePollId);
      if (poll) {
        const totalVotes = poll.votes.reduce((a, b) => a + b, 0);
        // Check if THIS client has already voted
        const votedOptionIndex = state.clientId ? poll.votedClients.get(state.clientId) : undefined;
        const hasVoted = votedOptionIndex !== undefined;

        ws.send(
          JSON.stringify({
            type: "POLL_STARTED",
            pollId: poll.id,
            question: poll.question,
            options: poll.options,
            endsAt: poll.endsAt?.toISOString(),
            votes: poll.votes,
            totalVotes,
            hasVoted,
            votedOptionIndex,
          }),
        );
        logger.debug("📊 Sent active poll to new subscriber", {
          question: poll.question,
          totalVotes,
          hasVoted,
        });
      }
    }

    // Send active announcement to late joiners (if any)
    if (session.activeAnnouncement) {
      ws.send(
        JSON.stringify({
          type: "ANNOUNCEMENT_RECEIVED",
          sessionId: targetSession,
          message: session.activeAnnouncement.message,
          djName: session.djName,
          timestamp: session.activeAnnouncement.timestamp,
          endsAt: session.activeAnnouncement.endsAt,
        }),
      );
      logger.debug("📢 Sent active announcement to late joiner", {
        message: session.activeAnnouncement.message,
      });
    }
  }

  if (messageId) sendAck(ws, messageId);
}
