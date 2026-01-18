/**
 * useLiveListener - Composed hook for live DJ session listening
 *
 * This is the main entry point that composes smaller, focused hooks
 * for WebSocket connection, likes, polls, tempo, announcements, and history.
 *
 * @param targetSessionId - Optional. If provided, only listen to this specific session.
 *                          If undefined, auto-join the first active session.
 */
"use client";

import { MESSAGE_TYPES, parseWebSocketMessage, type TrackInfo } from "@pika/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { getOrCreateClientId } from "@/lib/client";
import {
  type ConnectionStatus,
  combineHandlers,
  type HistoryTrack,
  useAnnouncement,
  useLikeQueue,
  usePollState,
  useSocialSignals,
  useTempoVote,
  useTrackHistory,
  useWebSocketConnection,
} from "./live";

// Re-export types for consumers
export type { ConnectionStatus, HistoryTrack };

export function useLiveListener(targetSessionId?: string) {
  const discoveredSessionRef = useRef<string | null>(null);

  // WebSocket connection
  const {
    socketRef,
    status,
    sessionId,
    djName,
    listenerCount,
    setSessionId,
    setDjName,
    setListenerCount,
    lastHeartbeat,
  } = useWebSocketConnection({
    targetSessionId,
  });

  // Like queue (with IndexedDB persistence for offline likes)
  const { likedTracks, sendLike, hasLiked, flushPendingLikes, resetLikes, pendingCount } =
    useLikeQueue({
      sessionId,
      socketRef,
    });

  // Handle reconnect (flush pending likes from IndexedDB)
  useEffect(() => {
    if (status === "connected") {
      // flushPendingLikes is now async but we fire-and-forget
      flushPendingLikes().catch((e) => {
        console.error("[Live] Error flushing pending likes:", e);
      });
    }
  }, [status, flushPendingLikes]);

  // Poll state
  const { activePoll, hasVotedOnPoll, voteOnPoll, resetPoll, pollHandlers } = usePollState({
    socketRef,
  });

  // Tempo vote
  const { tempoVote, sendTempoRequest, resetTempoVote, tempoHandlers } = useTempoVote({
    sessionId,
    socketRef,
  });

  // Announcements
  const { announcement, dismissAnnouncement, announcementHandlers } = useAnnouncement({
    sessionId,
  });

  // Track history
  const { currentTrack, history, setCurrentTrack, clearHistory, fetchHistory, trackHandlers } =
    useTrackHistory({
      sessionId,
    });

  // Social Signals (Hearts)
  const { onLikeReceived, socialSignalHandlers } = useSocialSignals({
    sessionId,
  });

  // Send reaction (thank_you)
  const sendReaction = useCallback(
    (reaction: "thank_you"): boolean => {
      if (!sessionId) return false;

      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN) {
        socket.send(
          JSON.stringify({
            type: "SEND_REACTION",
            clientId: getOrCreateClientId(),
            sessionId,
            reaction,
          }),
        );
        console.log("[Live] Sent reaction:", reaction);
        return true;
      }
      return false;
    },
    [sessionId, socketRef],
  );

  // Explicitly track if the session was ended by the DJ
  const [sessionEnded, setSessionEnded] = useState(false);

  // Session and message routing
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const clientId = getOrCreateClientId();

    // Combine all feature handlers
    const featureHandlers = combineHandlers(
      pollHandlers,
      tempoHandlers,
      announcementHandlers,
      trackHandlers,
      socialSignalHandlers,
    );

    // Main message handler
    socket.onmessage = (event) => {
      const message = parseWebSocketMessage(event.data);
      if (!message) {
        console.error("[Live] Failed to parse message:", event.data);
        return;
      }

      console.log("[Live] Received:", message.type);

      // Check for PONG (heartbeat) - no logging needed
      if ((message as { type: string }).type === "PONG") {
        return;
      }

      // Route to feature handlers first
      const featureHandler = featureHandlers[message.type];
      if (featureHandler) {
        featureHandler(message);
        return;
      }

      // Handle session-related messages
      switch (message.type) {
        case MESSAGE_TYPES.SESSIONS_LIST: {
          const sessions = (
            message as {
              sessions: Array<{ sessionId: string; djName: string; currentTrack?: TrackInfo }>;
            }
          ).sessions;
          if (sessions?.length > 0) {
            if (targetSessionId) {
              const targetSession = sessions.find((s) => s.sessionId === targetSessionId);
              if (targetSession) {
                setSessionId(targetSession.sessionId);
                setDjName(targetSession.djName);
                if (targetSession.currentTrack) {
                  setCurrentTrack(targetSession.currentTrack);
                }
                fetchHistory(targetSession.sessionId);
                setSessionEnded(false);
              }
            } else {
              // Auto-join first session
              const session = sessions[0];
              setSessionId(session.sessionId);
              setDjName(session.djName);
              if (session.currentTrack) {
                setCurrentTrack(session.currentTrack);
              }
              setSessionEnded(false);

              // Subscribe once per discovered session
              if (discoveredSessionRef.current !== session.sessionId) {
                discoveredSessionRef.current = session.sessionId;
                socket.send(
                  JSON.stringify({
                    type: MESSAGE_TYPES.SUBSCRIBE,
                    clientId,
                    sessionId: session.sessionId,
                  }),
                );
                fetchHistory(session.sessionId);
              }
            }
          }
          break;
        }

        case MESSAGE_TYPES.SESSION_STARTED: {
          const msg = message as { sessionId: string; djName: string };
          if (targetSessionId && msg.sessionId !== targetSessionId) return;

          console.log("[Live] Session started:", msg.sessionId);
          setSessionId(msg.sessionId);
          setDjName(msg.djName);
          setCurrentTrack(null);
          clearHistory();
          resetPoll();
          setSessionEnded(false);

          if (!targetSessionId && msg.sessionId) {
            discoveredSessionRef.current = msg.sessionId;
            socket.send(
              JSON.stringify({
                type: MESSAGE_TYPES.SUBSCRIBE,
                clientId,
                sessionId: msg.sessionId,
              }),
            );
            fetchHistory(msg.sessionId);
          }
          break;
        }

        case MESSAGE_TYPES.SESSION_ENDED: {
          const msg = message as { sessionId: string };
          if (targetSessionId && msg.sessionId !== targetSessionId) return;
          if (sessionId && msg.sessionId !== sessionId) return;

          setSessionId(targetSessionId ?? null);
          setDjName(null);
          setCurrentTrack(null);
          clearHistory();
          resetLikes();
          setListenerCount(0);
          resetTempoVote();
          setSessionEnded(true);
          break;
        }

        case MESSAGE_TYPES.LISTENER_COUNT: {
          const count = (message as { count: number }).count;
          setListenerCount(count);
          break;
        }
      }
    };
  }, [
    socketRef,
    targetSessionId,
    sessionId,
    pollHandlers,
    tempoHandlers,
    announcementHandlers,
    trackHandlers,
    socialSignalHandlers,
    setSessionId,
    setDjName,
    setCurrentTrack,
    setListenerCount,
    clearHistory,
    fetchHistory,
    resetPoll,
    resetLikes,
    resetTempoVote,
  ]);

  // Return unified API
  return {
    status,
    currentTrack,
    djName,
    sessionId,
    history,
    likedTracks,
    listenerCount,
    tempoVote,
    activePoll,
    hasVotedOnPoll,
    announcement,
    sendLike,
    hasLiked,
    sendTempoRequest,
    voteOnPoll,
    sendReaction,
    dismissAnnouncement,
    onLikeReceived,
    sessionEnded,
    lastHeartbeat,
    pendingCount, // Number of likes queued for offline sync
  };
}
