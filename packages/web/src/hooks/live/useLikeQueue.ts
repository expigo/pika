/**
 * Hook for managing like state and offline queue
 * Uses IndexedDB (via idb-keyval) for persistent offline queue that survives page refresh
 * Uses localStorage for liked tracks state (already works well)
 */

import { getTrackKey, LIMITS, logger, MESSAGE_TYPES, type TrackInfo } from "@pika/shared";
import { del, get, keys, set } from "idb-keyval";
import { useCallback, useEffect, useRef, useState } from "react";
import type ReconnectingWebSocket from "reconnecting-websocket";
import { toast } from "sonner";
import { getOrCreateClientId } from "@/lib/client";
import { getStoredLikes, persistLikes } from "./storage";

interface UseLikeQueueProps {
  sessionId: string | null;
  socketRef: React.RefObject<ReconnectingWebSocket | null>;
}

interface UseLikeQueueReturn {
  likedTracks: Set<string>;
  sendLike: (track: TrackInfo) => boolean;
  removeLike: (track: TrackInfo) => void;
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
    logger.error("[Likes] Failed to load pending from IDB", e);
    return [];
  }
}

/**
 * Save pending likes to IndexedDB
 */
async function savePendingToIDB(sessionId: string, pending: PendingLike[]): Promise<void> {
  try {
    const key = getPendingKey(sessionId);
    if (pending.length === 0) {
      await del(key);
    } else {
      await set(key, pending);
    }
  } catch (e) {
    logger.error("[Likes] Failed to save pending to IDB", e);
  }
}

