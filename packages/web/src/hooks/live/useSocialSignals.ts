/**
 * Hook for handling real-time social signals (hearts/likes)
 * Designed for high-frequency updates without triggering React re-renders.
 * Uses a subscription pattern so components (like Canvas) can listen directly.
 */

import { MESSAGE_TYPES, type TrackInfo } from "@pika/shared";
import { useCallback, useRef, useMemo } from "react";
import type { MessageHandlers, WebSocketMessage } from "./types";

interface UseSocialSignalsProps {
  sessionId: string | null;
}

export type LikeHandler = (track: TrackInfo, count?: number) => void;

interface UseSocialSignalsReturn {
  /**
   * Register a callback to be fired whenever a LIKE_RECEIVED message arrives.
   * Returns a cleanup function to unsubscribe.
   */
  onLikeReceived: (callback: LikeHandler) => () => void;
  socialSignalHandlers: MessageHandlers;
}

export function useSocialSignals({ sessionId }: UseSocialSignalsProps): UseSocialSignalsReturn {
  // Store subscribers in a ref to avoid re-renders when they change
  const subscribersRef = useRef<Set<LikeHandler>>(new Set());

  // Registration function exposed to consumers
  const onLikeReceived = useCallback((callback: LikeHandler) => {
    subscribersRef.current.add(callback);
    return () => {
      subscribersRef.current.delete(callback);
    };
  }, []);

  // WebSocket message handlers (memoized to prevent parent re-renders - H4)
  const socialSignalHandlers: MessageHandlers = useMemo(
    () => ({
      [MESSAGE_TYPES.LIKE_RECEIVED]: (message: WebSocketMessage) => {
        const msg = message as unknown as {
          sessionId?: string; // Optional in some legacy paths, but usually present
          payload: {
            track: TrackInfo;
            count?: number; // Server might send aggregated count
          };
        };

        // Optimistic safety check: if message has a sessionId and it doesn't match, ignore.
        // (Note: Shared types define payload structure clearly)
        if (msg.sessionId && msg.sessionId !== sessionId) {
          return;
        }

        const { track, count } = msg.payload;

        // Notify all subscribers (e.g. the Canvas renderer)
        subscribersRef.current.forEach((callback) => {
          try {
            callback(track, count);
          } catch (e) {
            console.error("[SocialSignals] Error in subscriber:", e);
          }
        });
      },
    }),
    [sessionId],
  );

  return {
    onLikeReceived,
    socialSignalHandlers,
  };
}
