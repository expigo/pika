"use client";

import { parseWebSocketMessage, type TrackInfo } from "@pika/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import ReconnectingWebSocket from "reconnecting-websocket";

// Get WebSocket URL dynamically based on page location
function getWebSocketUrl(): string {
  if (process.env.NEXT_PUBLIC_CLOUD_WS_URL) {
    return process.env.NEXT_PUBLIC_CLOUD_WS_URL;
  }

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:3001/ws`;
  }

  return "ws://localhost:3001/ws";
}

// Get API base URL for REST calls
function getApiBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_CLOUD_API_URL) {
    return process.env.NEXT_PUBLIC_CLOUD_API_URL;
  }

  if (typeof window !== "undefined") {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    return `${protocol}//${hostname}:3001`;
  }

  return "http://localhost:3001";
}

// ============================================================================
// Persistent Client ID - survives page reloads
// ============================================================================
const CLIENT_ID_KEY = "pika_client_id";

function getOrCreateClientId(): string {
  if (typeof window === "undefined") {
    return `server_${Date.now()}`;
  }

  let clientId = localStorage.getItem(CLIENT_ID_KEY);
  if (!clientId) {
    // Generate a UUID-like ID
    clientId = `client_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    localStorage.setItem(CLIENT_ID_KEY, clientId);
  }
  return clientId;
}

export type ConnectionStatus = "connecting" | "connected" | "disconnected";

// History track with timestamp
export interface HistoryTrack extends TrackInfo {
  id?: number;
  playedAt?: string;
}

interface LiveState {
  status: ConnectionStatus;
  currentTrack: TrackInfo | null;
  djName: string | null;
  sessionId: string | null;
  history: HistoryTrack[];
  likedTracks: Set<string>; // Track keys that user has liked (artist:title)
  listenerCount: number; // Number of connected dancers
  tempoVote: "faster" | "slower" | "perfect" | null; // Current user's tempo vote
  // Poll state
  activePoll: {
    id: number;
    question: string;
    options: string[];
    votes: number[]; // Live vote counts (only shown after voting)
    totalVotes: number; // Total votes cast
    endsAt?: string;
  } | null;
  hasVotedOnPoll: boolean; // Whether current user has voted
}

const MAX_HISTORY = 5;

function getTrackKey(track: TrackInfo): string {
  return `${track.artist}:${track.title}`;
}

// ============================================================================
// Persist liked tracks in localStorage (per session)
// ============================================================================
const LIKED_TRACKS_KEY = "pika_liked_tracks";

function loadLikedTracks(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = localStorage.getItem(LIKED_TRACKS_KEY);
    if (stored) {
      return new Set(JSON.parse(stored));
    }
  } catch (e) {
    console.error("Failed to load liked tracks:", e);
  }
  return new Set();
}

function saveLikedTracks(tracks: Set<string>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LIKED_TRACKS_KEY, JSON.stringify([...tracks]));
  } catch (e) {
    console.error("Failed to save liked tracks:", e);
  }
}

function clearLikedTracks(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(LIKED_TRACKS_KEY);
}

/**
 * Hook for listening to live DJ sessions via WebSocket.
 *
 * @param targetSessionId - Optional. If provided, only listen to this specific session.
 *                          If undefined, auto-join the first active session.
 */
export function useLiveListener(targetSessionId?: string) {
  const [state, setState] = useState<LiveState>(() => ({
    status: "connecting",
    currentTrack: null,
    djName: null,
    // If targeting a specific session, set it immediately
    sessionId: targetSessionId ?? null,
    history: [],
    likedTracks: loadLikedTracks(), // Restore from localStorage
    listenerCount: 0,
    tempoVote: null,
    activePoll: null,
    hasVotedOnPoll: false,
  }));

  const socketRef = useRef<ReconnectingWebSocket | null>(null);
  const historyFetchedRef = useRef<string | null>(null); // Prevent duplicate history fetches
  const discoveredSessionRef = useRef<string | null>(null); // Prevent duplicate subscribes on homepage

  // Fetch history from REST API (with deduplication)
  const fetchHistory = useCallback(async (sessionId: string) => {
    // Skip if we've already fetched history for this session
    if (historyFetchedRef.current === sessionId) {
      // Already fetched, skip silently
      return;
    }

    try {
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/api/session/${sessionId}/history`);
      if (response.ok) {
        const tracks: HistoryTrack[] = await response.json();
        historyFetchedRef.current = sessionId; // Mark as fetched
        setState((prev) => ({
          ...prev,
          // Skip the first track (it's the current one)
          history: tracks.slice(1),
        }));
        console.log("[Listener] Fetched history:", tracks.length, "tracks");
      }
    } catch (e) {
      console.error("[Listener] Failed to fetch history:", e);
    }
  }, []);

  useEffect(() => {
    const wsUrl = getWebSocketUrl();
    const clientId = getOrCreateClientId();
    console.log("[Listener] Connecting to:", wsUrl, "as client:", clientId);
    if (targetSessionId) {
      console.log("[Listener] Targeting specific session:", targetSessionId);
    }

    const socket = new ReconnectingWebSocket(wsUrl, [], {
      connectionTimeout: 5000,
      maxRetries: Infinity,
      maxReconnectionDelay: 10000,
      minReconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.onopen = () => {
      console.log("[Listener] Connected to cloud");
      setState((prev) => ({ ...prev, status: "connected" }));
      // Send SUBSCRIBE with persistent clientId for like tracking and sessionId for listener count
      socket.send(
        JSON.stringify({
          type: "SUBSCRIBE",
          clientId,
          sessionId: targetSessionId, // Include session for per-session listener count
        }),
      );

      // If targeting a specific session, fetch its history immediately
      if (targetSessionId) {
        fetchHistory(targetSessionId);
      }
    };

    socket.onmessage = (event) => {
      const message = parseWebSocketMessage(event.data);
      if (!message) {
        console.error("[Listener] Failed to parse message:", event.data);
        return;
      }

      console.log("[Listener] Received:", message);

      switch (message.type) {
        case "SESSIONS_LIST": {
          if (message.sessions && message.sessions.length > 0) {
            if (targetSessionId) {
              // Find the specific session we're targeting
              const targetSession = message.sessions.find(
                (s: { sessionId: string }) => s.sessionId === targetSessionId,
              );
              if (targetSession) {
                setState((prev) => ({
                  ...prev,
                  sessionId: targetSession.sessionId,
                  djName: targetSession.djName,
                  currentTrack: targetSession.currentTrack || null,
                }));
                // Fetch history for target session
                fetchHistory(targetSession.sessionId);
              }
            } else {
              // Auto-join first session if not targeting specific one
              const session = message.sessions[0];
              setState((prev) => ({
                ...prev,
                sessionId: session.sessionId,
                djName: session.djName,
                currentTrack: session.currentTrack || null,
              }));

              // Only subscribe once per discovered session (prevents infinite loop)
              if (discoveredSessionRef.current !== session.sessionId) {
                discoveredSessionRef.current = session.sessionId;

                // Send SUBSCRIBE with the discovered session ID to be counted
                // This ensures homepage visitors are counted as listeners
                socketRef.current?.send(
                  JSON.stringify({
                    type: "SUBSCRIBE",
                    clientId,
                    sessionId: session.sessionId,
                  }),
                );

                // Fetch initial history
                fetchHistory(session.sessionId);
              }
            }
          }
          break;
        }

        case "SESSION_STARTED": {
          // Filter: Only handle if matches target or no target set (homepage)
          if (targetSessionId && message.sessionId !== targetSessionId) {
            return;
          }

          console.log(
            "[Listener] New session started:",
            message.sessionId,
            "current:",
            state.sessionId,
          );

          setState((prev) => ({
            ...prev,
            sessionId: message.sessionId || null,
            djName: message.djName || null,
            currentTrack: null,
            history: [], // Clear history for new session
            activePoll: null, // Clear poll for new session
            hasVotedOnPoll: false,
          }));

          // If homepage (no target), ALWAYS subscribe to new session
          // This handles the case where we were on an old session and DJ started new one
          if (!targetSessionId && message.sessionId) {
            console.log("[Listener] Switching to new session:", message.sessionId);
            discoveredSessionRef.current = message.sessionId;
            historyFetchedRef.current = null; // Allow history re-fetch

            socketRef.current?.send(
              JSON.stringify({
                type: "SUBSCRIBE",
                clientId,
                sessionId: message.sessionId,
              }),
            );

            fetchHistory(message.sessionId);
          }
          break;
        }

        case "NOW_PLAYING": {
          // Filter: Only handle if matches target or no target set
          if (targetSessionId && message.sessionId !== targetSessionId) {
            return;
          }

          if (message.track) {
            setState((prev) => {
              // Get the previous track before updating
              const prevTrack = prev.currentTrack;

              // Build new history by prepending previous track (if exists and different)
              let newHistory = prev.history;
              if (
                prevTrack &&
                (prevTrack.artist !== message.track.artist ||
                  prevTrack.title !== message.track.title)
              ) {
                // Prepend previous track to history, keep max 5
                newHistory = [
                  { ...prevTrack, playedAt: new Date().toISOString() },
                  ...prev.history,
                ].slice(0, MAX_HISTORY);
              }

              return {
                ...prev,
                sessionId: message.sessionId || prev.sessionId,
                djName: message.djName || prev.djName,
                currentTrack: message.track || null,
                history: newHistory,
              };
            });
          }
          break;
        }

        case "TRACK_STOPPED": {
          // Filter: Only handle if matches target or current session
          if (targetSessionId && message.sessionId !== targetSessionId) {
            return;
          }

          setState((prev) => {
            // Only handle if this is for our session
            if (prev.sessionId && message.sessionId !== prev.sessionId) {
              return prev;
            }

            // Move current track to history if exists
            let newHistory = prev.history;
            if (prev.currentTrack) {
              newHistory = [
                { ...prev.currentTrack, playedAt: new Date().toISOString() },
                ...prev.history,
              ].slice(0, MAX_HISTORY);
            }

            return {
              ...prev,
              currentTrack: null,
              history: newHistory,
            };
          });
          break;
        }

        case "SESSION_ENDED": {
          // Filter: Only handle if matches target or current session
          if (targetSessionId && message.sessionId !== targetSessionId) {
            return;
          }

          // Clear liked tracks for new session
          clearLikedTracks();

          setState((prev) => {
            // Only reset if this is for our session
            if (prev.sessionId && message.sessionId !== prev.sessionId) {
              return prev;
            }

            return {
              ...prev,
              sessionId: targetSessionId ?? null, // Keep target if specified
              djName: null,
              currentTrack: null,
              history: [],
              likedTracks: new Set(), // Reset likes
              listenerCount: 0, // Reset count
              tempoVote: null, // Reset tempo vote
            };
          });
          break;
        }

        case "LISTENER_COUNT": {
          const count = (message as { type: "LISTENER_COUNT"; count: number }).count;
          setState((prev) => ({ ...prev, listenerCount: count }));
          break;
        }

        case "TEMPO_RESET": {
          // Server is telling us to reset tempo vote (track changed)
          const resetMsg = message as { type: "TEMPO_RESET"; sessionId: string };

          // Only reset if this is for our session
          if (targetSessionId && resetMsg.sessionId !== targetSessionId) {
            return;
          }

          setState((prev) => {
            if (prev.sessionId && resetMsg.sessionId !== prev.sessionId) {
              return prev;
            }
            return {
              ...prev,
              tempoVote: null,
            };
          });
          break;
        }

        case "POLL_STARTED": {
          // New poll from DJ (or existing poll for new subscriber)
          const pollMsg = message as {
            type: "POLL_STARTED";
            pollId: number;
            question: string;
            options: string[];
            endsAt?: string;
            votes?: number[]; // Sent for existing polls
            totalVotes?: number;
            hasVoted?: boolean; // Whether this client has already voted
          };

          console.log(
            "[Listener] Poll started:",
            pollMsg.question,
            pollMsg.totalVotes
              ? `(${pollMsg.totalVotes} votes, hasVoted: ${pollMsg.hasVoted})`
              : "(new)",
          );

          setState((prev) => {
            // If this is the same poll we already have, don't reset vote state
            const isNewPoll = !prev.activePoll || prev.activePoll.id !== pollMsg.pollId;

            // Use server-provided votes if available (for existing polls), otherwise use local or initialize
            const votes =
              pollMsg.votes ||
              (isNewPoll
                ? (new Array(pollMsg.options.length).fill(0) as number[])
                : prev.activePoll!.votes);
            const totalVotes = pollMsg.totalVotes ?? (isNewPoll ? 0 : prev.activePoll!.totalVotes);

            // Use server-provided hasVoted if available, otherwise preserve local state
            const hasVotedOnPoll = pollMsg.hasVoted ?? (isNewPoll ? false : prev.hasVotedOnPoll);

            return {
              ...prev,
              activePoll: {
                id: pollMsg.pollId,
                question: pollMsg.question,
                options: pollMsg.options,
                votes,
                totalVotes,
                endsAt: pollMsg.endsAt,
              },
              hasVotedOnPoll,
            };
          });
          break;
        }

        case "POLL_UPDATE": {
          // Live vote counts (only relevant if user has already voted)
          const updateMsg = message as {
            type: "POLL_UPDATE";
            pollId: number;
            votes: number[];
            totalVotes: number;
          };

          setState((prev) => {
            // Only update if we have an active poll matching this ID
            if (!prev.activePoll || prev.activePoll.id !== updateMsg.pollId) {
              return prev;
            }
            return {
              ...prev,
              activePoll: {
                ...prev.activePoll,
                votes: updateMsg.votes,
                totalVotes: updateMsg.totalVotes,
              },
            };
          });
          break;
        }

        case "POLL_ENDED": {
          // Poll ended by DJ or auto-close
          console.log("[Listener] Poll ended");

          setState((prev) => ({
            ...prev,
            activePoll: null,
            hasVotedOnPoll: false,
          }));
          break;
        }

        case "VOTE_REJECTED": {
          // Server rejected our vote (duplicate or invalid)
          const rejectMsg = message as {
            type: "VOTE_REJECTED";
            pollId: number;
            reason: string;
            votes?: number[];
            totalVotes?: number;
          };
          console.log("[Listener] Vote rejected:", rejectMsg.reason);

          setState((prev) => {
            if (!prev.activePoll || prev.activePoll.id !== rejectMsg.pollId) {
              return prev;
            }
            // Rollback: if server sent correct votes, use them
            // Also mark as already voted since server says we already voted
            return {
              ...prev,
              hasVotedOnPoll: rejectMsg.reason === "Already voted",
              activePoll: rejectMsg.votes
                ? {
                    ...prev.activePoll,
                    votes: rejectMsg.votes,
                    totalVotes: rejectMsg.totalVotes ?? prev.activePoll.totalVotes,
                  }
                : prev.activePoll,
            };
          });
          break;
        }

        case "VOTE_CONFIRMED": {
          // Server confirmed our vote
          const confirmMsg = message as {
            type: "VOTE_CONFIRMED";
            pollId: number;
            optionIndex: number;
            votes: number[];
            totalVotes: number;
          };
          console.log("[Listener] Vote confirmed");

          setState((prev) => {
            if (!prev.activePoll || prev.activePoll.id !== confirmMsg.pollId) {
              return prev;
            }
            // Update with server's authoritative vote counts
            return {
              ...prev,
              hasVotedOnPoll: true,
              activePoll: {
                ...prev.activePoll,
                votes: confirmMsg.votes,
                totalVotes: confirmMsg.totalVotes,
              },
            };
          });
          break;
        }

        case "POLL_ID_UPDATED": {
          // Poll ID was updated after DB persistence
          const idUpdateMsg = message as {
            type: "POLL_ID_UPDATED";
            oldPollId: number;
            newPollId: number;
          };

          console.log(
            "[Listener] Poll ID updated:",
            idUpdateMsg.oldPollId,
            "->",
            idUpdateMsg.newPollId,
          );

          setState((prev) => {
            if (!prev.activePoll || prev.activePoll.id !== idUpdateMsg.oldPollId) {
              return prev;
            }
            return {
              ...prev,
              activePoll: {
                ...prev.activePoll,
                id: idUpdateMsg.newPollId,
              },
            };
          });
          break;
        }
      }
    };

    socket.onclose = () => {
      console.log("[Listener] Disconnected from cloud");
      setState((prev) => ({ ...prev, status: "disconnected" }));
    };

    socket.onerror = () => {
      console.error("[Listener] Connection error");
    };

    return () => {
      socket.close();
    };
    // Note: fetchHistory is stable (no deps), don't include in deps array to avoid infinite loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetSessionId]);

  // Send a like for the current track (returns true if sent, false if already liked)
  const sendLike = useCallback(
    (track: { artist: string; title: string }): boolean => {
      const trackKey = getTrackKey(track as TrackInfo);

      // Check if already liked
      if (state.likedTracks.has(trackKey)) {
        console.log("[Listener] Already liked:", track.title);
        return false;
      }

      if (socketRef.current?.readyState === WebSocket.OPEN && state.sessionId) {
        socketRef.current.send(
          JSON.stringify({
            type: "SEND_LIKE",
            clientId: getOrCreateClientId(),
            sessionId: state.sessionId, // Include session for correct attribution
            payload: { track },
          }),
        );

        // Optimistically mark as liked and persist to localStorage
        const newLikedTracks = new Set([...state.likedTracks, trackKey]);
        setState((prev) => ({
          ...prev,
          likedTracks: newLikedTracks,
        }));
        saveLikedTracks(newLikedTracks);

        console.log("[Listener] Sent like for:", track.title);
        return true;
      }
      return false;
    },
    [state.likedTracks, state.sessionId],
  );

  // Check if a track has been liked
  const hasLiked = useCallback(
    (track: { artist: string; title: string }): boolean => {
      return state.likedTracks.has(getTrackKey(track as TrackInfo));
    },
    [state.likedTracks],
  );

  // Send tempo preference (faster/slower/perfect) - tapping same button again clears vote
  const sendTempoRequest = useCallback(
    (preference: "faster" | "slower" | "perfect"): boolean => {
      if (!state.sessionId) {
        console.log("[Listener] Cannot send tempo request: no session");
        return false;
      }

      // Toggle off: if tapping the same preference, clear it
      const isToggleOff = state.tempoVote === preference;

      if (socketRef.current?.readyState === WebSocket.OPEN) {
        if (isToggleOff) {
          // Send a "clear" message (we'll use "none" as a special value)
          socketRef.current.send(
            JSON.stringify({
              type: "SEND_TEMPO_REQUEST",
              clientId: getOrCreateClientId(),
              sessionId: state.sessionId,
              preference: "clear", // Special value to remove vote
            }),
          );

          // Clear local state
          setState((prev) => ({
            ...prev,
            tempoVote: null,
          }));

          console.log("[Listener] Cleared tempo vote");
        } else {
          // Normal vote
          socketRef.current.send(
            JSON.stringify({
              type: "SEND_TEMPO_REQUEST",
              clientId: getOrCreateClientId(),
              sessionId: state.sessionId,
              preference,
            }),
          );

          // Update local state with the vote
          setState((prev) => ({
            ...prev,
            tempoVote: preference,
          }));

          console.log("[Listener] Sent tempo request:", preference);
        }
        return true;
      }
      return false;
    },
    [state.sessionId, state.tempoVote],
  );

  // Vote on active poll
  const voteOnPoll = useCallback(
    (optionIndex: number): boolean => {
      if (
        socketRef.current?.readyState === WebSocket.OPEN &&
        state.activePoll &&
        !state.hasVotedOnPoll
      ) {
        socketRef.current.send(
          JSON.stringify({
            type: "VOTE_ON_POLL",
            pollId: state.activePoll.id,
            optionIndex,
            clientId: getOrCreateClientId(),
          }),
        );

        // Optimistically update local state to show vote immediately
        setState((prev) => {
          if (!prev.activePoll) return prev;

          const newVotes = [...prev.activePoll.votes];
          newVotes[optionIndex] = (newVotes[optionIndex] || 0) + 1;

          return {
            ...prev,
            hasVotedOnPoll: true,
            activePoll: {
              ...prev.activePoll,
              votes: newVotes,
              totalVotes: prev.activePoll.totalVotes + 1,
            },
          };
        });

        console.log("[Listener] Voted on poll:", state.activePoll.options[optionIndex]);
        return true;
      }
      return false;
    },
    [state.activePoll, state.hasVotedOnPoll],
  );

  return { ...state, sendLike, hasLiked, sendTempoRequest, voteOnPoll };
}
