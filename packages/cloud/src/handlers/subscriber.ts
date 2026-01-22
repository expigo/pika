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

import { SubscribeSchema } from "@pika/shared";
import { getSession, getAllSessions } from "../lib/sessions";
import { addListener, getListenerCount } from "../lib/listeners";
import { getActivePoll, sessionActivePoll } from "../lib/polls";
import { sendAck, parseMessage } from "../lib/protocol";
import type { WSContext } from "./ws-context";

/**
 * SUBSCRIBE: Client joins a session and requests initial state
 */
export function handleSubscribe(ctx: WSContext) {
  const { message, ws, rawWs, state, messageId } = ctx;
  const msg = parseMessage(SubscribeSchema, message, ws, messageId);
  if (!msg) return;
  const targetSession = msg.sessionId;

  // Only log if this is a new subscription (not a repeat)
  const isNewSubscription = !state.isListener && state.clientId && targetSession;
  if (isNewSubscription) {
    console.log(`👀 New listener for session: ${targetSession}`);
  }

  // Mark this connection as a listener
  if (isNewSubscription && targetSession && state.clientId) {
    state.isListener = true;
    state.subscribedSessionId = targetSession;
    const isNewUniqueClient = addListener(targetSession, state.clientId);

    const count = getListenerCount(targetSession);
    console.log(`👥 Listener count for ${targetSession}: ${count}`);

    // Only broadcast if unique client count changed
    if (isNewUniqueClient) {
      rawWs.publish(
        "live-session",
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
    console.warn(`⏳ Backpressure: Skipping SESSIONS_LIST for ${state.clientId} (buffer full)`);
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

    // Send current track to new subscriber if there is one playing
    const session = getSession(targetSession);
    if (session?.currentTrack) {
      ws.send(
        JSON.stringify({
          type: "NOW_PLAYING",
          sessionId: targetSession,
          djName: session.djName || "DJ",
          track: session.currentTrack,
        }),
      );
      console.log(
        `🎵 Sent current track to new subscriber: ${session.currentTrack.artist} - ${session.currentTrack.title}`,
      );
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
        console.log(
          `📊 Sent active poll to new subscriber: "${poll.question}" (${totalVotes} votes, hasVoted: ${hasVoted})`,
        );
      }
    }

    // Send active announcement to late joiners (if any)
    if (session?.activeAnnouncement) {
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
      console.log(
        `📢 Sent active announcement to late joiner: "${session.activeAnnouncement.message}"`,
      );
    }
  }

  if (messageId) sendAck(ws, messageId);
}
