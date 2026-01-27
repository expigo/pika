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

import {
  getTrackKey,
  logger,
  MESSAGE_TYPES,
  parseWebSocketMessage,
  type TrackInfo,
} from "@pika/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  useWakeupSync,
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
    forceReconnect,
  } = useWebSocketConnection({
    targetSessionId,
  });

  // Resilience: Sync state when waking up from sleep (iOS fix)
  useWakeupSync({ forceReconnect });

  // Like queue (with IndexedDB persistence for offline likes)
  const {
    likedTracks,
    sendLike,
    removeLike,
    hasLiked,
    flushPendingLikes,
    resetLikes,
    pendingCount,
    isSaving,
  } = useLikeQueue({
    sessionId,
    socketRef,
  });

  // Handle reconnect (flush pending likes from IndexedDB)
  useEffect(() => {
    if (status === "connected") {
      // flushPendingLikes is now async but we fire-and-forget
      flushPendingLikes().catch((e) => {
        logger.error("[Live] Error flushing pending likes", e);
      });
    }
  }, [status, flushPendingLikes]);

  // Track history
  const { currentTrack, history, setCurrentTrack, clearHistory, fetchHistory, trackHandlers } =
    useTrackHistory({
      sessionId,
    });

  // Poll state
  const { activePoll, hasVotedOnPoll, voteOnPoll, resetPoll, pollHandlers } = usePollState({
    socketRef,
  });

  // Tempo vote
  const trackKey = useMemo(() => (currentTrack ? getTrackKey(currentTrack) : null), [currentTrack]);

  const { tempoVote, sendTempoRequest, resetTempoVote, tempoHandlers } = useTempoVote({
    sessionId,
    trackKey,
    socketRef,
  });

  // Announcements
  const { announcement, dismissAnnouncement, announcementHandlers } = useAnnouncement({
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
        logger.debug("[Live] Sent reaction", { reaction });
        return true;
      }
      return false;
    },
    [sessionId, socketRef],
  );

  // Explicitly track if the session was ended by the DJ
  const [sessionEnded, setSessionEnded] = useState(false);

  // Combine all feature handlers (memoized to prevent redundant object creation - H4)
  const featureHandlers = useMemo(
    () =>
      combineHandlers(
        pollHandlers,
        tempoHandlers,
        announcementHandlers,
        trackHandlers,
        socialSignalHandlers,
      ),
    [pollHandlers, tempoHandlers, announcementHandlers, trackHandlers, socialSignalHandlers],
  );

  // Session and message routing
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const clientId = getOrCreateClientId();

    // Main message handler
    const handleMessage = (event: MessageEvent) => {
      const message = parseWebSocketMessage(event.data);
      if (!message) {
        logger.error("[Live] Failed to parse message", { data: event.data });
        return;
      }

      logger.debug("[Live] Received", { type: message.type });

      // Check for PONG (heartbeat) - no processing needed in this hook
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
                fetchHistory(targetSession.sessionId, true);
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
                fetchHistory(session.sessionId, true);
              }
            }
          }
          break;
        }

        case MESSAGE_TYPES.SESSION_STARTED: {
          const msg = message as { sessionId: string; djName: string };
          if (targetSessionId && msg.sessionId !== targetSessionId) return;

          logger.info("[Live] Session started", { sessionId: msg.sessionId });
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
            fetchHistory(msg.sessionId, true);
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

    socket.addEventListener("message", handleMessage);

    return () => {
      socket.removeEventListener("message", handleMessage);
    };
  }, [
    socketRef,
    targetSessionId,
    sessionId,
    featureHandlers,
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
    removeLike,
    hasLiked,
    sendTempoRequest,
    voteOnPoll,
    sendReaction,
    dismissAnnouncement,
    onLikeReceived,
    sessionEnded,
    lastHeartbeat,
    pendingCount, // Number of likes queued for offline sync
    isSaving, // True during IndexedDB debounce window
    forceReconnect,
  };
}
