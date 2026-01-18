/**
 * Hook for managing like state and offline queue
 * Uses IndexedDB (via idb-keyval) for persistent offline queue that survives page refresh
 * Uses localStorage for liked tracks state (already works well)
 */

import { getTrackKey, MESSAGE_TYPES, type TrackInfo } from "@pika/shared";
import { get, set, del } from "idb-keyval";
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
  flushPendingLikes: () => Promise<void>;
  resetLikes: () => void;
  pendingCount: number;
}

interface PendingLike {
  track: TrackInfo;
  sessionId: string;
  timestamp: number;
}

// IndexedDB key for pending likes
const getPendingKey = (sessionId: string) => `pika_pending_likes_${sessionId}`;

/**
 * Load pending likes from IndexedDB
 */
async function loadPendingFromIDB(sessionId: string): Promise<PendingLike[]> {
  try {
    const stored = await get<PendingLike[]>(getPendingKey(sessionId));
    return stored || [];
  } catch (e) {
    console.error("[Likes] Failed to load pending from IDB:", e);
    return [];
  }
}

/**
 * Save pending likes to IndexedDB
 */
async function savePendingToIDB(sessionId: string, pending: PendingLike[]): Promise<void> {
  try {
    if (pending.length === 0) {
      await del(getPendingKey(sessionId));
    } else {
      await set(getPendingKey(sessionId), pending);
    }
  } catch (e) {
    console.error("[Likes] Failed to save pending to IDB:", e);
  }
}

export function useLikeQueue({ sessionId, socketRef }: UseLikeQueueProps): UseLikeQueueReturn {
  const [likedTracks, setLikedTracks] = useState<Set<string>>(() => getStoredLikes(sessionId));
  const [pendingCount, setPendingCount] = useState(0);
  const pendingLikesRef = useRef<PendingLike[]>([]);
  const idbLoadedRef = useRef(false);

  // Load likes and pending from storage when session changes
  useEffect(() => {
    if (!sessionId) return;

    // Load liked tracks from localStorage
    const stored = getStoredLikes(sessionId);
    setLikedTracks(stored);

    // Load pending likes from IndexedDB
    const loadPending = async () => {
      const pending = await loadPendingFromIDB(sessionId);
      pendingLikesRef.current = pending;
      setPendingCount(pending.length);
      idbLoadedRef.current = true;

      if (pending.length > 0) {
        console.log(`[Likes] Loaded ${pending.length} pending likes from IndexedDB`);
      }
    };

    loadPending();
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
    pendingLikesRef.current = [];
    setPendingCount(0);

    // Clear IndexedDB for this session
    if (sessionId) {
      del(getPendingKey(sessionId)).catch((e) => {
        console.error("[Likes] Failed to clear pending from IDB:", e);
      });
    }
  }, [sessionId]);

  // Check if a track has been liked
  const hasLiked = useCallback(
    (track: TrackInfo): boolean => {
      return likedTracks.has(getTrackKey(track));
    },
    [likedTracks],
  );

  // Flush pending likes when reconnecting
  const flushPendingLikes = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN || !sessionId) {
      return;
    }

    const pending = [...pendingLikesRef.current];
    if (pending.length === 0) return;

    console.log(`[Likes] Flushing ${pending.length} pending likes...`);

    const successfullyFlushed: number[] = [];

    for (let i = 0; i < pending.length; i++) {
      const like = pending[i];
      try {
        socket.send(
          JSON.stringify({
            type: MESSAGE_TYPES.SEND_LIKE,
            clientId: getOrCreateClientId(),
            sessionId: like.sessionId,
            payload: { track: like.track },
          }),
        );
        successfullyFlushed.push(i);
        console.log("[Likes] Flushed pending like:", like.track.title);
      } catch (e) {
        console.error("[Likes] Failed to flush pending like:", e);
        // Stop flushing on error - will retry on next reconnect
        break;
      }
    }

    // Remove flushed items from pending
    if (successfullyFlushed.length > 0) {
      pendingLikesRef.current = pending.filter((_, i) => !successfullyFlushed.includes(i));
      setPendingCount(pendingLikesRef.current.length);

      // Persist updated pending list
      await savePendingToIDB(sessionId, pendingLikesRef.current);
    }
  }, [socketRef, sessionId]);

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
        // Online - send immediately
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
        // Offline - queue it with persistence!
        console.log("[Likes] Offline, queuing like for:", track.title);

        const newPending: PendingLike = {
          track,
          sessionId,
          timestamp: Date.now(),
        };

        pendingLikesRef.current = [...pendingLikesRef.current, newPending];
        setPendingCount(pendingLikesRef.current.length);

        // Persist to IndexedDB (fire and forget, but log errors)
        savePendingToIDB(sessionId, pendingLikesRef.current);
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
    pendingCount,
  };
}
