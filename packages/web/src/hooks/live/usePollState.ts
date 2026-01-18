/**
 * Hook for managing poll state
 * Handles poll lifecycle, voting with optimistic updates, and server confirmations
 */

import { MESSAGE_TYPES } from "@pika/shared";
import { useCallback, useState, useRef } from "react";
import type ReconnectingWebSocket from "reconnecting-websocket";
import { getOrCreateClientId } from "@/lib/client";
import type { MessageHandlers, PollState, WebSocketMessage } from "./types";

interface UsePollStateProps {
  socketRef: React.RefObject<ReconnectingWebSocket | null>;
}

interface UsePollStateReturn {
  activePoll: PollState | null;
  hasVotedOnPoll: boolean;
  voteOnPoll: (optionIndex: number) => boolean;
  resetPoll: () => void;
  pollHandlers: MessageHandlers;
}

export function usePollState({ socketRef }: UsePollStateProps): UsePollStateReturn {
  const [activePoll, setActivePoll] = useState<PollState | null>(null);
  const [hasVotedOnPoll, setHasVotedOnPoll] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset poll state
  const resetPoll = useCallback(() => {
    if (pollTimerRef.current) {
      clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setActivePoll(null);
    setHasVotedOnPoll(false);
  }, []);

  // Vote on active poll
  const voteOnPoll = useCallback(
    (optionIndex: number): boolean => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== WebSocket.OPEN) {
        return false;
      }

      if (!activePoll || hasVotedOnPoll) {
        return false;
      }

      socket.send(
        JSON.stringify({
          type: "VOTE_ON_POLL",
          pollId: activePoll.id,
          optionIndex,
          clientId: getOrCreateClientId(),
        }),
      );

      // Optimistically update local state
      setActivePoll((prev) => {
        if (!prev) return prev;
        const newVotes = [...prev.votes];
        newVotes[optionIndex] = (newVotes[optionIndex] || 0) + 1;
        return {
          ...prev,
          votes: newVotes,
          totalVotes: prev.totalVotes + 1,
        };
      });
      setHasVotedOnPoll(true);

      console.log("[Poll] Voted:", activePoll.options[optionIndex]);
      return true;
    },
    [activePoll, hasVotedOnPoll, socketRef],
  );

  // Message handlers
  const pollHandlers: MessageHandlers = {
    [MESSAGE_TYPES.POLL_STARTED]: (message: WebSocketMessage) => {
      // Clear any pending dismissal timer when a NEW poll starts
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }

      const msg = message as unknown as {
        pollId: number;
        question: string;
        options: string[];
        endsAt?: string;
        votes?: number[];
        totalVotes?: number;
        hasVoted?: boolean;
      };

      console.log(
        "[Poll] Started:",
        msg.question,
        msg.totalVotes ? `(${msg.totalVotes} votes)` : "(new)",
      );

      const isNewPoll = !activePoll || activePoll.id !== msg.pollId;
      const votes =
        msg.votes ||
        (isNewPoll ? new Array(msg.options.length).fill(0) : (activePoll?.votes ?? []));
      const totalVotes = msg.totalVotes ?? (isNewPoll ? 0 : (activePoll?.totalVotes ?? 0));
      const hasVoted = msg.hasVoted ?? (isNewPoll ? false : hasVotedOnPoll);

      setActivePoll({
        id: msg.pollId,
        question: msg.question,
        options: msg.options,
        votes,
        totalVotes,
        endsAt: msg.endsAt,
      });
      setHasVotedOnPoll(hasVoted);
    },

    [MESSAGE_TYPES.POLL_UPDATE]: (message: WebSocketMessage) => {
      const msg = message as unknown as {
        pollId: number;
        votes: number[];
        totalVotes: number;
      };

      setActivePoll((prev) => {
        if (!prev || prev.id !== msg.pollId) return prev;
        return {
          ...prev,
          votes: msg.votes,
          totalVotes: msg.totalVotes,
        };
      });
    },

    [MESSAGE_TYPES.POLL_ENDED]: () => {
      console.log("[Poll] Ended - showing results for 10s");
      // Clear existing timer if any
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);

      pollTimerRef.current = setTimeout(() => {
        resetPoll();
        pollTimerRef.current = null;
      }, 10000);

      // We should ideally track these timers to clear them if a NEW poll starts
      // For now, resetPoll is enough if called by POLL_STARTED
    },

    [MESSAGE_TYPES.CANCEL_POLL]: () => {
      console.log("[Poll] Cancelled");
      resetPoll();
    },

    [MESSAGE_TYPES.VOTE_REJECTED]: (message: WebSocketMessage) => {
      const msg = message as unknown as {
        pollId: number;
        reason: string;
        votes?: number[];
        totalVotes?: number;
      };

      console.log("[Poll] Vote rejected:", msg.reason);

      setActivePoll((prev) => {
        if (!prev || prev.id !== msg.pollId) return prev;
        if (msg.votes) {
          return {
            ...prev,
            votes: msg.votes,
            totalVotes: msg.totalVotes ?? prev.totalVotes,
          };
        }
        return prev;
      });

      // If already voted, mark as such
      if (msg.reason === "Already voted") {
        setHasVotedOnPoll(true);
      }
    },

    [MESSAGE_TYPES.VOTE_CONFIRMED]: (message: WebSocketMessage) => {
      const msg = message as unknown as {
        pollId: number;
        votes: number[];
        totalVotes: number;
      };

      console.log("[Poll] Vote confirmed");

      setActivePoll((prev) => {
        if (!prev || prev.id !== msg.pollId) return prev;
        return {
          ...prev,
          votes: msg.votes,
          totalVotes: msg.totalVotes,
        };
      });
      setHasVotedOnPoll(true);
    },

    [MESSAGE_TYPES.POLL_ID_UPDATED]: (message: WebSocketMessage) => {
      const msg = message as unknown as {
        oldPollId: number;
        newPollId: number;
      };

      console.log("[Poll] ID updated:", msg.oldPollId, "->", msg.newPollId);

      setActivePoll((prev) => {
        if (!prev || prev.id !== msg.oldPollId) return prev;
        return { ...prev, id: msg.newPollId };
      });
    },
  };

  return {
    activePoll,
    hasVotedOnPoll,
    voteOnPoll,
    resetPoll,
    pollHandlers,
  };
}