export function useLikeQueue({ sessionId, socketRef }: UseLikeQueueProps): UseLikeQueueReturn {
  const [likedTracks, setLikedTracks] = useState<Set<string>>(() => getStoredLikes(sessionId));
  const [pendingCount, setPendingCount] = useState(0);
  const pendingLikesRef = useRef<PendingLike[]>([]);
  const idbLoadedRef = useRef(false);
  const lastLikeTimeRef = useRef<number>(0);
  const consecutiveLikesRef = useRef<number>(0);
  const idbSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * 11/10 Optimization: Debounced IndexedDB writes to reduce background churn
   */
  const debouncedSavePending = useCallback((sessionId: string, pending: PendingLike[]) => {
    if (idbSaveTimeoutRef.current) clearTimeout(idbSaveTimeoutRef.current);

    idbSaveTimeoutRef.current = setTimeout(async () => {
      try {
        const key = getPendingKey(sessionId);
        if (pending.length === 0) {
          await del(key);
        } else {
          await set(key, pending);
        }
        idbSaveTimeoutRef.current = null;
      } catch (e) {
        logger.error("[Likes] Failed to save pending to IDB (debounced)", e);
      }
    }, 2000); // 2 second debounce per Principal recommendations
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (idbSaveTimeoutRef.current) clearTimeout(idbSaveTimeoutRef.current);
    };
  }, []);

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

      // 11/10 Conflict Resolution: Mark pending tracks as already liked in UI
      if (pending.length > 0) {
        setLikedTracks((prev) => {
          const next = new Set(prev);
          for (const p of pending) {
            next.add(getTrackKey(p.track));
          }
          return next;
        });
        logger.info("[Likes] Loaded pending likes from IndexedDB", { count: pending.length });
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
        logger.error("[Likes] Failed to clear pending from IDB", e);
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

    logger.info("[Likes] Flushing pending likes via batch", { count: pending.length });

    try {
      socket.send(
        JSON.stringify({
          type: MESSAGE_TYPES.SEND_BULK_LIKE,
          clientId: getOrCreateClientId(),
          sessionId: sessionId,
          payload: {
            tracks: pending.map((p) => p.track),
          },
        }),
      );

      logger.info("[Likes] Successfully sent batch of likes", { count: pending.length });

      // Clear pending
      pendingLikesRef.current = [];
      setPendingCount(0);
      if (idbSaveTimeoutRef.current) clearTimeout(idbSaveTimeoutRef.current);
      await savePendingToIDB(sessionId, []);
    } catch (e) {
      logger.error("[Likes] Failed to flush pending likes batch", e);
    }
  }, [socketRef, sessionId]);

  // M6: Comprehensive Cleanup for ALL sessions in IndexedDB
  useEffect(() => {
    const cleanupOrphanedSessions = async () => {
      try {
        const allKeys = await keys();
        const now = Date.now();
        const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
        let cleanedCount = 0;

        for (const key of allKeys) {
          const keyStr = String(key);
          if (keyStr.startsWith("pika_pending_likes_")) {
            const pending = await get<PendingLike[]>(key);
            if (!pending || pending.length === 0) {
              // Delete empty keys
              await del(key);
              cleanedCount++;
              continue;
            }

            // If the latest like in this bucket is > 7 days old, delete the whole bucket
            const latestLike = Math.max(...pending.map((p) => p.timestamp));
            if (now - latestLike > SEVEN_DAYS) {
              logger.info("[Likes] Purging orphaned session from IDB", { key: keyStr });
              await del(key);
              cleanedCount++;
            }
          }
        }

        if (cleanedCount > 0) {
          logger.info("[Likes] 🧹 Global IDB Cleanup removed orphaned session entries", {
            count: cleanedCount,
          });
        }
      } catch (e) {
        logger.error("[Likes] Global cleanup error", e);
      }
    };

    cleanupOrphanedSessions();
  }, []); // Run once on mount

  // Send like for a track
  const sendLike = useCallback(
    (track: TrackInfo): boolean => {
      const trackKey = getTrackKey(track);

      // Don't allow duplicate likes
      if (likedTracks.has(trackKey)) {
        logger.debug("[Likes] Already liked track", { title: track.title });
        return false;
      }

      // L4: Client-side rate limiting
      const now = Date.now();
      const timeSinceLastLike = now - lastLikeTimeRef.current;

      if (timeSinceLastLike < 60000) {
        // Within a 1 minute window
        consecutiveLikesRef.current++;
        if (consecutiveLikesRef.current > LIMITS.LIKE_RATE_LIMIT_MAX) {
          logger.warn("[Likes] Rate limit exceeded", { limit: LIMITS.LIKE_RATE_LIMIT_MAX });
          toast.warning("Whoa! Slow down... too many likes too fast 💓", {
            id: "like-rate-limit",
            duration: 3000,
          });
          return false;
        }
      } else {
        // Reset window
        lastLikeTimeRef.current = now;
        consecutiveLikesRef.current = 1;
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
        logger.info("[Likes] Sent like", { title: track.title });
      } else if (sessionId) {
        // Offline - queue it with persistence!
        logger.info("[Likes] Offline, queuing like", { title: track.title });

        const newPending: PendingLike = {
          track,
          sessionId,
          timestamp: Date.now(),
        };

        pendingLikesRef.current = [...pendingLikesRef.current, newPending];
        setPendingCount(pendingLikesRef.current.length);

        // Persist to IndexedDB (debounced)
        debouncedSavePending(sessionId, pendingLikesRef.current);
      }

      return true;
    },
    [likedTracks, sessionId, socketRef, debouncedSavePending],
  );

  // M7: Remove like (Undo)
  const removeLike = useCallback(
    (track: TrackInfo) => {
      const trackKey = getTrackKey(track);

      // 1. Remove from local UI state
      setLikedTracks((prev) => {
        const next = new Set(prev);
        next.delete(trackKey);
        return next;
      });

      // 2. Remove from pending offline queue if it's there
      const initialPendingCount = pendingLikesRef.current.length;
      pendingLikesRef.current = pendingLikesRef.current.filter(
        (p) => getTrackKey(p.track) !== trackKey,
      );

      if (pendingLikesRef.current.length !== initialPendingCount) {
        setPendingCount(pendingLikesRef.current.length);
        if (sessionId) {
          debouncedSavePending(sessionId, pendingLikesRef.current);
        }
        logger.info("[Likes] Removed like from pending queue", { title: track.title });
      }

      logger.info("[Likes] Local like removed", { title: track.title });

      // 11/10: Send "REMOVE_LIKE" to the server when online
      const socket = socketRef.current;
      if (socket?.readyState === WebSocket.OPEN && sessionId) {
        socket.send(
          JSON.stringify({
            type: MESSAGE_TYPES.REMOVE_LIKE,
            clientId: getOrCreateClientId(),
            sessionId,
            payload: { track },
          }),
        );
        logger.info("[Likes] Sent unlike notification to server", { title: track.title });
      }
    },
    [sessionId, socketRef, debouncedSavePending],
  );

  return {
    likedTracks,
    sendLike,
    removeLike,
    hasLiked,
    flushPendingLikes,
    resetLikes,
    pendingCount,
  };
}
