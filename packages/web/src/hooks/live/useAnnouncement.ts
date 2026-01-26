/**
 * Hook for managing DJ announcements
 * Handles display, auto-dismiss timer, and manual dismissal
 */

import { logger, MESSAGE_TYPES } from "@pika/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Announcement, MessageHandlers, WebSocketMessage } from "./types";

interface UseAnnouncementProps {
  sessionId: string | null;
}

interface UseAnnouncementReturn {
  announcement: Announcement | null;
  dismissAnnouncement: () => void;
  announcementHandlers: MessageHandlers;
}

export function useAnnouncement({ sessionId }: UseAnnouncementProps): UseAnnouncementReturn {
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);

  // Dismiss announcement (user closes the banner)
  const dismissAnnouncement = useCallback(() => {
    setAnnouncement(null);
  }, []);

  // Auto-dismiss when timer expires
  useEffect(() => {
    if (!announcement?.endsAt) return;

    const endTime = new Date(announcement.endsAt).getTime();
    const delay = endTime - Date.now();

    // Already expired - dismiss immediately
    if (delay <= 0) {
      setAnnouncement(null);
      return;
    }

    // Set timeout to dismiss when timer expires
    const timeout = setTimeout(() => {
      setAnnouncement(null);
    }, delay);

    return () => clearTimeout(timeout);
  }, [announcement?.endsAt]);

  // Message handlers for announcement-related messages (memoized to prevent parent re-renders - H4)
  const announcementHandlers: MessageHandlers = useMemo(
    () => ({
      [MESSAGE_TYPES.ANNOUNCEMENT_RECEIVED]: (message: WebSocketMessage) => {
        const msg = message as unknown as {
          sessionId: string;
          message: string;
          djName?: string;
          timestamp?: string;
          endsAt?: string;
        };

        // Only accept announcements for our session
        if (msg.sessionId !== sessionId) {
          logger.debug("[Announcement] Ignoring for different session", {
            msgSessionId: msg.sessionId,
            ourSessionId: sessionId,
          });
          return;
        }

        logger.info("[Announcement] Received", { message: msg.message });

        // Vibrate if supported
        try {
          navigator.vibrate?.(200);
        } catch {
          // Silently ignore - vibration blocked before user gesture
        }

        setAnnouncement({
          message: msg.message,
          djName: msg.djName,
          timestamp: msg.timestamp,
          endsAt: msg.endsAt,
        });
      },

      [MESSAGE_TYPES.ANNOUNCEMENT_CANCELLED]: (message: WebSocketMessage) => {
        const msg = message as unknown as { sessionId: string };

        // Only accept cancellations for our session
        if (msg.sessionId !== sessionId) {
          return;
        }

        logger.debug("[Announcement] Cancelled");
        setAnnouncement(null);
      },
    }),
    [sessionId],
  );

  return {
    announcement,
    dismissAnnouncement,
    announcementHandlers,
  };
}
