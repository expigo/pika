/**
 * Hook for managing like state and offline queue
 * Handles sending likes, offline queuing, and localStorage persistence
 */

import { MESSAGE_TYPES, getTrackKey, type TrackInfo } from "@pika/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import type ReconnectingWebSocket from "reconnecting-websocket";
import { getOrCreateClientId } from "@/lib/client";
import { getStoredLikes, persistLikes } from "./storage";

interface UseLikeQueueProps {
  sessionId: string | null;
  socketRef: React.RefObject<ReconnectingWebSocket | null>;
}

interface UseLikeQueueReturn {
  likedTracks: Set<string>;
  sendLike: (track: TrackInfo) => boolean;
  hasLiked: (track: TrackInfo) => boolean;
  flushPendingLikes: () => void;
  resetLikes: () => void;
}

interface PendingLike {
  track: TrackInfo;
  sessionId: string;
}

export function useLikeQueue({ sessionId, socketRef }: UseLikeQueueProps): UseLikeQueueReturn {
  const [likedTracks, setLikedTracks] = useState<Set<string>>(() => getStoredLikes(sessionId));
  const pendingLikesRef = useRef<Set<string>>(new Set());

  // Load likes when session changes
  useEffect(() => {
    if (sessionId) {
      const stored = getStoredLikes(sessionId);
      setLikedTracks(stored);
    }
  }, [sessionId]);

  // Persist likes when they change
  useEffect(() => {
    if (sessionId && likedTracks.size > 0) {
      persistLikes(sessionId, likedTracks);
    }
  }, [likedTracks, sessionId]);

  // Reset likes (on session end)
  const resetLikes = useCallback(() => {
    setLikedTracks(new Set());
  }, []);

  // Check if a track has been liked
  const hasLiked = useCallback(
    (track: TrackInfo): boolean => {
      return likedTracks.has(getTrackKey(track));
    },
    [likedTracks],
  );

  // Flush pending likes when reconnecting
  const flushPendingLikes = useCallback(() => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    pendingLikesRef.current.forEach((pendingJson) => {
      try {
        const pending: PendingLike = JSON.parse(pendingJson);
        console.log("[Likes] Flushing pending like:", pending.track.title);

        socket.send(
          JSON.stringify({
            type: MESSAGE_TYPES.SEND_LIKE,
            clientId: getOrCreateClientId(),
            sessionId: pending.sessionId,
            payload: { track: pending.track },
          }),
        );
      } catch (e) {
        console.error("[Likes] Failed to flush pending like:", e);
      }
    });

    pendingLikesRef.current.clear();
  }, [socketRef]);

  // Send like for a track
  const sendLike = useCallback(
    (track: TrackInfo): boolean => {
      const trackKey = getTrackKey(track);

      // Don't allow duplicate likes
      if (likedTracks.has(trackKey)) {
        console.log("[Likes] Already liked:", track.title);
        return false;
      }

      // Optimistically update UI
      setLikedTracks((prev) => {
        const next = new Set(prev);
        next.add(trackKey);
        return next;
      });

      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN && sessionId) {
        socket.send(
          JSON.stringify({
            type: MESSAGE_TYPES.SEND_LIKE,
            clientId: getOrCreateClientId(),
            sessionId,
            payload: { track },
          }),
        );
        console.log("[Likes] Sent like for:", track.title);
      } else if (sessionId) {
        // Offline? Queue it!
        console.log("[Likes] Offline, queuing like for:", track.title);
        pendingLikesRef.current.add(JSON.stringify({ track, sessionId }));
      }

      return true;
    },
    [likedTracks, sessionId, socketRef],
  );

  return {
    likedTracks,
    sendLike,
    hasLiked,
    flushPendingLikes,
    resetLikes,
  };
}
