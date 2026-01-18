/**
 * Hook for managing tempo vote state
 * Handles voting with toggle behavior and TEMPO_RESET messages
 */

import { MESSAGE_TYPES } from "@pika/shared";
import { useCallback, useState } from "react";
import type ReconnectingWebSocket from "reconnecting-websocket";
import { getOrCreateClientId } from "@/lib/client";
import type { MessageHandlers, TempoPreference, WebSocketMessage } from "./types";

interface UseTempoVoteProps {
  sessionId: string | null;
  socketRef: React.RefObject<ReconnectingWebSocket | null>;
}

interface UseTempoVoteReturn {
  tempoVote: TempoPreference | null;
  sendTempoRequest: (preference: TempoPreference) => boolean;
  resetTempoVote: () => void;
  tempoHandlers: MessageHandlers;
}

export function useTempoVote({ sessionId, socketRef }: UseTempoVoteProps): UseTempoVoteReturn {
  const [tempoVote, setTempoVote] = useState<TempoPreference | null>(null);

  // Reset tempo vote (called on track change or session end)
  const resetTempoVote = useCallback(() => {
    setTempoVote(null);
  }, []);

  // Send tempo preference - tapping same button again clears vote
  const sendTempoRequest = useCallback(
    (preference: TempoPreference): boolean => {
      if (!sessionId) {
        console.log("[Tempo] Cannot send: no session");
        return false;
      }

      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        console.log("[Tempo] Cannot send: socket not open");
        return false;
      }

      // Toggle off: if tapping the same preference, clear it
      const isToggleOff = tempoVote === preference;

      if (isToggleOff) {
        socket.send(
          JSON.stringify({
            type: "SEND_TEMPO_REQUEST",
            clientId: getOrCreateClientId(),
            sessionId,
            preference: "clear",
          }),
        );
        setTempoVote(null);
        console.log("[Tempo] Cleared vote");
      } else {
        socket.send(
          JSON.stringify({
            type: "SEND_TEMPO_REQUEST",
            clientId: getOrCreateClientId(),
            sessionId,
            preference,
          }),
        );
        setTempoVote(preference);
        console.log("[Tempo] Sent request:", preference);
      }

      return true;
    },
    [sessionId, socketRef, tempoVote],
  );

  // Message handlers
  const tempoHandlers: MessageHandlers = {
    [MESSAGE_TYPES.TEMPO_RESET]: (message: WebSocketMessage) => {
      const msg = message as unknown as { sessionId: string };

      // Only reset if this is for our session
      if (msg.sessionId !== sessionId) {
        return;
      }

      console.log("[Tempo] Reset received");
      setTempoVote(null);
    },
  };

  return {
    tempoVote,
    sendTempoRequest,
    resetTempoVote,
    tempoHandlers,
  };
}
