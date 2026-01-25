import { MESSAGE_TYPES, logger } from "@pika/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import type ReconnectingWebSocket from "reconnecting-websocket";
import { getOrCreateClientId } from "@/lib/client";
import type { MessageHandlers, TempoPreference, WebSocketMessage } from "./types";

interface UseTempoVoteProps {
  sessionId: string | null;
  trackKey: string | null;
  socketRef: React.RefObject<ReconnectingWebSocket | null>;
}

interface UseTempoVoteReturn {
  tempoVote: TempoPreference | null;
  sendTempoRequest: (preference: TempoPreference) => boolean;
  resetTempoVote: () => void;
  tempoHandlers: MessageHandlers;
}

export function useTempoVote({
  sessionId,
  trackKey,
  socketRef,
}: UseTempoVoteProps): UseTempoVoteReturn {
  const [tempoVote, setTempoVote] = useState<TempoPreference | null>(null);

  // Restore from localStorage on mount or track change (H2: Deferred)
  useEffect(() => {
    if (!sessionId || !trackKey) {
      setTempoVote(null);
      return;
    }

    // Defer the localStorage hit to prevent blocking the initial paint of track changes
    const timeoutId = setTimeout(() => {
      const storageKey = `pika_tempo_${sessionId}_${trackKey}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        setTempoVote(saved as TempoPreference);
      } else {
        setTempoVote(null);
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [sessionId, trackKey]);

  // Reset tempo vote (called on session end)
  const resetTempoVote = useCallback(() => {
    setTempoVote(null);
  }, []);

  // Send tempo preference - tapping same button again clears vote
  const sendTempoRequest = useCallback(
    (preference: TempoPreference): boolean => {
      if (!sessionId) {
        logger.debug("[Tempo] Cannot send: no session");
        return false;
      }

      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        logger.debug("[Tempo] Cannot send: socket not open");
        return false;
      }

      // Toggle off: if tapping the same preference, clear it
      const isToggleOff = tempoVote === preference;
      const effectivePref = isToggleOff ? "clear" : preference;
      const storageKey = trackKey ? `pika_tempo_${sessionId}_${trackKey}` : null;

      socket.send(
        JSON.stringify({
          type: "SEND_TEMPO_REQUEST",
          clientId: getOrCreateClientId(),
          sessionId,
          preference: effectivePref,
        }),
      );

      if (isToggleOff) {
        setTempoVote(null);
        if (storageKey) localStorage.removeItem(storageKey);
        logger.debug("[Tempo] Cleared vote");
      } else {
        setTempoVote(preference);
        if (storageKey) localStorage.setItem(storageKey, preference);
        logger.debug("[Tempo] Sent request", { preference });
      }

      return true;
    },
    [sessionId, socketRef, tempoVote, trackKey],
  );

  // Message handlers (memoized to prevent parent re-renders - H4)
  const tempoHandlers: MessageHandlers = useMemo(
    () => ({
      [MESSAGE_TYPES.TEMPO_RESET]: (message: WebSocketMessage) => {
        const msg = message as unknown as { sessionId: string };

        // Only reset if this is for our session
        if (msg.sessionId !== sessionId) {
          return;
        }

        logger.debug("[Tempo] Reset received");
        setTempoVote(null);
        // Note: We don't clear localStorage here because TEMPO_RESET usually
        // happens AFTER a track change, and our useEffect already handles track changes.
      },
    }),
    [sessionId],
  );

  return {
    tempoVote,
    sendTempoRequest,
    resetTempoVote,
    tempoHandlers,
  };
}
